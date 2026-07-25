/**
 * Resume Agent Types
 */
export interface ResumeAnalysisResult {
  candidateName: string;
  experienceYears: number;
  summary: string;
  skills: string[];
  projects: string[];
  education: string[];
  strengths: string[];
  weaknesses: string[];
}

export interface ResumeProfile {
  candidateName?: string;
  skills: string[];
  experienceYears: number;
  education: {
    degree: string;
    field: string;
    institution: string;
  }[];
  history: {
    role: string;
    company: string;
    duration: string;
    description: string;
  }[];
}

/**
 * Job Description Agent Types
 */
export interface JDAnalysisResult {
  jobTitle: string;
  company: string;
  requiredSkills: string[];
  preferredSkills: string[];
  experienceLevel: string;
  responsibilities: string[];
  keywords: string[];
}

export interface JobRequirement {
  title: string;
  company: string;
  experienceRequiredYears: number;
  mandatorySkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  roleType: 'remote' | 'hybrid' | 'onsite' | 'unspecified';
}

/**
 * Gap Agent Types
 */
export interface GapAnalysisResult {
  matchedSkills: string[];
  missingSkills: string[];
  recommendedTopics: string[];
  overallMatch: number;
}

export interface GapAnalysis {
  matchPercentage: number;
  matchingSkills: string[];
  missingSkills: string[];
  seniorityGap: {
    required: number;
    actual: number;
    isSufficient: boolean;
  };
  keyRisks: string[];
  strengths: string[];
}

/**
 * Question Agent Types
 */
export interface QuestionItem {
  id: string;
  question: string;
  category: string;
  difficulty: string;
  expectedTopics: string[];
}

export interface QuestionGenerationResult {
  questions: QuestionItem[];
}

export interface QuestionGenerationInput {
  resume: ResumeAnalysisResult | ResumeProfile | any;
  gap?: GapAnalysisResult | GapAnalysis | any | null;
  interviewType?: string;
  difficulty?: string;
  experienceLevel?: string;
  numberOfQuestions?: number;
}

export interface GeneratedQuestion {
  id: string;
  questionText: string;
  type: 'technical' | 'behavioral' | 'situational' | 'background' | string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard' | string;
  expectedConcepts: string[];
}

/**
 * Evaluation Agent Types
 */
export interface EvaluationResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  missingConcepts: string[];
  feedback: string;
  idealAnswer: string;
}

export interface AnswerEvaluation extends EvaluationResult {
  clarityRating?: 'poor' | 'fair' | 'good' | 'excellent';
  missingPoints?: string[];
  suggestedAnswer?: string;
}

export interface EvaluationInput {
  question: string | { question?: string; questionText?: string; expectedTopics?: string[]; expectedConcepts?: string[]; [key: string]: any };
  candidateAnswer: string;
  expectedTopics?: string[];
}

/**
 * Coach Agent Types
 */
export interface CoachAnalysisResult {
  overallPerformance: string;
  topicsToStudy: string[];
  recommendedDifficulty: string;
  nextSteps: string[];
}

export interface CoachInput {
  evaluations: any;
  interviewHistory?: any;
}

export interface CoachingReport {
  overallScore: number;
  domainStrengths: string[];
  domainWeaknesses: string[];
  recommendedTopicsToStudy?: {
    topic: string;
    priority: 'low' | 'medium' | 'high';
    resourceSuggestions?: string[];
  }[];
  recommendedTopics?: {
    topic: string;
    priority: 'low' | 'medium' | 'high';
  }[];
  coachingSummary?: string;
  summary?: string;
}

/**
 * Interview & Evaluation Pipeline Types
 */
export interface PipelineInput {
  resumeText: string;
  jdText?: string | null;
  userId?: string;
  interviewId?: string;
  sessionId?: string;
  interviewType?: string;
  difficulty?: string;
  experienceLevel?: string;
  numberOfQuestions?: number;
}

export interface InterviewPipelineResult {
  questions: QuestionItem[];
  resumeAnalysis?: ResumeAnalysisResult;
  jdAnalysis?: JDAnalysisResult | null;
  gapAnalysis?: GapAnalysisResult;
}

export interface EvaluationPipelineInput {
  question: string | { question?: string; questionText?: string; expectedTopics?: string[]; expectedConcepts?: string[]; topic?: string; [key: string]: any };
  candidateAnswer: string;
  expectedTopics?: string[];
  userId?: string;
  interviewId?: string;
  sessionId?: string;
  questionId?: string;
  previousHistory?: any;
  interviewType?: string;
  difficulty?: string;
  experienceLevel?: string;
}

export interface EvaluationPipelineResult {
  evaluation: EvaluationResult;
  coaching: CoachAnalysisResult;
  sessionId?: string;
  questionId?: string;
  persistedAt: string;
}
