import { getLLMProvider } from '../../services/llm';
import { tracer, getAITelemetryAttributes, recordMetric } from '../../observability';
import { AppError } from '../../middleware/error_handling';
import { 
  ResumeAnalysisResult, 
  ResumeProfile, 
  JDAnalysisResult, 
  JobRequirement,
  GapAnalysisResult,
  GapAnalysis
} from '../../../src/shared/types';

export type { GapAnalysisResult, GapAnalysis };

/**
 * Base error for GapAgent operational failures
 */
export class GapAgentError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, statusCode, details);
    this.name = 'GapAgentError';
  }
}

/**
 * Thrown when candidate resume data is missing or invalid
 */
export class GapEmptyResumeError extends GapAgentError {
  constructor(message: string = 'Resume analysis data is required for gap evaluation', details?: any) {
    super(message, 400, details);
    this.name = 'GapEmptyResumeError';
  }
}

/**
 * Thrown when LLM output cannot be parsed as JSON after retries
 */
export class GapJSONParseError extends GapAgentError {
  constructor(message: string = 'Failed to parse JSON response from LLM after retry', details?: any) {
    super(message, 422, details);
    this.name = 'GapJSONParseError';
  }
}

/**
 * Thrown when LLM JSON output fails schema validation
 */
export class GapValidationError extends GapAgentError {
  constructor(message: string = 'LLM output failed schema validation after retry', details?: any) {
    super(message, 422, details);
    this.name = 'GapValidationError';
  }
}

/**
 * Thrown when the underlying LLM provider throws an exception
 */
export class GapLLMError extends GapAgentError {
  constructor(message: string = 'LLM provider failed during gap analysis', details?: any) {
    super(message, 502, details);
    this.name = 'GapLLMError';
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
 * Helper to validate and normalize parsed JSON object against GapAnalysisResult schema
 */
export function validateAndNormalizeGapAnalysis(obj: any): {
  isValid: boolean;
  data?: GapAnalysisResult;
  errors: string[];
} {
  const errors: string[] = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { isValid: false, errors: ['Response is not a valid JSON object'] };
  }

  // Overall Match
  let overallMatch = 0;
  if (typeof obj.overallMatch === 'number' && !isNaN(obj.overallMatch)) {
    overallMatch = Math.min(100, Math.max(0, Math.round(obj.overallMatch)));
  } else if (typeof obj.matchPercentage === 'number' && !isNaN(obj.matchPercentage)) {
    overallMatch = Math.min(100, Math.max(0, Math.round(obj.matchPercentage)));
  } else if (typeof obj.overallMatch === 'string') {
    const parsed = parseFloat(obj.overallMatch);
    overallMatch = !isNaN(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0;
  } else if (obj.overallMatch !== undefined && obj.overallMatch !== null) {
    errors.push('overallMatch must be a number between 0 and 100');
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

  const matchedSkills = parseStringArray(obj.matchedSkills ?? obj.matchingSkills, 'matchedSkills');
  const missingSkills = parseStringArray(obj.missingSkills, 'missingSkills');
  const recommendedTopics = parseStringArray(obj.recommendedTopics, 'recommendedTopics');

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      matchedSkills,
      missingSkills,
      recommendedTopics,
      overallMatch
    }
  };
}

/**
 * GapAgent compares candidate resume data with job descriptions to identify skill gaps and recommended topics.
 */
export class GapAgent {
  private providerName?: string;

  constructor(providerName?: string) {
    this.providerName = providerName;
  }

  /**
   * Evaluates gaps between candidate resume analysis and job description analysis.
   */
  async evaluateGaps(
    resume: ResumeAnalysisResult | ResumeProfile | any,
    jd?: JDAnalysisResult | JobRequirement | any | null
  ): Promise<GapAnalysisResult> {
    if (!resume) {
      throw new GapEmptyResumeError('Resume input data is required for gap analysis');
    }

    const aiAttrs = getAITelemetryAttributes({ llmProvider: this.providerName, agentName: 'gap-agent' });
    const span = tracer.startSpan('gap-agent:evaluateGaps', undefined, undefined, aiAttrs);

    try {
      const provider = getLLMProvider(this.providerName);
      const hasJd = Boolean(jd && (jd.jobTitle || jd.title || jd.requiredSkills || jd.mandatorySkills || jd.responsibilities));

      const systemInstruction = `You are an expert AI Career and Technical Interview Gap Analysis Agent.
Your job is to compare a candidate's resume analysis against job description requirements (if provided) or analyze the resume directly.
You MUST return ONLY a raw JSON object matching the requested schema.
Do NOT include markdown formatting, code fences (\`\`\`json), or conversational commentary.`;

      let initialPrompt = '';

      if (hasJd) {
        initialPrompt = `Compare the candidate's resume analysis against the target job description requirements.

Candidate Resume Analysis:
${JSON.stringify(resume, null, 2)}

Target Job Description Analysis:
${JSON.stringify(jd, null, 2)}

Return a structured JSON object strictly matching this schema:
{
  "matchedSkills": ["skill candidate has that matches job requirements"],
  "missingSkills": ["required/preferred skill in job that candidate lacks or needs strengthening"],
  "recommendedTopics": ["interview topic or technical area candidate should prepare for"],
  "overallMatch": 85
}

Rules:
- "matchedSkills": array of strings
- "missingSkills": array of strings
- "recommendedTopics": array of strings
- "overallMatch": integer between 0 and 100 representing overall compatibility match score`;
      } else {
        initialPrompt = `No job description provided. Analyze the candidate's resume analysis and recommend interview preparation topics based on their experience level, technical skills, and background.

Candidate Resume Analysis:
${JSON.stringify(resume, null, 2)}

Return a structured JSON object strictly matching this schema:
{
  "matchedSkills": ["candidate skills extracted from resume"],
  "missingSkills": [],
  "recommendedTopics": ["key interview topics based on candidate experience and stack"],
  "overallMatch": 100
}

Rules:
- "matchedSkills": array of candidate's key skills
- "missingSkills": empty array [] since no JD was supplied
- "recommendedTopics": array of recommended interview preparation topics tailored to candidate's background
- "overallMatch": 100`;
      }

      let rawOutput: string;
      try {
        const llmStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 1 });
        rawOutput = await provider.generate(initialPrompt, systemInstruction);
        const llmDuration = Date.now() - llmStartTime;
        recordMetric.recordLLMRequestDuration(llmDuration, { agent: 'gap-agent', 'llm.attempt': 1, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 1, 'response.length': rawOutput.length });
      } catch (llmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'gap-agent', 'llm.attempt': 1, 'llm.provider': this.providerName, error: llmErr.message });
        console.error('❌ [GapAgent] LLM generation call failed on first attempt:', llmErr);
        throw new GapLLMError(`LLM generation failed: ${llmErr.message}`, { cause: llmErr });
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
        console.warn('🔮 [GapAgent] Initial JSON parsing failed. Attempting retry once...', parseErr.message);
      }

      // First Attempt - Validation
      if (parseSuccess) {
        const validation = validateAndNormalizeGapAnalysis(parsedJson);
        if (validation.isValid && validation.data) {
          span.end('OK', {
            'gap.overall_match': validation.data.overallMatch,
            'gap.matched_skills_count': validation.data.matchedSkills.length,
            'gap.missing_skills_count': validation.data.missingSkills.length,
            'gap.has_jd': hasJd
          });
          return validation.data;
        }
        span.addEvent('Validation Failed', { 'llm.attempt': 1, 'errors.count': validation.errors?.length || 0 });
        console.warn('🔮 [GapAgent] Initial schema validation failed. Attempting retry once...', validation.errors);
      }

      // RETRY ONCE if parsing or validation failed
      span.addEvent('Retry Triggered', { 'retry.attempt': 2 });
      console.log('🔮 [GapAgent] Retrying LLM call once with strict output instructions...');

      const retryPrompt = `CRITICAL CORRECTION REQUIRED: Your previous output was not valid JSON or failed schema validation.

Re-evaluate the ${hasJd ? 'resume vs job description gap' : 'resume interview preparation topics'} and return STRICTLY a valid JSON object with NO markdown, NO \`\`\` code fences, and NO intro/outro text.

Schema required:
{
  "matchedSkills": ["skill"],
  "missingSkills": ["skill"],
  "recommendedTopics": ["topic"],
  "overallMatch": 80
}

Candidate Resume:
${JSON.stringify(resume)}

${hasJd ? `Job Description:\n${JSON.stringify(jd)}` : 'No Job Description supplied.'}`;

      let retryRawOutput: string;
      try {
        const retryStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 2 });
        retryRawOutput = await provider.generate(retryPrompt, systemInstruction);
        const retryDuration = Date.now() - retryStartTime;
        recordMetric.recordLLMRequestDuration(retryDuration, { agent: 'gap-agent', 'llm.attempt': 2, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 2, 'response.length': retryRawOutput.length });
      } catch (retryLlmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'gap-agent', 'llm.attempt': 2, 'llm.provider': this.providerName, error: retryLlmErr.message });
        console.error('❌ [GapAgent] LLM generation call failed on retry:', retryLlmErr);
        throw new GapLLMError(`LLM generation failed on retry: ${retryLlmErr.message}`, { cause: retryLlmErr });
      }

      // Second Attempt - Parse
      let retryParsedJson: any;
      try {
        const retryCleaned = cleanJsonResponse(retryRawOutput);
        retryParsedJson = JSON.parse(retryCleaned);
        span.addEvent('JSON Parsed', { 'llm.attempt': 2 });
      } catch (retryParseErr: any) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'reason': 'json_parse_error' });
        console.error('❌ [GapAgent] JSON parsing failed on retry attempt:', retryParseErr);
        throw new GapJSONParseError('Failed to parse JSON response from LLM after retry', {
          rawOutput: retryRawOutput,
          parseError: retryParseErr.message
        });
      }

      // Second Attempt - Validate
      const retryValidation = validateAndNormalizeGapAnalysis(retryParsedJson);
      if (!retryValidation.isValid || !retryValidation.data) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'errors.count': retryValidation.errors?.length || 0 });
        console.error('❌ [GapAgent] Schema validation failed on retry attempt:', retryValidation.errors);
        throw new GapValidationError('LLM output failed schema validation after retry', {
          errors: retryValidation.errors,
          parsedOutput: retryParsedJson
        });
      }

      span.addEvent('Retry Success', { 'retry.attempt': 2 });

      span.end('OK', {
        'gap.overall_match': retryValidation.data.overallMatch,
        'gap.matched_skills_count': retryValidation.data.matchedSkills.length,
        'gap.missing_skills_count': retryValidation.data.missingSkills.length,
        'gap.has_jd': hasJd,
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
  async analyze(resume: any, jd?: any): Promise<GapAnalysisResult> {
    return this.evaluateGaps(resume, jd);
  }
}

// Export default instance & aliases
export const defaultGapAgent = new GapAgent();
