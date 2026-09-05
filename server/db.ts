import crypto from 'crypto';
import { GeneratedQuestion, Evaluation, InterviewSession, ReadingFontId } from '../src/shared/types';

export type { GeneratedQuestion, Evaluation, InterviewSession };

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_USER_UUID = process.env.DEFAULT_USER_UUID || 'a1b2c3d4-0000-0000-0000-000000000001';

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
  username?: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  pendingTwoFactorSecret?: string;
  backupCodes?: string[];
  appearance?: 'light' | 'dark' | 'system';
  readingFont?: ReadingFontId;
  apiKeys?: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
  };
  notifications?: {
    emailSummaries: boolean;
    practiceReminders: boolean;
    productUpdates: boolean;
  };
  privacy?: {
    dataRetentionDays: number;
    anonymousAIUsage: boolean;
    allowTelemetry: boolean;
    searchHistoryCleared: boolean;
  };
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

export interface Answer {
  id: string;
  questionId: string;
  answerText: string;
  submittedAt: string;
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
  appearance?: 'light' | 'dark' | 'system';
  username?: string;
  readingFont?: ReadingFontId;
  apiKeys?: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
  };
  notifications?: {
    emailSummaries: boolean;
    practiceReminders: boolean;
    productUpdates: boolean;
  };
  privacy?: {
    dataRetentionDays: number; // 0 = Infinite, or 30, 90 days etc.
    anonymousAIUsage: boolean;
    allowTelemetry: boolean;
    searchHistoryCleared: boolean;
  };
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

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  revoked: boolean;
  createdAt: string;
  replacedByToken?: string;
}

export interface RevokedToken {
  tokenIdentifier: string;
  jti?: string;
  expiresAt: number;
  revokedAt: string;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  email: string;
  token: string;
  expiresAt: number;
  used: boolean;
  createdAt: string;
}

export interface UserApiKeyRecord {
  id: string;
  userId: string;
  provider: 'openai' | 'anthropic' | 'gemini';
  encryptedKey: string;
  keyLastFour: string;
  preferredModel?: string;
  isValid: boolean;
  lastValidatedAt: string;
  createdAt: string;
  updatedAt: string;
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
  userApiKeys: Map<string, UserApiKeyRecord> = new Map(); // key: `${userId}:${provider}`
  refreshTokens: Map<string, RefreshToken> = new Map();
  revokedAccessTokens: Map<string, RevokedToken> = new Map();
  passwordResetTokens: Map<string, PasswordResetToken> = new Map();
  userSettings: Map<string, UserSettings> = new Map();
  promptVersions: PromptVersion[] = [];
  usages: AIUsage[] = [];
  traces: TraceMetadata[] = [];

  constructor() {
    // Database initializes cleanly with no pre-seeded mock records
  }
}

export const db = new InMemoryDB();
