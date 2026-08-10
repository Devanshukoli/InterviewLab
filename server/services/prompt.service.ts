import { db, PromptVersion } from '../db';
import { logger } from '../observability';

export interface PromptTemplateData {
  systemInstruction: string;
  initialPrompt: string;
  initialPromptWithJd?: string;
  initialPromptWithoutJd?: string;
}

const DEFAULT_PROMPTS: Record<string, PromptTemplateData> = {
  'resume-agent': {
    systemInstruction: `You are an expert AI Resume Analysis Agent.
Analyze the provided resume text and extract candidate details.
You MUST return ONLY a raw JSON object matching the requested schema.
Do NOT include markdown formatting, code fences (\`\`\`json), or conversational commentary.`,
    initialPrompt: `Analyze the uploaded resume text and return a structured JSON object strictly matching this schema:

{
  "candidateName": "Full name of candidate or empty string if unknown",
  "experienceYears": 5,
  "summary": "Professional background summary",
  "skills": ["skill1", "skill2"],
  "projects": ["project1 description", "project2 description"],
  "education": ["degree/certification and institution"],
  "strengths": ["key strength 1", "key strength 2"],
  "weaknesses": ["area for growth 1", "area for growth 2"]
}

Schema Rules:
- "candidateName": string
- "experienceYears": non-negative number
- "summary": string
- "skills": array of strings
- "projects": array of strings
- "education": array of strings
- "strengths": array of strings
- "weaknesses": array of strings

Resume Text:
"""
{resumeText}
"""`
  },
  'coach-agent': {
    systemInstruction: `You are an expert AI Technical Career Coach Agent.
Analyze the candidate's interview answer evaluations and previous interview history to synthesize holistic career coaching guidance.
You MUST return ONLY a raw JSON object matching the requested schema.
Do NOT include markdown formatting, code fences (\`\`\`json), or conversational commentary.`,
    initialPrompt: `Analyze the candidate's interview evaluation results and interview history to synthesize a personalized coaching recommendation.

Evaluation Results:
{evaluationsData}

{historySection}

Return a structured JSON object strictly matching this schema:

{
  "overallPerformance": "Comprehensive assessment of the candidate's performance across evaluated questions",
  "topicsToStudy": ["Topic or skill area needing focused review 1", "Topic 2"],
  "recommendedDifficulty": "Medium",
  "nextSteps": ["Actionable step for candidate 1", "Actionable step 2"]
}

Schema Rules:
- "overallPerformance": string detailing overall performance feedback and key takeaways
- "topicsToStudy": array of strings listing specific technical topics or skills candidate should study
- "recommendedDifficulty": string specifying recommended target difficulty for next practice session (e.g. "Easy", "Medium", "Hard")
- "nextSteps": array of strings listing concrete, actionable next steps for interview preparation`
  },
  'jd-agent': {
    systemInstruction: `You are an expert AI Job Description Analysis Agent.
Analyze the provided Job Description text and extract structured key details.
You MUST return ONLY a raw JSON object matching the requested schema.
Do NOT include markdown formatting, code fences (\`\`\`json), or conversational commentary.`,
    initialPrompt: `Analyze the job description text and return a structured JSON object strictly matching this schema:

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
{jdText}
"""`
  },
  'question-agent': {
    systemInstruction: `You are an expert AI Technical Interviewer & Question Authoring Agent.
Your task is to generate tailor-made, high-quality interview questions based on candidate resume analysis and gap assessment.

CRITICAL QUESTION DIVERSITY CONSTRAINTS:
- Each question in the batch MUST target a different skill or topic than every other question in the batch.
- Each question MUST use a different question category or format (e.g. system design, debugging scenario, trade-off analysis, behavioral, coding).
- No two questions may share the same opening sentence structure, template, or be near-duplicates of each other. Ensure wide variety across the batch.

You MUST return ONLY a raw JSON object matching the requested schema.
Do NOT include markdown formatting, code fences (\`\`\`json), or conversational commentary.`,
    initialPrompt: `Generate exactly {questionCount} structured interview questions tailored for the candidate based on the parameters below.

Candidate Resume Analysis:
{resumeData}

{gapSection}

Interview Parameters:
- Interview Type: {interviewType}
- Difficulty Level: {difficulty}
- Candidate Experience Level: {experienceLevel}
- Number of Questions Required: {questionCount}

Return a structured JSON object strictly matching this schema:

{
  "questions": [
    {
      "id": "q-1",
      "question": "Detailed technical or scenario interview question text",
      "category": "{interviewType}",
      "difficulty": "{difficulty}",
      "expectedTopics": ["topic1", "topic2", "topic3"]
    }
  ]
}

Schema Rules:
- "questions": array of exactly {questionCount} question objects
- "id": unique string identifier (e.g. "q-1", "q-2")
- "question": string containing the question text
- "category": string representing domain/category (e.g. "{interviewType}")
- "difficulty": string representing difficulty (e.g. "{difficulty}")
- "expectedTopics": array of key technical concepts/topics expected in a good candidate answer`
  },
  'gap-agent': {
    systemInstruction: `You are an expert AI Career and Technical Interview Gap Analysis Agent.
Your job is to compare a candidate's resume analysis against job description requirements (if provided) or analyze the resume directly.
You MUST return ONLY a raw JSON object matching the requested schema.
Do NOT include markdown formatting, code fences (\`\`\`json), or conversational commentary.`,
    initialPrompt: '', // Multi-part prompt stored separately
    initialPromptWithJd: `Compare the candidate's resume analysis against the target job description requirements.

Candidate Resume Analysis:
{resume}

Target Job Description Analysis:
{jd}

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
- "overallMatch": integer between 0 and 100 representing overall compatibility match score`,
    initialPromptWithoutJd: `No job description provided. Analyze the candidate's resume analysis and recommend interview preparation topics based on their experience level, technical skills, and background.

Candidate Resume Analysis:
{resume}

Return a structured JSON object strictly matching this schema:
{
  "matchedSkills": ["candidate skills extracted from resume"],
  "missingSkills": [],
  "recommendedTopics": ["key interview topics based on candidate experience and stack"],
  "overallMatch": 100
}

Rules:
- "matchedSkills": array of candidate's key skills
- "missingSkills": empty array
- "recommendedTopics": array of strings
- "overallMatch": always 100`
  },
  'evaluation-agent': {
    systemInstruction: `You are an expert AI Technical Interviewer & Answer Evaluation Agent.
Your task is to grade candidate interview answers accurately, objectively, and constructively against the question and expected concepts.
You MUST return ONLY a raw JSON object matching the requested schema.
Do NOT include markdown formatting, code fences (\`\`\`json), or conversational commentary.`,
    initialPrompt: `Evaluate the candidate's interview answer based on the question and expected topics.

Question:
"{questionText}"

Expected Topics / Concepts:
{expectedTopics}

Candidate Answer:
"{candidateAnswer}"

Return a structured JSON object strictly matching this schema:

{
  "score": 85,
  "strengths": ["Key technical strength 1", "Key technical strength 2"],
  "weaknesses": ["Area that could be improved 1"],
  "missingConcepts": ["Important topic or concept that was omitted"],
  "feedback": "Clear, constructive feedback summarizing candidate performance",
  "idealAnswer": "An exemplary, high-scoring ideal response to this question"
}

Schema Rules:
- "score": integer between 0 and 100
- "strengths": array of strings highlighting strengths in the candidate's answer
- "weaknesses": array of strings highlighting weaknesses or areas for improvement
- "missingConcepts": array of strings listing required/expected topics that were missing
- "feedback": string containing concise, actionable evaluation feedback
- "idealAnswer": string providing an exemplary ideal answer to the question`
  }
};

export class PromptService {
  /**
   * Guarantees that default prompt templates are seeded in the DB
   */
  // TODO: make sure this promptVersion is first store in supabase. or we can remove in-memory store entirely.
  private static ensureSeeded() {
    if (db.promptVersions.length === 0) {
      const now = new Date().toISOString();
      for (const [agentName, data] of Object.entries(DEFAULT_PROMPTS)) {
        db.promptVersions.push({
          id: `p-${agentName}-v1`,
          agentName,
          version: 'v1.0',
          template: JSON.stringify(data),
          isActive: true,
          updatedAt: now
        });
      }
    }
  }

  /**
   * Retrieves the active prompt version for a given agent
   */
  static getActivePrompt(agentName: string): { version: string; data: PromptTemplateData } {
    this.ensureSeeded();
    const active = db.promptVersions.find(p => p.agentName === agentName && p.isActive);
    if (!active) {
      const defaultData = DEFAULT_PROMPTS[agentName];
      if (!defaultData) {
        throw new Error(`No default prompts found for agent: ${agentName}`);
      }
      return { version: 'v1.0', data: defaultData };
    }
    try {
      const data = JSON.parse(active.template) as PromptTemplateData;
      return { version: active.version, data };
    } catch (err) {
      logger.warn(`Failed to parse prompt template JSON for ${agentName}. Falling back to default:`, err);
      return { version: 'v1.0', data: DEFAULT_PROMPTS[agentName] };
    }
  }

  /**
   * Returns the active version string for getAITelemetryAttributes
   */
  static getActiveVersion(agentName?: string): string {
    if (!agentName) return 'v1.0';
    try {
      this.ensureSeeded();
      const active = db.promptVersions.find(p => p.agentName === agentName && p.isActive);
      return active ? active.version : 'v1.0';
    } catch {
      return 'v1.0';
    }
  }

  /**
   * Simple helper to replace template placeholder variables in template strings
   */
  static interpolate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (key in variables) {
        const val = variables[key];
        return typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
      }
      logger.warn(`Prompt interpolation: no value provided for placeholder {${key}} — leaving literal text in the prompt`);
      return match;
    });
  }
}
