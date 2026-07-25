import crypto from 'crypto';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_USER_UUID = 'a1b2c3d4-0000-0000-0000-000000000001';

export function stringToUUID(str?: string | null): string {
  if (!str) return DEFAULT_USER_UUID;
  if (UUID_REGEX.test(str)) return str;
  if (str === 'usr-anonymous' || str === 'usr-default') return DEFAULT_USER_UUID;

  const hash = crypto.createHash('md5').update(str).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

// Database Models and In-Memory Repository Scaffolding

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
  name: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  pendingTwoFactorSecret?: string;
  backupCodes?: string[];
  appearance?: 'light' | 'dark' | 'system';
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  ipAddress: string;
  userAgent: string;
  deviceType: string;
  createdAt: string;
  lastActiveAt: string;
  isActive: boolean;
}

export interface Resume {
  id: string;
  userId: string;
  text: string;
  skills: string[];
  experienceYears: number;
  uploadedAt: string;
  updatedAt?: string;
  title?: string;
  fileType?: string;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
}

export interface JobDescription {
  id: string;
  userId: string;
  text: string;
  title: string;
  company: string;
  requirements: string[];
  uploadedAt: string;
}

export interface GeneratedQuestion {
  id: string;
  questionText: string;
  type: 'technical' | 'behavioral' | 'situational' | 'background';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  expectedConcepts: string[];
}

export interface Answer {
  id: string;
  questionId: string;
  answerText: string;
  submittedAt: string;
}

export interface Evaluation {
  id: string;
  questionId: string;
  score: number;
  clarityRating: 'poor' | 'fair' | 'good' | 'excellent';
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
  jobDescriptionId: string | null;
  jobTitle?: string;
  status: 'draft' | 'in_progress' | 'completed';
  options?: any;
  questions: GeneratedQuestion[];
  answers: Record<string, string>; // questionId -> answerText
  evaluations: Record<string, Evaluation>; // questionId -> Evaluation
  coachingReport?: {
    overallScore: number;
    domainStrengths: string[];
    domainWeaknesses: string[];
    recommendedTopics: { topic: string; priority: 'low' | 'medium' | 'high' }[];
    summary: string;
  };
  createdAt: string;
}

export interface LearningProgress {
  id: string;
  userId: string;
  topic: string;
  confidenceScore: number; // 0 to 100
  lastPracticedAt: string;
  sessionCount: number;
}

export interface UserSubscription {
  id: string;
  userId: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
}

export interface BillingHistory {
  id: string;
  userId: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  description: string;
  invoiceUrl?: string;
  receiptNumber?: string;
  createdAt: string;
}

export interface UserLogin {
  id: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  loginProvider: string;
  status: string;
  loggedInAt: string;
}

export interface UserSettings {
  id: string;
  userId: string;
  geminiApiKey?: string;
  notificationsEnabled: boolean;
  theme: string;
  updatedAt: string;
}

export interface PromptVersion {
  id: string;
  agentName: string;
  version: string;
  template: string;
  isActive: boolean;
  updatedAt: string;
}

export interface AIUsage {
  id: string;
  userId: string;
  agentName: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  timestamp: string;
}

export interface TraceMetadata {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  operationName: string;
  durationMs: number;
  statusCode: string;
}

// In-Memory Database Stores
class InMemoryDB {
  users: Map<string, User> = new Map();
  resumes: Map<string, Resume> = new Map();
  jobDescriptions: Map<string, JobDescription> = new Map();
  sessions: Map<string, InterviewSession> = new Map();
  progress: Map<string, LearningProgress[]> = new Map();
  subscriptions: Map<string, UserSubscription> = new Map();
  billingHistory: BillingHistory[] = [];
  userLogins: UserLogin[] = [];
  userSessions: UserSession[] = [];
  userSettings: Map<string, UserSettings> = new Map();
  promptVersions: PromptVersion[] = [];
  usages: AIUsage[] = [];
  traces: TraceMetadata[] = [];

  constructor() {
    // Database initializes cleanly with no pre-seeded mock records
  }
}

export const db = new InMemoryDB();
