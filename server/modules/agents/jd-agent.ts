import { getLLMProvider } from '../../services/llm';
import { tracer, getAITelemetryAttributes, recordMetric } from '../../observability';
import { AppError } from '../../middleware/error_handling';
import { JDAnalysisResult, JobRequirement } from '../../../src/shared/types';

export type { JDAnalysisResult, JobRequirement };

/**
 * Base error for JDAgent operational failures
 */
export class JDAgentError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, statusCode, details);
    this.name = 'JDAgentError';
  }
}

/**
 * Thrown when LLM output cannot be parsed as JSON after retries
 */
export class JDJSONParseError extends JDAgentError {
  constructor(message: string = 'Failed to parse JSON response from LLM after retry', details?: any) {
    super(message, 422, details);
    this.name = 'JDJSONParseError';
  }
}

/**
 * Thrown when LLM JSON output fails schema validation
 */
export class JDValidationError extends JDAgentError {
  constructor(message: string = 'LLM output failed schema validation after retry', details?: any) {
    super(message, 422, details);
    this.name = 'JDValidationError';
  }
}

/**
 * Thrown when the underlying LLM provider throws an exception
 */
export class JDLLMError extends JDAgentError {
  constructor(message: string = 'LLM provider failed during job description analysis', details?: any) {
    super(message, 502, details);
    this.name = 'JDLLMError';
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
 * Helper to validate and normalize parsed JSON object against JDAnalysisResult schema
 */
export function validateAndNormalizeJDAnalysis(obj: any): {
  isValid: boolean;
  data?: JDAnalysisResult;
  errors: string[];
} {
  const errors: string[] = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { isValid: false, errors: ['Response is not a valid JSON object'] };
  }

  const jobTitle = typeof obj.jobTitle === 'string' ? obj.jobTitle.trim() : (typeof obj.title === 'string' ? obj.title.trim() : '');
  const company = typeof obj.company === 'string' ? obj.company.trim() : '';
  const experienceLevel = typeof obj.experienceLevel === 'string' ? obj.experienceLevel.trim() : '';

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

  const requiredSkills = parseStringArray(obj.requiredSkills ?? obj.mandatorySkills, 'requiredSkills');
  const preferredSkills = parseStringArray(obj.preferredSkills, 'preferredSkills');
  const responsibilities = parseStringArray(obj.responsibilities, 'responsibilities');
  const keywords = parseStringArray(obj.keywords, 'keywords');

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    data: {
      jobTitle,
      company,
      requiredSkills,
      preferredSkills,
      experienceLevel,
      responsibilities,
      keywords
    }
  };
}

/**
 * JDAgent analyzes job descriptions using the configured LLM provider.
 */
export class JDAgent {
  private providerName?: string;

  constructor(providerName?: string) {
    this.providerName = providerName;
  }

  /**
   * Accepts optional Job Description text and returns structured JSON analysis object.
   * If no Job Description is supplied (or empty/whitespace), returns null without throwing an error.
   */
  async analyzeJobDescription(jdText?: string | null): Promise<JDAnalysisResult | null> {
    if (!jdText || typeof jdText !== 'string' || !jdText.trim()) {
      return null;
    }

    const aiAttrs = getAITelemetryAttributes({ llmProvider: this.providerName, agentName: 'jd-agent' });
    const span = tracer.startSpan('jd-agent:analyzeJobDescription', undefined, undefined, aiAttrs);

    try {
      const provider = getLLMProvider(this.providerName);

      const systemInstruction = `You are an expert AI Job Description Analysis Agent.
Analyze the provided Job Description text and extract structured key details.
You MUST return ONLY a raw JSON object matching the requested schema.
Do NOT include markdown formatting, code fences (\`\`\`json), or conversational commentary.`;

      const initialPrompt = `Analyze the job description text and return a structured JSON object strictly matching this schema:

{
  "jobTitle": "Job title or empty string if unknown",
  "company": "Company name or empty string if unknown",
  "requiredSkills": ["skill1", "skill2"],
  "preferredSkills": ["skill1", "skill2"],
  "experienceLevel": "Junior / Mid / Senior / Lead / Executive or experience years required",
  "responsibilities": ["responsibility 1", "responsibility 2"],
  "keywords": ["keyword 1", "keyword 2"]
}

Schema Rules:
- "jobTitle": string
- "company": string
- "requiredSkills": array of strings
- "preferredSkills": array of strings
- "experienceLevel": string
- "responsibilities": array of strings
- "keywords": array of strings

Job Description Text:
"""
${jdText.trim()}
"""`;

      let rawOutput: string;
      try {
        const llmStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 1 });
        rawOutput = await provider.generate(initialPrompt, systemInstruction);
        const llmDuration = Date.now() - llmStartTime;
        recordMetric.recordLLMRequestDuration(llmDuration, { agent: 'jd-agent', 'llm.attempt': 1, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 1, 'response.length': rawOutput.length });
      } catch (llmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'jd-agent', 'llm.attempt': 1, 'llm.provider': this.providerName, error: llmErr.message });
        console.error('❌ [JDAgent] LLM generation call failed on first attempt:', llmErr);
        throw new JDLLMError(`LLM generation failed: ${llmErr.message}`, { cause: llmErr });
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
        console.warn('🔮 [JDAgent] Initial JSON parsing failed. Attempting retry once...', parseErr.message);
      }

      // First Attempt - Validation
      if (parseSuccess) {
        const validation = validateAndNormalizeJDAnalysis(parsedJson);
        if (validation.isValid && validation.data) {
          span.end('OK', {
            'jd.title': validation.data.jobTitle,
            'jd.company': validation.data.company,
            'jd.required_skills_count': validation.data.requiredSkills.length
          });
          return validation.data;
        }
        span.addEvent('Validation Failed', { 'llm.attempt': 1, 'errors.count': validation.errors?.length || 0 });
        console.warn('🔮 [JDAgent] Initial schema validation failed. Attempting retry once...', validation.errors);
      }

      // RETRY ONCE if parsing or validation failed
      span.addEvent('Retry Triggered', { 'retry.attempt': 2 });
      console.log('🔮 [JDAgent] Retrying LLM call once with strict output instructions...');

      const retryPrompt = `CRITICAL CORRECTION REQUIRED: Your previous output was not valid JSON or failed schema validation.

Re-analyze the job description and return STRICTLY a valid JSON object with NO markdown, NO \`\`\` code fences, and NO intro/outro text.

Schema required:
{
  "jobTitle": "Job Title",
  "company": "Company Name",
  "requiredSkills": ["Skill"],
  "preferredSkills": ["Skill"],
  "experienceLevel": "Senior",
  "responsibilities": ["Responsibility"],
  "keywords": ["Keyword"]
}

Job Description Text:
"""
${jdText.trim()}
"""`;

      let retryRawOutput: string;
      try {
        const retryStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 2 });
        retryRawOutput = await provider.generate(retryPrompt, systemInstruction);
        const retryDuration = Date.now() - retryStartTime;
        recordMetric.recordLLMRequestDuration(retryDuration, { agent: 'jd-agent', 'llm.attempt': 2, 'llm.provider': this.providerName });
        span.addEvent('LLM Response Received', { 'llm.attempt': 2, 'response.length': retryRawOutput.length });
      } catch (retryLlmErr: any) {
        recordMetric.recordLLMRequestFailure({ agent: 'jd-agent', 'llm.attempt': 2, 'llm.provider': this.providerName, error: retryLlmErr.message });
        console.error('❌ [JDAgent] LLM generation call failed on retry:', retryLlmErr);
        throw new JDLLMError(`LLM generation failed on retry: ${retryLlmErr.message}`, { cause: retryLlmErr });
      }

      // Second Attempt - Parse
      let retryParsedJson: any;
      try {
        const retryCleaned = cleanJsonResponse(retryRawOutput);
        retryParsedJson = JSON.parse(retryCleaned);
        span.addEvent('JSON Parsed', { 'llm.attempt': 2 });
      } catch (retryParseErr: any) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'reason': 'json_parse_error' });
        console.error('❌ [JDAgent] JSON parsing failed on retry attempt:', retryParseErr);
        throw new JDJSONParseError('Failed to parse JSON response from LLM after retry', {
          rawOutput: retryRawOutput,
          parseError: retryParseErr.message
        });
      }

      // Second Attempt - Validate
      const retryValidation = validateAndNormalizeJDAnalysis(retryParsedJson);
      if (!retryValidation.isValid || !retryValidation.data) {
        span.addEvent('Validation Failed', { 'llm.attempt': 2, 'errors.count': retryValidation.errors?.length || 0 });
        console.error('❌ [JDAgent] Schema validation failed on retry attempt:', retryValidation.errors);
        throw new JDValidationError('LLM output failed schema validation after retry', {
          errors: retryValidation.errors,
          parsedOutput: retryParsedJson
        });
      }

      span.addEvent('Retry Success', { 'retry.attempt': 2 });

      span.end('OK', {
        'jd.title': retryValidation.data.jobTitle,
        'jd.company': retryValidation.data.company,
        'jd.required_skills_count': retryValidation.data.requiredSkills.length,
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
  async analyze(jdText?: string | null): Promise<JDAnalysisResult | null> {
    return this.analyzeJobDescription(jdText);
  }

  /**
   * Legacy parseJobDescription adapter for compatibility with other components
   */
  async parseJobDescription(jdText?: string | null): Promise<JobRequirement | null> {
    const analysis = await this.analyzeJobDescription(jdText);
    if (!analysis) return null;

    return {
      title: analysis.jobTitle || 'Software Engineer',
      company: analysis.company || 'Company',
      experienceRequiredYears: 3,
      mandatorySkills: analysis.requiredSkills,
      preferredSkills: analysis.preferredSkills,
      responsibilities: analysis.responsibilities,
      roleType: 'unspecified'
    };
  }

  /**
   * Legacy getSuccessCriteria method
   */
  async getSuccessCriteria(requirement: JobRequirement): Promise<string[]> {
    return [
      `Demonstrate mastery in ${requirement.mandatorySkills.slice(0, 3).join(', ') || 'core skills'}`,
      `Show proven experience with key responsibilities`
    ];
  }
}

// Export class aliases & default instances
export { JDAgent as JdAgent };
export const defaultJDAgent = new JDAgent();
export const defaultJdAgent = defaultJDAgent;
