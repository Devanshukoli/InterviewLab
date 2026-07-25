import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LLM_PROVIDER: z.enum(['gemini', 'openai', 'anthropic']).default('gemini'),
  GEMINI_API_KEY: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET environment variable is required'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().default('interviewops-api'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  throw new Error('Invalid environment configuration');
}

export const env = _env.data;

export const config = {
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  port: env.PORT,
  llmProvider: env.LLM_PROVIDER,
  geminiApiKey: env.GEMINI_API_KEY,
  openaiApiKey: env.OPENAI_API_KEY,
  anthropicApiKey: env.ANTHROPIC_API_KEY,
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
};
