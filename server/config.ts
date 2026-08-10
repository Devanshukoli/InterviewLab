import { z } from 'zod';
import dotenv from 'dotenv';
import { EnvError } from './middleware/error_handling';

// Load environment variables
dotenv.config();

const defaultMasterKey = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  BYOK_ENCRYPTION_KEY: z.string().optional().transform(v => {
    const key = (v && v.trim()) || process.env.BYOK_ENCRYPTION_KEY || defaultMasterKey;
    return key;
  }).refine(key => typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key), {
    message: 'BYOK_ENCRYPTION_KEY must be a 64-character hex string (32-byte key)'
  }),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  JWT_SECRET: z.string().optional().transform(v => (v && v.trim() !== '' ? v : 'interviewops-default-jwt-secret-key-2026-safe-fallback')).default('interviewops-default-jwt-secret-key-2026-safe-fallback'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().transform(v => (v && v.trim() !== '' ? v : 'http://localhost:4318')).default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().optional().transform(v => (v && v.trim() !== '' ? v : 'interviewops-api')).default('interviewops-api'),
  TRUST_PROXY: z.string().or(z.boolean()).default(true),
  MAX_REQUEST_BODY_SIZE: z.string().optional().transform(v => (v && v.trim() !== '' ? v : '10mb')).default('10mb'),
  CORS_ORIGIN: z.string().optional().transform(v => (v && v.trim() !== '' ? v : '*')).default('*'),
  COOKIE_SECURE: z.string().transform(v => v === 'true').or(z.boolean()).default(process.env.NODE_ENV === 'production'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(10000),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  throw new EnvError(`Invalid environment configuration: ${JSON.stringify(_env.error.format())}`);
}

export const env = _env.data;

export const config = {
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  port: env.PORT,
  byokEncryptionKey: env.BYOK_ENCRYPTION_KEY,
  supabase: {
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },
  jwtSecret: env.JWT_SECRET,
  otel: {
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: env.OTEL_SERVICE_NAME,
  },
  trustProxy: env.TRUST_PROXY,
  maxRequestBodySize: env.MAX_REQUEST_BODY_SIZE,
  corsOrigin: env.CORS_ORIGIN,
  cookieSecure: env.COOKIE_SECURE,
  cookieSameSite: env.COOKIE_SAME_SITE,
  shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
};
