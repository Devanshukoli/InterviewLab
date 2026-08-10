import { getLLMProvider } from '../../services/llm';
import { tracer, getAITelemetryAttributes, recordMetric, logger } from '../../observability';
import { AppError } from '../../middleware/error_handling';
import { PromptService } from '../../services/prompt.service';
import { 
  EvaluationResult, 
  AnswerEvaluation, 
  EvaluationInput 
} from '../../../src/shared/types';

export type { EvaluationResult, AnswerEvaluation, EvaluationInput };

/**
 * Base error for EvaluationAgent operational failures
 */
export class EvaluationAgentError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, statusCode, details);
    this.name = 'EvaluationAgentError';
  }
}

/**
 * Thrown when the candidate answer is missing or empty
 */
export class EvaluationEmptyAnswerError extends EvaluationAgentError {
  constructor(message: string = 'Candidate answer text is required for evaluation', details?: any) {
    super(message, 400, details);
    this.name = 'EvaluationEmptyAnswerError';
  }
}

/**
 * Thrown when LLM output cannot be parsed as JSON after retries
 */
export class EvaluationJSONParseError extends EvaluationAgentError {
  constructor(message: string = 'Failed to parse JSON response from LLM after retry', details?: any) {
    super(message, 422, details);
    this.name = 'EvaluationJSONParseError';
  }
}

/**
 * Thrown when LLM JSON output fails schema validation
 */
export class EvaluationValidationError extends EvaluationAgentError {
  constructor(message: string = 'LLM output failed schema validation after retry', details?: any) {
    super(message, 422, details);
    this.name = 'EvaluationValidationError';
  }
}

/**
 * Thrown when the underlying LLM provider throws an exception
 */
export class EvaluationLLMError extends EvaluationAgentError {
  constructor(message: string = 'LLM provider failed during answer evaluation', details?: any) {
    super(message, 502, details);
    this.name = 'EvaluationLLMError';
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
 * Helper to validate and normalize parsed JSON object against EvaluationResult schema
 */
export function validateAndNormalizeEvaluationResult(obj: any): {
  isValid: boolean;
  data?: EvaluationResult;
  errors: string[];
} {
  const errors: string[] = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { isValid: false, errors: ['Response is not a valid JSON object'] };
  }

  // Score validation (0-100)
  let score = 0;
  if (typeof obj.score === 'number' && !isNaN(obj.score)) {
    score = Math.min(100, Math.max(0, Math.round(obj.score)));
  } else if (typeof obj.score === 'string') {
    const parsed = parseFloat(obj.score);
    score = !isNaN(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0;
  } else {
    errors.push('score must be a valid number between 0 and 100');
  }

  // String Array Normalizer
  const parseStringArray = (val: any, fieldName: string): string[] => {
    if (Array.isArray(val)) {
      return val
        .map(item => {
          if (typeof item === 'string') return item.trim();
          if (typeof item === 'number' || typeof item === 'boolean') return String(item);
          if (typeof item === 'object' && item !== null) {
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

  const strengths = parseStringArray(obj.strengths, 'strengths');
  const weaknesses = parseStringArray(obj.weaknesses, 'weaknesses');
  const missingConcepts = parseStringArray(obj.missingConcepts ?? obj.missingPoints, 'missingConcepts');

  // Feedback validation
  const feedback = typeof obj.feedback === 'string' ? obj.feedback.trim() : '';

  // Ideal Answer validation
  const idealAnswer = typeof obj.idealAnswer === 'string' && obj.idealAnswer.trim()
    ? obj.idealAnswer.trim()
    : (typeof obj.suggestedAnswer === 'string' ? obj.suggestedAnswer.trim() : '');

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      score,
      strengths,
      weaknesses,
      missingConcepts,
      feedback,
      idealAnswer
    }
  };
}

/**
 * EvaluationAgent grades candidate interview responses against questions and expected topics.
 */
export class EvaluationAgent {
  private providerName: string;

  constructor(providerName?: string) {
    this.providerName = providerName || 'gemini';
  }

  /**
   * Evaluates a candidate's answer against a question and expected topics.
   * Supports both object options `{ question, candidateAnswer, expectedTopics }` and positional args.
   */
  async evaluateAnswer(
    questionParam: string | { question?: string; questionText?: string; expectedTopics?: string[]; expectedConcepts?: string[]; [key: string]: any } | EvaluationInput,
    candidateAnswerParam?: string,
    expectedTopicsParam?: string[],
    userId?: string
  ): Promise<EvaluationResult> {
    let questionText = '';
    let candidateAnswer = '';
    let expectedTopics: string[] = [];

    // Parse input arguments flexible format
    if (
      questionParam &&
      typeof questionParam === 'object' &&
      'candidateAnswer' in questionParam &&
      typeof (questionParam as any).candidateAnswer === 'string'
    ) {
      const inputObj = questionParam as EvaluationInput;
      candidateAnswer = inputObj.candidateAnswer;
      expectedTopics = inputObj.expectedTopics || [];

      if (typeof inputObj.question === 'string') {
        questionText = inputObj.question;
      } else if (inputObj.question && typeof inputObj.question === 'object') {
        const qObj = inputObj.question as any;
        questionText = qObj.question || qObj.questionText || '';
        if (!expectedTopics.length) {
          expectedTopics = qObj.expectedTopics || qObj.expectedConcepts || [];
        }
      }
    } else {
      candidateAnswer = candidateAnswerParam || '';
      expectedTopics = expectedTopicsParam || [];

      if (typeof questionParam === 'string') {
        questionText = questionParam;
      } else if (questionParam && typeof questionParam === 'object') {
        const qObj = questionParam as any;
        questionText = qObj.question || qObj.questionText || '';
        if (!expectedTopics.length) {
          expectedTopics = qObj.expectedTopics || qObj.expectedConcepts || [];
        }
      }
    }

    if (!candidateAnswer || typeof candidateAnswer !== 'string' || !candidateAnswer.trim()) {
      throw new EvaluationEmptyAnswerError('Candidate answer text is required for evaluation');
    }

    const aiAttrs = getAITelemetryAttributes({ llmProvider: this.providerName, agentName: 'evaluation-agent' });
    const span = tracer.startSpan('evaluation-agent:evaluateAnswer', undefined, undefined, aiAttrs);
    const evalStartTime = Date.now();

    try {
      const provider = await getLLMProvider(this.providerName, (questionParam as any)?.userId || userId);
      const { data: promptData } = PromptService.getActivePrompt('evaluation-agent');
      const systemInstruction = promptData.systemInstruction;
      const initialPrompt = PromptService.interpolate(promptData.initialPrompt, {
        questionText: questionText.trim(),
        expectedTopics,
        candidateAnswer: candidateAnswer.trim()
      });

      let rawOutput: string;
      try {
        const llmStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 1 });
        rawOutput = await provider.generate(initialPrompt, systemInstruction);
        const llmDuration = Date.now() - llmStartTime;
        recordMetric.recordLLMRequestDuration(llmDuration, { agent: 'evaluation-agent', 'llm.attempt': 1, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 1, 'response.length': rawOutput.length });
      } catch (llmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'evaluation-agent', 'llm.attempt': 1, 'llm.provider': this.providerName, error: llmErr.message });
        logger.error('❌ [EvaluationAgent] LLM generation call failed on first attempt:', llmErr);
        throw new EvaluationLLMError(`LLM generation failed: ${llmErr.message}`, { cause: llmErr });
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
        logger.warn('🔮 [EvaluationAgent] Initial JSON parsing failed. Attempting retry once...', parseErr.message);
      }

      // First Attempt - Validation
      if (parseSuccess) {
        const validation = validateAndNormalizeEvaluationResult(parsedJson);
        if (validation.isValid && validation.data) {
          recordMetric.recordEvaluationCompleted(1, { 'evaluation.score': validation.data.score });
          recordMetric.recordEvaluationDuration(Date.now() - evalStartTime, { agent: 'evaluation-agent' });
          span.end('OK', {
            'evaluation.score': validation.data.score,
            'evaluation.strengths_count': validation.data.strengths.length,
            'evaluation.missing_concepts_count': validation.data.missingConcepts.length
          });
          return validation.data;
        }
        span.addEvent('Validation Failed', { 'llm.attempt': 1, 'errors.count': validation.errors?.length || 0 });
        logger.warn('🔮 [EvaluationAgent] Initial schema validation failed. Attempting retry once...', validation.errors);
      }

      // RETRY ONCE if parsing or validation failed
      span.addEvent('Retry Triggered', { 'retry.attempt': 2 });
      logger.info('🔮 [EvaluationAgent] Retrying LLM call once with strict output instructions...');

      const retryPrompt = `CRITICAL CORRECTION REQUIRED: Your previous output was not valid JSON or failed schema validation.

Re-evaluate the candidate's answer and return STRICTLY a valid JSON object with NO markdown, NO \`\`\` code fences, and NO intro/outro text.

Required Schema:
{
  "score": 85,
  "strengths": ["Strength 1"],
  "weaknesses": ["Weakness 1"],
  "missingConcepts": ["Missing Concept 1"],
  "feedback": "Constructive feedback string",
  "idealAnswer": "Ideal answer string"
}

Question: "${questionText.trim()}"
Expected Topics: ${JSON.stringify(expectedTopics)}
Candidate Answer: "${candidateAnswer.trim()}"`;

      let retryRawOutput: string;
      try {
        const retryStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 2 });
        retryRawOutput = await provider.generate(retryPrompt, systemInstruction);
        const retryDuration = Date.now() - retryStartTime;
        recordMetric.recordLLMRequestDuration(retryDuration, { agent: 'evaluation-agent', 'llm.attempt': 2, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 2, 'response.length': retryRawOutput.length });
      } catch (retryLlmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'evaluation-agent', 'llm.attempt': 2, 'llm.provider': this.providerName, error: retryLlmErr.message });
        logger.error('❌ [EvaluationAgent] LLM generation call failed on retry:', retryLlmErr);
        throw new EvaluationLLMError(`LLM generation failed on retry: ${retryLlmErr.message}`, { cause: retryLlmErr });
      }

      // Second Attempt - Parse
      let retryParsedJson: any;
      try {
        const retryCleaned = cleanJsonResponse(retryRawOutput);
        retryParsedJson = JSON.parse(retryCleaned);
        span.addEvent('JSON Parsed', { 'llm.attempt': 2 });
      } catch (retryParseErr: any) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'reason': 'json_parse_error' });
        logger.error('❌ [EvaluationAgent] JSON parsing failed on retry attempt:', retryParseErr);
        throw new EvaluationJSONParseError('Failed to parse JSON response from LLM after retry', {
          rawOutput: retryRawOutput,
          parseError: retryParseErr.message
        });
      }

      // Second Attempt - Validate
      const retryValidation = validateAndNormalizeEvaluationResult(retryParsedJson);
      if (!retryValidation.isValid || !retryValidation.data) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'errors.count': retryValidation.errors?.length || 0 });
        logger.error('❌ [EvaluationAgent] Schema validation failed on retry attempt:', retryValidation.errors);
        throw new EvaluationValidationError('LLM output failed schema validation after retry', {
          errors: retryValidation.errors,
          parsedOutput: retryParsedJson
        });
      }

      span.addEvent('Retry Success', { 'retry.attempt': 2 });
      recordMetric.recordEvaluationCompleted(1, { 'evaluation.score': retryValidation.data.score });
      recordMetric.recordEvaluationDuration(Date.now() - evalStartTime, { agent: 'evaluation-agent', retry_used: true });

      span.end('OK', {
        'evaluation.score': retryValidation.data.score,
        'evaluation.strengths_count': retryValidation.data.strengths.length,
        'evaluation.missing_concepts_count': retryValidation.data.missingConcepts.length,
        'retry_used': true
      });

      return retryValidation.data;
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  /**
   * Alias evaluate method
   */
  async evaluate(
    question: any,
    candidateAnswer: string,
    expectedTopics?: string[]
  ): Promise<EvaluationResult> {
    return this.evaluateAnswer(question, candidateAnswer, expectedTopics);
  }
}

// Export default instance
export const defaultEvaluationAgent = new EvaluationAgent();
