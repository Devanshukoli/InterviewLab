import { getLLMProvider } from '../../services/llm';
import { tracer, getAITelemetryAttributes, recordMetric } from '../../observability';
import { AppError } from '../../middleware/error_handling';
import { ResumeAnalysisResult, ResumeProfile } from '../../../src/shared/types';
import { PromptService } from '../../services/prompt.service';

export type { ResumeAnalysisResult, ResumeProfile };

/**
 * Base error for ResumeAgent operational failures
 */
export class ResumeAgentError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, statusCode, details);
    this.name = 'ResumeAgentError';
  }
}

/**
 * Thrown when the provided resume text is missing or empty
 */
export class ResumeEmptyTextError extends ResumeAgentError {
  constructor(message: string = 'Resume text is empty or invalid', details?: any) {
    super(message, 400, details);
    this.name = 'ResumeEmptyTextError';
  }
}

/**
 * Thrown when LLM output cannot be parsed as JSON after retries
 */
export class ResumeJSONParseError extends ResumeAgentError {
  constructor(message: string = 'Failed to parse JSON response from LLM after retry', details?: any) {
    super(message, 422, details);
    this.name = 'ResumeJSONParseError';
  }
}

/**
 * Thrown when LLM JSON output fails schema validation
 */
export class ResumeValidationError extends ResumeAgentError {
  constructor(message: string = 'LLM output failed schema validation after retry', details?: any) {
    super(message, 422, details);
    this.name = 'ResumeValidationError';
  }
}

/**
 * Thrown when the underlying LLM provider throws an exception
 */
export class ResumeLLMError extends ResumeAgentError {
  constructor(message: string = 'LLM provider failed during resume analysis', details?: any) {
    super(message, 502, details);
    this.name = 'ResumeLLMError';
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
 * Helper to validate and normalize parsed JSON object against ResumeAnalysisResult schema
 */
export function validateAndNormalizeResumeAnalysis(obj: any): {
  isValid: boolean;
  data?: ResumeAnalysisResult;
  errors: string[];
} {
  const errors: string[] = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { isValid: false, errors: ['Response is not a valid JSON object'] };
  }

  // Candidate Name
  const candidateName = typeof obj.candidateName === 'string' ? obj.candidateName.trim() : '';

  // Experience Years
  let experienceYears = 0;
  if (typeof obj.experienceYears === 'number' && !isNaN(obj.experienceYears)) {
    experienceYears = Math.max(0, obj.experienceYears);
  } else if (typeof obj.experienceYears === 'string') {
    const parsed = parseFloat(obj.experienceYears);
    experienceYears = !isNaN(parsed) ? Math.max(0, parsed) : 0;
  } else if (obj.experienceYears !== undefined && obj.experienceYears !== null) {
    errors.push('experienceYears must be a number');
  }

  // Summary
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';

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

  const skills = parseStringArray(obj.skills, 'skills');
  const projects = parseStringArray(obj.projects, 'projects');
  const education = parseStringArray(obj.education, 'education');
  const strengths = parseStringArray(obj.strengths, 'strengths');
  const weaknesses = parseStringArray(obj.weaknesses, 'weaknesses');

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      candidateName,
      experienceYears,
      summary,
      skills,
      projects,
      education,
      strengths,
      weaknesses
    }
  };
}

/**
 * ResumeAgent analyzes uploaded resume text using the configured LLM provider.
 */
export class ResumeAgent {
  private providerName: string;

  constructor(providerName?: string) {
    this.providerName = providerName || 'gemini';
  }

  /**
   * Accepts uploaded resume text and returns structured JSON analysis object.
   */
  async analyzeResume(resumeText: string): Promise<ResumeAnalysisResult> {
    if (!resumeText || typeof resumeText !== 'string' || !resumeText.trim()) {
      throw new ResumeEmptyTextError('Resume text content is required for analysis');
    }

    const aiAttrs = getAITelemetryAttributes({ llmProvider: this.providerName, agentName: 'resume-agent' });
    const span = tracer.startSpan('resume-agent:analyzeResume', undefined, undefined, aiAttrs);

    try {
      const provider = getLLMProvider(this.providerName);
      const { data: promptData } = PromptService.getActivePrompt('resume-agent');
      const systemInstruction = promptData.systemInstruction;
      const initialPrompt = PromptService.interpolate(promptData.initialPrompt, {
        resumeText: resumeText.trim()
      });

      let rawOutput: string;
      try {
        const llmStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 1 });
        rawOutput = await provider.generate(initialPrompt, systemInstruction);
        const llmDuration = Date.now() - llmStartTime;
        recordMetric.recordLLMRequestDuration(llmDuration, { agent: 'resume-agent', 'llm.attempt': 1, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 1, 'response.length': rawOutput.length });
      } catch (llmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'resume-agent', 'llm.attempt': 1, 'llm.provider': this.providerName, error: llmErr.message });
        console.error('❌ [ResumeAgent] LLM generation call failed on first attempt:', llmErr);
        throw new ResumeLLMError(`LLM generation failed: ${llmErr.message}`, { cause: llmErr });
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
        console.warn('🔮 [ResumeAgent] Initial JSON parsing failed. Attempting retry once...', parseErr.message);
      }

      // First Attempt - Validation
      if (parseSuccess) {
        const validation = validateAndNormalizeResumeAnalysis(parsedJson);
        if (validation.isValid && validation.data) {
          span.end('OK', {
            'candidate.name': validation.data.candidateName,
            'candidate.experience_years': validation.data.experienceYears,
            'candidate.skills_count': validation.data.skills.length
          });
          return validation.data;
        }
        span.addEvent('Validation Failed', { 'llm.attempt': 1, 'errors.count': validation.errors?.length || 0 });
        console.warn('🔮 [ResumeAgent] Initial schema validation failed. Attempting retry once...', validation.errors);
      }

      // RETRY ONCE if parsing or validation failed
      span.addEvent('Retry Triggered', { 'retry.attempt': 2 });
      console.log('🔮 [ResumeAgent] Retrying LLM call once with strict output instructions...');

      const retryPrompt = `CRITICAL CORRECTION REQUIRED: Your previous output was not valid JSON or failed schema validation.

Re-analyze the resume and return STRICTLY a valid JSON object with NO markdown, NO \`\`\` code fences, and NO intro/outro text.

Schema required:
{
  "candidateName": "Candidate Name",
  "experienceYears": 0,
  "summary": "Summary string",
  "skills": ["Skill"],
  "projects": ["Project"],
  "education": ["Education"],
  "strengths": ["Strength"],
  "weaknesses": ["Weakness"]
}

Resume Text:
"""
${resumeText.trim()}
"""`;

      let retryRawOutput: string;
      try {
        const retryStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 2 });
        retryRawOutput = await provider.generate(retryPrompt, systemInstruction);
        const retryDuration = Date.now() - retryStartTime;
        recordMetric.recordLLMRequestDuration(retryDuration, { agent: 'resume-agent', 'llm.attempt': 2, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 2, 'response.length': retryRawOutput.length });
      } catch (retryLlmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'resume-agent', 'llm.attempt': 2, 'llm.provider': this.providerName, error: retryLlmErr.message });
        console.error('❌ [ResumeAgent] LLM generation call failed on retry:', retryLlmErr);
        throw new ResumeLLMError(`LLM generation failed on retry: ${retryLlmErr.message}`, { cause: retryLlmErr });
      }

      // Second Attempt - Parse
      let retryParsedJson: any;
      try {
        const retryCleaned = cleanJsonResponse(retryRawOutput);
        retryParsedJson = JSON.parse(retryCleaned);
        span.addEvent('JSON Parsed', { 'llm.attempt': 2 });
      } catch (retryParseErr: any) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'reason': 'json_parse_error' });
        console.error('❌ [ResumeAgent] JSON parsing failed on retry attempt:', retryParseErr);
        throw new ResumeJSONParseError('Failed to parse JSON response from LLM after retry', {
          rawOutput: retryRawOutput,
          parseError: retryParseErr.message
        });
      }

      // Second Attempt - Validate
      const retryValidation = validateAndNormalizeResumeAnalysis(retryParsedJson);
      if (!retryValidation.isValid || !retryValidation.data) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'errors.count': retryValidation.errors?.length || 0 });
        console.error('❌ [ResumeAgent] Schema validation failed on retry attempt:', retryValidation.errors);
        throw new ResumeValidationError('LLM output failed schema validation after retry', {
          errors: retryValidation.errors,
          parsedOutput: retryParsedJson
        });
      }

      span.addEvent('Retry Success', { 'retry.attempt': 2 });

      span.end('OK', {
        'candidate.name': retryValidation.data.candidateName,
        'candidate.experience_years': retryValidation.data.experienceYears,
        'candidate.skills_count': retryValidation.data.skills.length,
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
  async analyze(resumeText: string): Promise<ResumeAnalysisResult> {
    return this.analyzeResume(resumeText);
  }

  /**
   * Backward compatibility parseAndExtract
   */
  async parseAndExtract(resumeText: string): Promise<ResumeProfile> {
    const result = await this.analyzeResume(resumeText);
    return {
      candidateName: result.candidateName || undefined,
      skills: result.skills,
      experienceYears: result.experienceYears,
      education: result.education.map(e => ({
        degree: e,
        field: 'Software Development',
        institution: 'University'
      })),
      history: result.projects.map(p => ({
        role: 'Engineer',
        company: 'Company',
        duration: 'Recent',
        description: p
      }))
    };
  }

  /**
   * Classifies the industry, level of seniority, and core tech stacks
   */
  async classifyExperience(profile: ResumeProfile): Promise<{
    seniority: 'junior' | 'mid' | 'senior' | 'lead' | 'architect';
    primaryRole: string;
    coreDomain: string[];
  }> {
    const years = profile.experienceYears || 0;
    const seniority = years >= 10 ? 'architect' : years >= 7 ? 'lead' : years >= 5 ? 'senior' : years >= 2 ? 'mid' : 'junior';
    return {
      seniority,
      primaryRole: profile.skills[0] ? `${profile.skills[0]} Engineer` : 'Software Engineer',
      coreDomain: profile.skills.slice(0, 5)
    };
  }
}

// Default exported instance
export const defaultResumeAgent = new ResumeAgent();
