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
 * Common English stopwords for token-overlap similarity calculations
 */
const DIVERSITY_STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot', 'could',
  'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t',
  'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s',
  'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is',
  'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most',
  'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they',
  'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d',
  'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when',
  'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom',
  'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d',
  'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
  'given', 'background', 'level'
]);

/**
 * Computes Jaccard similarity between two question texts based on token overlap (lowercased, stopwords removed).
 * Returns 1.0 for exact string matches.
 */
export function calculateQuestionSimilarity(q1: string, q2: string): number {
  const str1 = (q1 || '').trim().toLowerCase();
  const str2 = (q2 || '').trim().toLowerCase();
  if (!str1 || !str2) return 0.0;
  if (str1 === str2) return 1.0;

  const tokenize = (text: string): Set<string> => {
    const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/);
    const tokens = new Set<string>();
    for (const w of words) {
      if (w && !DIVERSITY_STOPWORDS.has(w)) {
        tokens.add(w);
      }
    }
    return tokens;
  };

  const set1 = tokenize(str1);
  const set2 = tokenize(str2);

  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;

  let intersection = 0;
  for (const token of set1) {
    if (set2.has(token)) {
      intersection++;
    }
  }

  const union = set1.size + set2.size - intersection;
  return union === 0 ? 0 : intersection / union;
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

  // Diversity Check across normalized questions
  if (normalizedQuestions.length > 1) {
    for (let i = 0; i < normalizedQuestions.length; i++) {
      for (let j = i + 1; j < normalizedQuestions.length; j++) {
        const q1Text = normalizedQuestions[i].question;
        const q2Text = normalizedQuestions[j].question;
        const sim = calculateQuestionSimilarity(q1Text, q2Text);
        if (sim >= 0.6) {
          errors.push(
            `Question ${i + 1} and Question ${j + 1} are too similar (similarity ${sim.toFixed(2)} >= 0.60): "${q1Text.slice(0, 60)}..." vs "${q2Text.slice(0, 60)}..."`
          );
        }
      }
    }
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
  private customProvider?: any;

  constructor(providerName?: string, customProvider?: any) {
    this.providerName = providerName || 'gemini';
    this.customProvider = customProvider;
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

    // Dedupe resume skills case-insensitively & trimmed
    let processedResumeData = resumeData;
    let skillNote = '';

    if (resumeData && typeof resumeData === 'object') {
      const skillsList = resumeData.skills ?? resumeData.resumeProfile?.skills;
      if (Array.isArray(skillsList)) {
        const seen = new Set<string>();
        const dedupedSkills: string[] = [];
        for (const s of skillsList) {
          if (typeof s === 'string') {
            const trimmed = s.trim();
            const key = trimmed.toLowerCase();
            if (key && !seen.has(key)) {
              seen.add(key);
              dedupedSkills.push(trimmed);
            }
          } else if (s != null) {
            dedupedSkills.push(s);
          }
        }

        processedResumeData = {
          ...resumeData,
          skills: dedupedSkills
        };

        if (dedupedSkills.length < questionCount) {
          skillNote = `\n\nNOTE ON SKILL DIVERSITY: Candidate has only ${dedupedSkills.length} unique skill(s) listed (${dedupedSkills.join(', ')}). Since ${questionCount} questions are required, you MUST vary the question category/format (e.g., system design, debugging scenario, trade-off analysis, behavioral, coding) for each question rather than reusing skill names or sentence templates.`;
        }
      }
    }

    const formattedResumeContext = typeof processedResumeData === 'string'
      ? processedResumeData + skillNote
      : JSON.stringify(processedResumeData, null, 2) + skillNote;

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
      const provider = this.customProvider || await getLLMProvider(this.providerName, userId);
      const { data: promptData } = PromptService.getActivePrompt('question-agent');
      const systemInstruction = promptData.systemInstruction;
      const gapSection = gapData 
        ? `Gap Analysis / Skill Assessment:\n${JSON.stringify(gapData, null, 2)}` 
        : 'No explicit Job Description gap assessment provided.';
      const initialPrompt = PromptService.interpolate(promptData.initialPrompt, {
        questionCount,
        resumeData: formattedResumeContext,
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
      let lastValidationErrors: string[] = [];
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

        lastValidationErrors = validation.errors || [];
        const isDiversityError = lastValidationErrors.some(e => e.includes('too similar'));
        const failureReason = isDiversityError ? 'diversity_check_failed' : 'schema_validation_error';

        span.addEvent('Validation Failed', { 
          'llm.attempt': 1, 
          'reason': failureReason, 
          'errors.count': lastValidationErrors.length 
        });
        logger.warn(`🔮 [QuestionAgent] Initial validation failed (${failureReason}). Attempting retry once...`, lastValidationErrors);
      }

      // RETRY ONCE if parsing or validation failed
      span.addEvent('Retry Triggered', { 'retry.attempt': 2 });
      logger.info('🔮 [QuestionAgent] Retrying LLM call once with strict output instructions...');

      let diversityNote = '';
      if (lastValidationErrors.length > 0) {
        const similarityErrors = lastValidationErrors.filter(e => e.includes('too similar'));
        if (similarityErrors.length > 0) {
          diversityNote = `\n\nCRITICAL DIVERSITY FAILURE IN PREVIOUS ATTEMPT:\nThe following generated questions were too similar or near-duplicates:\n${similarityErrors.map(e => `- ${e}`).join('\n')}\nYou MUST generate questions that target completely different topics/skills and use distinct question categories/formats (e.g. system design, debugging scenario, trade-off analysis, behavioral, coding). Do NOT repeat sentence templates.`;
        }
      }

      const retryPrompt = `CRITICAL CORRECTION REQUIRED: Your previous output was not valid JSON or failed schema/diversity validation.${diversityNote}

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
- Resume context: ${formattedResumeContext}`;

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
        const retryErrors = retryValidation.errors || [];
        const isDiversityError = retryErrors.some(e => e.includes('too similar'));
        const failureReason = isDiversityError ? 'diversity_check_failed' : 'schema_validation_error';

        span.addEvent('Validation Failed', { 
          'llm.attempt': 2, 
          'reason': failureReason, 
          'errors.count': retryErrors.length 
        });
        logger.error(`❌ [QuestionAgent] Validation failed on retry attempt (${failureReason}):`, retryErrors);
        throw new QuestionValidationError('LLM output failed schema or diversity validation after retry', {
          errors: retryErrors,
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
