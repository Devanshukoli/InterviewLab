import { getLLMProvider } from '../../services/llm';
import { tracer, getAITelemetryAttributes, recordMetric, logger } from '../../observability';
import { AppError } from '../../middleware/error_handling';
import { PromptService } from '../../services/prompt.service';
import { 
  ResumeAnalysisResult, 
  ResumeProfile, 
  GapAnalysisResult, 
  GapAnalysis,
  QuestionItem,
  QuestionGenerationResult,
  QuestionGenerationInput,
  GeneratedQuestion
} from '../../../src/shared/types';

export type { QuestionItem, QuestionGenerationResult, QuestionGenerationInput, GeneratedQuestion };

/**
 * Base error for QuestionAgent operational failures
 */
export class QuestionAgentError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, statusCode, details);
    this.name = 'QuestionAgentError';
  }
}

/**
 * Thrown when candidate resume data is missing or invalid
 */
export class QuestionEmptyResumeError extends QuestionAgentError {
  constructor(message: string = 'Resume analysis data is required to generate interview questions', details?: any) {
    super(message, 400, details);
    this.name = 'QuestionEmptyResumeError';
  }
}

/**
 * Thrown when LLM output cannot be parsed as JSON after retries
 */
export class QuestionJSONParseError extends QuestionAgentError {
  constructor(message: string = 'Failed to parse JSON response from LLM after retry', details?: any) {
    super(message, 422, details);
    this.name = 'QuestionJSONParseError';
  }
}

/**
 * Thrown when LLM JSON output fails schema validation
 */
export class QuestionValidationError extends QuestionAgentError {
  constructor(message: string = 'LLM output failed schema validation after retry', details?: any) {
    super(message, 422, details);
    this.name = 'QuestionValidationError';
  }
}

/**
 * Thrown when the underlying LLM provider throws an exception
 */
export class QuestionLLMError extends QuestionAgentError {
  constructor(message: string = 'LLM provider failed during question generation', details?: any) {
    super(message, 502, details);
    this.name = 'QuestionLLMError';
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
 * Helper to validate and normalize parsed JSON object against QuestionGenerationResult schema
 */
export function validateAndNormalizeQuestionResult(
  obj: any,
  fallbackInterviewType: string = 'technical',
  fallbackDifficulty: string = 'medium'
): {
  isValid: boolean;
  data?: QuestionGenerationResult;
  errors: string[];
} {
  const errors: string[] = [];

  if (!obj || typeof obj !== 'object') {
    return { isValid: false, errors: ['Response is not a valid JSON object'] };
  }

  // Handle case where LLM returned array directly instead of { questions: [...] }
  let questionsArray: any[] = [];
  if (Array.isArray(obj)) {
    questionsArray = obj;
  } else if (Array.isArray(obj.questions)) {
    questionsArray = obj.questions;
  } else {
    return { isValid: false, errors: ['Output JSON must contain a "questions" array'] };
  }

  if (questionsArray.length === 0) {
    return { isValid: false, errors: ['"questions" array cannot be empty'] };
  }

  const normalizedQuestions: QuestionItem[] = [];

  for (let idx = 0; idx < questionsArray.length; idx++) {
    const q = questionsArray[idx];
    if (!q || typeof q !== 'object') {
      errors.push(`Question at index ${idx} is not an object`);
      continue;
    }

    const id = typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q-${idx + 1}`;
    const questionText = typeof q.question === 'string' ? q.question.trim() : (typeof q.questionText === 'string' ? q.questionText.trim() : '');

    if (!questionText) {
      errors.push(`Question at index ${idx} has no question text`);
    }

    const category = typeof q.category === 'string' && q.category.trim()
      ? q.category.trim()
      : (typeof q.type === 'string' && q.type.trim() ? q.type.trim() : (typeof q.topic === 'string' && q.topic.trim() ? q.topic.trim() : fallbackInterviewType));

    const difficulty = typeof q.difficulty === 'string' && q.difficulty.trim()
      ? q.difficulty.trim()
      : fallbackDifficulty;

    // Expected topics parsing
    let expectedTopics: string[] = [];
    const topicsSource = q.expectedTopics ?? q.expectedConcepts ?? q.topics;

    if (Array.isArray(topicsSource)) {
      expectedTopics = topicsSource
        .map((item: any) => (typeof item === 'string' ? item.trim() : String(item)))
        .filter((str: string) => str.length > 0);
    } else if (typeof topicsSource === 'string' && topicsSource.trim()) {
      expectedTopics = [topicsSource.trim()];
    }

    normalizedQuestions.push({
      id,
      question: questionText,
      category,
      difficulty,
      expectedTopics
    });
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      questions: normalizedQuestions
    }
  };
}

/**
 * QuestionAgent synthesizes structured interview questions based on resume, gap analysis, and session params.
 */
export class QuestionAgent {
  private providerName: string;

  constructor(providerName?: string) {
    this.providerName = providerName || 'gemini';
  }

  /**
   * Generates structured interview questions.
   */
  async generateQuestions(
    inputOrResume: QuestionGenerationInput | ResumeAnalysisResult | ResumeProfile | any,
    optionalGap?: GapAnalysisResult | GapAnalysis | any | null,
    interviewTypeParam: string = 'technical',
    difficultyParam: string = 'medium',
    experienceLevelParam: string = 'mid',
    numberOfQuestionsParam: number = 5,
    userIdParam?: string
  ): Promise<QuestionGenerationResult> {
    let resumeData: any;
    let gapData: any = null;
    let interviewType = interviewTypeParam;
    let difficulty = difficultyParam;
    let experienceLevel = experienceLevelParam;
    let numberOfQuestions = numberOfQuestionsParam;
    let userId = userIdParam;

    // Determine parameter style (Object vs Positional)
    if (inputOrResume && typeof inputOrResume === 'object' && 'resume' in inputOrResume) {
      const input = inputOrResume as QuestionGenerationInput;
      resumeData = input.resume;
      gapData = input.gap ?? null;
      interviewType = input.interviewType || interviewTypeParam;
      difficulty = input.difficulty || difficultyParam;
      experienceLevel = input.experienceLevel || experienceLevelParam;
      numberOfQuestions = input.numberOfQuestions || numberOfQuestionsParam;
      userId = (input as any).userId || userIdParam;
    } else {
      resumeData = inputOrResume;
      gapData = optionalGap ?? null;
    }

    if (!resumeData) {
      throw new QuestionEmptyResumeError('Resume analysis input is required to generate interview questions');
    }

    const questionCount = Math.min(Math.max(Number(numberOfQuestions) || 5, 1), 15);
    const aiAttrs = getAITelemetryAttributes({
      llmProvider: this.providerName,
      agentName: 'question-agent',
      interviewType,
      difficulty,
      experienceLevel
    });
    const span = tracer.startSpan('question-agent:generateQuestions', undefined, undefined, aiAttrs);
    const questionStartTime = Date.now();

    try {
      const provider = await getLLMProvider(this.providerName, userId);
      const { data: promptData } = PromptService.getActivePrompt('question-agent');
      const systemInstruction = promptData.systemInstruction;
      const gapSection = gapData 
        ? `Gap Analysis / Skill Assessment:\n${JSON.stringify(gapData, null, 2)}` 
        : 'No explicit Job Description gap assessment provided.';
      const initialPrompt = PromptService.interpolate(promptData.initialPrompt, {
        questionCount,
        resumeData,
        gapSection,
        interviewType,
        difficulty,
        experienceLevel
      });

      let rawOutput: string;
      try {
        const llmStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 1 });
        rawOutput = await provider.generate(initialPrompt, systemInstruction);
        const llmDuration = Date.now() - llmStartTime;
        recordMetric.recordLLMRequestDuration(llmDuration, { agent: 'question-agent', 'llm.attempt': 1, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 1, 'response.length': rawOutput.length });
      } catch (llmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'question-agent', 'llm.attempt': 1, 'llm.provider': this.providerName, error: llmErr.message });
        logger.error('❌ [QuestionAgent] LLM generation call failed on first attempt:', llmErr);
        throw new QuestionLLMError(`LLM generation failed: ${llmErr.message}`, { cause: llmErr });
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
        logger.warn('🔮 [QuestionAgent] Initial JSON parsing failed. Attempting retry once...', parseErr.message);
      }

      // First Attempt - Validation
      if (parseSuccess) {
        const validation = validateAndNormalizeQuestionResult(parsedJson, interviewType, difficulty);
        if (validation.isValid && validation.data) {
          recordMetric.recordQuestionsGenerated(validation.data.questions.length, { 'interview.type': interviewType, 'difficulty': difficulty });
          recordMetric.recordQuestionGenerationDuration(Date.now() - questionStartTime, { agent: 'question-agent', 'interview.type': interviewType, difficulty });
          span.end('OK', {
            'questions.count': validation.data.questions.length,
            'questions.interview_type': interviewType,
            'questions.difficulty': difficulty
          });
          return validation.data;
        }
        span.addEvent('Validation Failed', { 'llm.attempt': 1, 'errors.count': validation.errors?.length || 0 });
        logger.warn('🔮 [QuestionAgent] Initial schema validation failed. Attempting retry once...', validation.errors);
      }

      // RETRY ONCE if parsing or validation failed
      span.addEvent('Retry Triggered', { 'retry.attempt': 2 });
      logger.info('🔮 [QuestionAgent] Retrying LLM call once with strict output instructions...');

      const retryPrompt = `CRITICAL CORRECTION REQUIRED: Your previous output was not valid JSON or failed schema validation.

Generate exactly ${questionCount} interview questions and return STRICTLY a valid JSON object with NO markdown, NO \`\`\` code fences, and NO intro/outro text.

Required Schema:
{
  "questions": [
    {
      "id": "q-1",
      "question": "Question text",
      "category": "${interviewType}",
      "difficulty": "${difficulty}",
      "expectedTopics": ["Topic 1", "Topic 2"]
    }
  ]
}

Parameters:
- Interview Type: ${interviewType}
- Difficulty: ${difficulty}
- Experience Level: ${experienceLevel}
- Resume context: ${JSON.stringify(resumeData)}`;

      let retryRawOutput: string;
      try {
        const retryStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 2 });
        retryRawOutput = await provider.generate(retryPrompt, systemInstruction);
        const retryDuration = Date.now() - retryStartTime;
        recordMetric.recordLLMRequestDuration(retryDuration, { agent: 'question-agent', 'llm.attempt': 2, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 2, 'response.length': retryRawOutput.length });
      } catch (retryLlmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'question-agent', 'llm.attempt': 2, 'llm.provider': this.providerName, error: retryLlmErr.message });
        logger.error('❌ [QuestionAgent] LLM generation call failed on retry:', retryLlmErr);
        throw new QuestionLLMError(`LLM generation failed on retry: ${retryLlmErr.message}`, { cause: retryLlmErr });
      }

      // Second Attempt - Parse
      let retryParsedJson: any;
      try {
        const retryCleaned = cleanJsonResponse(retryRawOutput);
        retryParsedJson = JSON.parse(retryCleaned);
        span.addEvent('JSON Parsed', { 'llm.attempt': 2 });
      } catch (retryParseErr: any) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'reason': 'json_parse_error' });
        logger.error('❌ [QuestionAgent] JSON parsing failed on retry attempt:', retryParseErr);
        throw new QuestionJSONParseError('Failed to parse JSON response from LLM after retry', {
          rawOutput: retryRawOutput,
          parseError: retryParseErr.message
        });
      }

      // Second Attempt - Validate
      const retryValidation = validateAndNormalizeQuestionResult(retryParsedJson, interviewType, difficulty);
      if (!retryValidation.isValid || !retryValidation.data) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'errors.count': retryValidation.errors?.length || 0 });
        logger.error('❌ [QuestionAgent] Schema validation failed on retry attempt:', retryValidation.errors);
        throw new QuestionValidationError('LLM output failed schema validation after retry', {
          errors: retryValidation.errors,
          parsedOutput: retryParsedJson
        });
      }

      span.addEvent('Retry Success', { 'retry.attempt': 2 });
      recordMetric.recordQuestionsGenerated(retryValidation.data.questions.length, { 'interview.type': interviewType, 'difficulty': difficulty });
      recordMetric.recordQuestionGenerationDuration(Date.now() - questionStartTime, { agent: 'question-agent', 'interview.type': interviewType, difficulty, retry_used: true });

      span.end('OK', {
        'questions.count': retryValidation.data.questions.length,
        'questions.interview_type': interviewType,
        'questions.difficulty': difficulty,
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
  async generate(input: QuestionGenerationInput): Promise<QuestionGenerationResult> {
    return this.generateQuestions(input);
  }

  /**
   * Helper to convert QuestionItem list to legacy GeneratedQuestion list
   */
  toGeneratedQuestions(questions: QuestionItem[]): GeneratedQuestion[] {
    return questions.map(q => ({
      id: q.id,
      questionText: q.question,
      type: q.category,
      topic: q.expectedTopics[0] || q.category,
      difficulty: q.difficulty,
      expectedConcepts: q.expectedTopics
    }));
  }
}

// Export default instance
export const defaultQuestionAgent = new QuestionAgent();
