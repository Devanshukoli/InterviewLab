import { GeneratedQuestion, CoachingReport } from './agent-types';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  avatarUrl?: string;
  twoFactorEnabled?: boolean;
  apiKeys?: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
  };
  appearance?: 'light' | 'dark' | 'system';
  notifications?: {
    emailSummaries: boolean;
    practiceReminders: boolean;
    productUpdates: boolean;
  };
}

export interface SavedResume {
  id: string;
  title: string;
  text: string;
  skills: string[];
  experienceYears?: number;
  uploadedAt: string;
  updatedAt?: string;
  fileType: 'pdf' | 'docx' | 'doc' | 'text' | string;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
}

export interface InterviewOptions {
  experienceLevel: 'junior' | 'mid' | 'senior' | string;
  interviewType: 'technical' | 'behavioral' | 'mixed' | string;
  numberOfQuestions: number;
  difficulty: 'easy' | 'medium' | 'hard' | string;
}

export interface Evaluation {
  id: string;
  questionId: string;
  score: number;
  clarityRating: 'poor' | 'fair' | 'good' | 'excellent' | string;
  feedback: string;
  missingPoints: string[];
  suggestedAnswer: string;
  evaluatedAt: string;
}

export interface InterviewSession {
  id: string;
  userId: string;
  resumeId: string;
  resumeTitle?: string;
  jobDescriptionId?: string | null;
  jobTitle?: string;
  status: 'draft' | 'in_progress' | 'completed' | string;
  options: InterviewOptions;
  questions: GeneratedQuestion[];
  answers: Record<string, string>;
  evaluations: Record<string, Evaluation>;
  coachingReport?: CoachingReport | {
    overallScore: number;
    domainStrengths: string[];
    domainWeaknesses: string[];
    recommendedTopics: { topic: string; priority: 'low' | 'medium' | 'high' }[];
    summary: string;
  };
  createdAt: string;
}

export interface ProgressMetric {
  id: string;
  topic: string;
  confidenceScore: number;
  sessionCount: number;
  lastPracticedAt: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  timestamp: string;
  type: 'session_completed' | 'resume_uploaded' | 'session_started' | string;
  description: string;
}
