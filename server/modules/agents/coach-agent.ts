import { getLLMProvider } from '../../services/llm';
import { tracer, getAITelemetryAttributes, recordMetric, logger } from '../../observability';
import { AppError } from '../../middleware/error_handling';
import { PromptService } from '../../services/prompt.service';
import { 
  EvaluationResult, 
  AnswerEvaluation, 
  GeneratedQuestion,
  CoachAnalysisResult,
  CoachInput,
  CoachingReport
} from '../../../src/shared/types';

export type { CoachAnalysisResult, CoachInput, CoachingReport };

/**
 * Base error for CoachAgent operational failures
 */
export class CoachAgentError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, statusCode, details);
    this.name = 'CoachAgentError';
  }
}

/**
 * Thrown when LLM output cannot be parsed as JSON after retries
 */
export class CoachJSONParseError extends CoachAgentError {
  constructor(message: string = 'Failed to parse JSON response from LLM after retry', details?: any) {
    super(message, 422, details);
    this.name = 'CoachJSONParseError';
  }
}

/**
 * Thrown when LLM JSON output fails schema validation
 */
export class CoachValidationError extends CoachAgentError {
  constructor(message: string = 'LLM output failed schema validation after retry', details?: any) {
    super(message, 422, details);
    this.name = 'CoachValidationError';
  }
}

/**
 * Thrown when the underlying LLM provider throws an exception
 */
export class CoachLLMError extends CoachAgentError {
  constructor(message: string = 'LLM provider failed during coaching report generation', details?: any) {
    super(message, 502, details);
    this.name = 'CoachLLMError';
  }
}

/**
 * Helper to strip markdown code blocks and extract JSON object
 */
export function cleanJsonResponse(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText.trim();

  // Remove markdown code fences
  cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '').trim();

  // Find object boundaries
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned.trim();
}

/**
 * Helper to validate and normalize parsed JSON object against CoachAnalysisResult schema
 */
export function validateAndNormalizeCoachResult(obj: any): {
  isValid: boolean;
  data?: CoachAnalysisResult;
  errors: string[];
} {
  const errors: string[] = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { isValid: false, errors: ['Response is not a valid JSON object'] };
  }

  // overallPerformance
  const overallPerformance = typeof obj.overallPerformance === 'string'
    ? obj.overallPerformance.trim()
    : (typeof obj.coachingSummary === 'string' ? obj.coachingSummary.trim() : '');

  // recommendedDifficulty
  const recommendedDifficulty = typeof obj.recommendedDifficulty === 'string'
    ? obj.recommendedDifficulty.trim()
    : 'Medium';

  // String Array Normalizer
  const parseStringArray = (val: any, fieldName: string): string[] => {
    if (Array.isArray(val)) {
      return val
        .map(item => {
          if (typeof item === 'string') return item.trim();
          if (typeof item === 'number' || typeof item === 'boolean') return String(item);
          if (typeof item === 'object' && item !== null) {
            if ('topic' in item && typeof item.topic === 'string') return item.topic.trim();
            return Object.values(item)
              .filter(v => v !== null && v !== undefined)
              .map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
              .join(' - ');
          }
          return '';
        })
        .filter(str => str.length > 0);
    }
    if (typeof val === 'string' && val.trim().length > 0) {
      return [val.trim()];
    }
    if (val !== undefined && val !== null) {
      errors.push(`${fieldName} must be an array of strings`);
    }
    return [];
  };

  const topicsToStudy = parseStringArray(obj.topicsToStudy ?? obj.recommendedTopicsToStudy, 'topicsToStudy');
  const nextSteps = parseStringArray(obj.nextSteps, 'nextSteps');

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      overallPerformance,
      topicsToStudy,
      recommendedDifficulty,
      nextSteps
    }
  };
}

/**
 * CoachAgent analyzes evaluation results and interview history to generate actionable coaching guidance.
 */
export class CoachAgent {
  private providerName: string;

  constructor(providerName?: string) {
    this.providerName = providerName || 'gemini';
  }

  /**
   * Generates coaching feedback and next steps based on candidate evaluation results and interview history.
   */
  async generateCoachingReport(
    evaluationsOrInput: any,
    previousHistory?: any,
    userId?: string
  ): Promise<CoachAnalysisResult> {
    let evaluationsData: any;
    let interviewHistoryData: any = null;

    if (
      evaluationsOrInput &&
      typeof evaluationsOrInput === 'object' &&
      !Array.isArray(evaluationsOrInput) &&
      'evaluations' in evaluationsOrInput
    ) {
      const input = evaluationsOrInput as CoachInput;
      evaluationsData = input.evaluations;
      interviewHistoryData = input.interviewHistory ?? previousHistory ?? null;
    } else {
      evaluationsData = evaluationsOrInput;
      interviewHistoryData = previousHistory ?? null;
    }

    const aiAttrs = getAITelemetryAttributes({ llmProvider: this.providerName, agentName: 'coach-agent' });
    const span = tracer.startSpan('coach-agent:generateCoachingReport', undefined, undefined, aiAttrs);

    try {
      const provider = await getLLMProvider(this.providerName, (evaluationsOrInput as any)?.userId || userId);
      const { data: promptData } = PromptService.getActivePrompt('coach-agent');
      const systemInstruction = promptData.systemInstruction;
      const historySection = interviewHistoryData 
        ? `Previous Interview History:\n${JSON.stringify(interviewHistoryData, null, 2)}` 
        : 'No previous interview history available.';
      const initialPrompt = PromptService.interpolate(promptData.initialPrompt, {
        evaluationsData,
        historySection
      });

      let rawOutput: string;
      try {
        const llmStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 1 });
        rawOutput = await provider.generate(initialPrompt, systemInstruction);
        const llmDuration = Date.now() - llmStartTime;
        recordMetric.recordLLMRequestDuration(llmDuration, { agent: 'coach-agent', 'llm.attempt': 1, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 1, 'response.length': rawOutput.length });
      } catch (llmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'coach-agent', 'llm.attempt': 1, 'llm.provider': this.providerName, error: llmErr.message });
        logger.error('❌ [CoachAgent] LLM generation call failed on first attempt:', llmErr);
        throw new CoachLLMError(`LLM generation failed: ${llmErr.message}`, { cause: llmErr });
      }

      // First Attempt - Clean & Parse
      let parsedJson: any;
      let parseSuccess = false;

      try {
        const cleaned = cleanJsonResponse(rawOutput);
        parsedJson = JSON.parse(cleaned);
        parseSuccess = true;
        span.addEvent('JSON Parsed', { 'llm.attempt': 1 });
      } catch (parseErr: any) {
        span.addEvent('Validation Failed', { 'llm.attempt': 1, 'reason': 'json_parse_error' });
        logger.warn('🔮 [CoachAgent] Initial JSON parsing failed. Attempting retry once...', parseErr.message);
      }

      // First Attempt - Validation
      if (parseSuccess) {
        const validation = validateAndNormalizeCoachResult(parsedJson);
        if (validation.isValid && validation.data) {
          span.end('OK', {
            'coach.topics_count': validation.data.topicsToStudy.length,
            'coach.recommended_difficulty': validation.data.recommendedDifficulty
          });
          return validation.data;
        }
        span.addEvent('Validation Failed', { 'llm.attempt': 1, 'errors.count': validation.errors?.length || 0 });
        logger.warn('🔮 [CoachAgent] Initial schema validation failed. Attempting retry once...', validation.errors);
      }

      // RETRY ONCE if parsing or validation failed
      span.addEvent('Retry Triggered', { 'retry.attempt': 2 });
      logger.info('🔮 [CoachAgent] Retrying LLM call once with strict output instructions...');

      const retryPrompt = `CRITICAL CORRECTION REQUIRED: Your previous output was not valid JSON or failed schema validation.

Re-analyze the candidate evaluation results and return STRICTLY a valid JSON object with NO markdown, NO \`\`\` code fences, and NO intro/outro text.

Required Schema:
{
  "overallPerformance": "Overall performance summary",
  "topicsToStudy": ["Topic to study"],
  "recommendedDifficulty": "Medium",
  "nextSteps": ["Next step"]
}

Evaluation Results:
${JSON.stringify(evaluationsData)}`;

      let retryRawOutput: string;
      try {
        const retryStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 2 });
        retryRawOutput = await provider.generate(retryPrompt, systemInstruction);
        const retryDuration = Date.now() - retryStartTime;
        recordMetric.recordLLMRequestDuration(retryDuration, { agent: 'coach-agent', 'llm.attempt': 2, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 2, 'response.length': retryRawOutput.length });
      } catch (retryLlmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'coach-agent', 'llm.attempt': 2, 'llm.provider': this.providerName, error: retryLlmErr.message });
        logger.error('❌ [CoachAgent] LLM generation call failed on retry:', retryLlmErr);
        throw new CoachLLMError(`LLM generation failed on retry: ${retryLlmErr.message}`, { cause: retryLlmErr });
      }

      // Second Attempt - Parse
      let retryParsedJson: any;
      try {
        const retryCleaned = cleanJsonResponse(retryRawOutput);
        retryParsedJson = JSON.parse(retryCleaned);
        span.addEvent('JSON Parsed', { 'llm.attempt': 2 });
      } catch (retryParseErr: any) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'reason': 'json_parse_error' });
        logger.error('❌ [CoachAgent] JSON parsing failed on retry attempt:', retryParseErr);
        throw new CoachJSONParseError('Failed to parse JSON response from LLM after retry', {
          rawOutput: retryRawOutput,
          parseError: retryParseErr.message
        });
      }

      // Second Attempt - Validate
      const retryValidation = validateAndNormalizeCoachResult(retryParsedJson);
      if (!retryValidation.isValid || !retryValidation.data) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'errors.count': retryValidation.errors?.length || 0 });
        logger.error('❌ [CoachAgent] Schema validation failed on retry attempt:', retryValidation.errors);
        throw new CoachValidationError('LLM output failed schema validation after retry', {
          errors: retryValidation.errors,
          parsedOutput: retryParsedJson
        });
      }

      span.addEvent('Retry Success', { 'retry.attempt': 2 });

      span.end('OK', {
        'coach.topics_count': retryValidation.data.topicsToStudy.length,
        'coach.recommended_difficulty': retryValidation.data.recommendedDifficulty,
        'retry_used': true
      });

      return retryValidation.data;
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  /**
   * Alias method for convenience
   */
  async analyze(evaluations: any, previousHistory?: any): Promise<CoachAnalysisResult> {
    return this.generateCoachingReport(evaluations, previousHistory);
  }
}

// Export default instance
export const defaultCoachAgent = new CoachAgent();
