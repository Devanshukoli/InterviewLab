import { Request, Response, NextFunction } from 'express';
import { trace, metrics, context, SpanStatusCode } from '@opentelemetry/api';
import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';
import { PromptService } from './services/prompt.service';

/**
 * The real logger. @opentelemetry/instrumentation-pino (bundled inside
 * getNodeAutoInstrumentations() in observability/instrumentation.ts) patches this
 * module at import time, so every log call made through this instance:
 *   1. gets trace_id / span_id / trace_flags stamped on automatically when called
 *      inside an active OTel span, and
 *   2. is forwarded into the OTel LoggerProvider -> BatchLogRecordProcessor -> SigNoz.
 * Plain console.log calls elsewhere in the app do NOT get this treatment, which is
 * why setupConsoleInterceptor() below routes them through pinoLogger too.
 */
export const pinoLogger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: {
    'service.name': process.env.OTEL_SERVICE_NAME || 'interviewops-api',
    service: process.env.OTEL_SERVICE_NAME || 'interviewops-api'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const currentStore = logContextStore.getStore();
    const activeOtelSpan = trace.getActiveSpan();
    const activeSpanContext = activeOtelSpan?.spanContext();

    const traceId = activeSpanContext?.traceId || currentStore?.traceId;
    const spanId = activeSpanContext?.spanId || currentStore?.spanId;
    const interviewId = currentStore?.interviewId || (activeOtelSpan as any)?.attributes?.['interview.id'] || process.env.DEFAULT_INTERVIEW_ID || 'intv-default';
    const agentName = currentStore?.agentName || (activeOtelSpan as any)?.attributes?.['agentName'] || (activeOtelSpan as any)?.attributes?.['agent.name'] || 'system';
    const userId = currentStore?.userId || (activeOtelSpan as any)?.attributes?.['user.id'] || process.env.DEFAULT_USER_ID || 'usr-anonymous';
    const llmProvider = currentStore?.llmProvider || (activeOtelSpan as any)?.attributes?.['llm.provider'] || process.env.LLM_PROVIDER || 'gemini';
    const llmModel = currentStore?.llmModel || (activeOtelSpan as any)?.attributes?.['llm.model'] || process.env.LLM_MODEL || 'gemini-3.6-flash';
    const serviceName = process.env.OTEL_SERVICE_NAME || 'interviewops-api';

    const attrs: Record<string, any> = {
      'service.name': serviceName,
      service: serviceName,
      'agent.name': agentName,
      agentName,
      'interview.id': interviewId,
      interviewId,
      'user.id': userId,
      userId,
      'llm.provider': llmProvider,
      llmProvider,
      'llm.model': llmModel,
      llmModel,
    };

    if (traceId) {
      attrs.traceId = traceId;
      attrs.trace_id = traceId;
    }
    if (spanId) {
      attrs.spanId = spanId;
      attrs.span_id = spanId;
    }

    return attrs;
  }
});

const meter = metrics.getMeter(process.env.OTEL_SERVICE_NAME || 'interviewops-api');

// OpenTelemetry Metrics Instruments (9 required metrics)
export const interviewsTotalCounter = meter.createCounter('interviews_total', {
  description: 'Total number of interviews initialized or completed',
});

export const questionsGeneratedTotalCounter = meter.createCounter('questions_generated_total', {
  description: 'Total number of interview questions generated',
});

export const evaluationsCompletedTotalCounter = meter.createCounter('evaluations_completed_total', {
  description: 'Total number of evaluations completed',
});

export const llmRequestsTotalCounter = meter.createCounter('llm_requests_total', {
  description: 'Total number of LLM requests initiated',
});

export const llmFailuresTotalCounter = meter.createCounter('llm_failures_total', {
  description: 'Total number of failed LLM requests',
});

export const llmRequestDurationHistogram = meter.createHistogram('llm_request_duration_ms', {
  description: 'Duration of LLM requests in milliseconds',
  unit: 'ms',
});

export const resumeProcessingDurationHistogram = meter.createHistogram('resume_processing_duration_ms', {
  description: 'Duration of resume processing in milliseconds',
  unit: 'ms',
});

export const questionGenerationDurationHistogram = meter.createHistogram('question_generation_duration_ms', {
  description: 'Duration of question generation in milliseconds',
  unit: 'ms',
});

export const evaluationDurationHistogram = meter.createHistogram('evaluation_duration_ms', {
  description: 'Duration of answer evaluation in milliseconds',
  unit: 'ms',
});

export const recordMetric = {
  recordInterviewStarted: (attributes: Record<string, string | number | boolean> = {}) => {
    interviewsTotalCounter.add(1, attributes);
  },
  recordQuestionsGenerated: (count: number = 1, attributes: Record<string, string | number | boolean> = {}) => {
    questionsGeneratedTotalCounter.add(count, attributes);
  },
  recordEvaluationCompleted: (count: number = 1, attributes: Record<string, string | number | boolean> = {}) => {
    evaluationsCompletedTotalCounter.add(count, attributes);
  },
  recordLLMRequest: (attributes: Record<string, string | number | boolean> = {}) => {
    llmRequestsTotalCounter.add(1, attributes);
  },
  recordLLMRequestFailure: (attributes: Record<string, string | number | boolean> = {}) => {
    llmFailuresTotalCounter.add(1, attributes);
  },
  recordLLMRequestDuration: (durationMs: number, attributes: Record<string, string | number | boolean> = {}) => {
    llmRequestDurationHistogram.record(durationMs, attributes);
  },
  recordResumeProcessingDuration: (durationMs: number, attributes: Record<string, string | number | boolean> = {}) => {
    resumeProcessingDurationHistogram.record(durationMs, attributes);
  },
  recordQuestionGenerationDuration: (durationMs: number, attributes: Record<string, string | number | boolean> = {}) => {
    questionGenerationDurationHistogram.record(durationMs, attributes);
  },
  recordEvaluationDuration: (durationMs: number, attributes: Record<string, string | number | boolean> = {}) => {
    evaluationDurationHistogram.record(durationMs, attributes);
  },
};

// Define structures for internal trace monitoring
export interface TelemetrySpan {
  id: string;
  traceId: string;
  spanId?: string;
  name: string;
  service: string;
  durationMs: number;
  status: 'OK' | 'ERROR';
  timestamp: string;
  attributes: Record<string, string | number | boolean>;
}

export interface LogContext {
  traceId: string;
  spanId: string;
  interviewId: string;
  agentName: string;
  startTime: number;
  userId?: string;
  llmProvider?: string;
  llmModel?: string;
}

export const logContextStore = new AsyncLocalStorage<LogContext>();

export interface StructuredLogEntry {
  timestamp: string;
  level: string;
  message: string;
  traceId: string;
  spanId: string;
  interviewId: string;
  agentName: string;
  requestDuration: number;
  [key: string]: any;
}

export const localLogStore: StructuredLogEntry[] = [];

export function addLocalLog(logEntry: StructuredLogEntry) {
  localLogStore.unshift(logEntry);
  if (localLogStore.length > 100) {
    localLogStore.pop();
  }
}

/**
 * Sanitizes log values to ensure no raw resume contents or API keys/secrets are ever logged.
 */
export function sanitizeLogData(value: any, depth = 0): any {
  if (value === null || value === undefined) return value;
  if (depth > 8) return '[MAX_DEPTH]';

  const secretsToRedact = [
    process.env.GEMINI_API_KEY,
    process.env.SUPABASE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.JWT_SECRET
  ].filter((s): s is string => typeof s === 'string' && s.length > 5);

  if (typeof value === 'string') {
    let sanitized = value;

    for (const secret of secretsToRedact) {
      if (sanitized.includes(secret)) {
        sanitized = sanitized.split(secret).join('[REDACTED_API_KEY]');
      }
    }

    // Redact recognized API key patterns & authorization tokens
    sanitized = sanitized
      .replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_API_KEY]')
      .replace(/sk-[A-Za-z0-9]{32,}/g, '[REDACTED_API_KEY]')
      .replace(/Bearer\s+[A-Za-z0-9\._-]+/gi, 'Bearer [REDACTED_TOKEN]');

    // Redact resume text blocks or prompts containing raw resume content
    if (
      sanitized.includes('Resume Text:') ||
      sanitized.includes('uploaded resume text') ||
      (sanitized.length > 200 && /WORK EXPERIENCE|EDUCATION|SKILLS|CURRICULUM VITAE/i.test(sanitized))
    ) {
      sanitized = '[REDACTED_RESUME_CONTENT]';
    }

    return sanitized;
  }

  if (typeof value === 'object') {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: sanitizeLogData(value.message, depth + 1),
        stack: sanitizeLogData(value.stack || '', depth + 1)
      };
    }

    if (Array.isArray(value)) {
      return value.map(item => sanitizeLogData(item, depth + 1));
    }

    const cleanObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('resume') ||
        lowerKey.includes('resumetext') ||
        lowerKey.includes('resumecontent') ||
        lowerKey.includes('rawresume')
      ) {
        cleanObj[key] = '[REDACTED_RESUME_CONTENT]';
      } else if (
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('password')
      ) {
        cleanObj[key] = '[REDACTED_API_KEY]';
      } else {
        cleanObj[key] = sanitizeLogData(val, depth + 1);
      }
    }
    return cleanObj;
  }

  return value;
}

function formatLogArgs(args: any[]): { message: string; meta: Record<string, any> } {
  if (args.length === 0) return { message: '', meta: {} };

  const first = args[0];
  let message = typeof first === 'string' ? first : (typeof first === 'object' && first !== null ? (first.message || JSON.stringify(sanitizeLogData(first))) : String(first));
  let meta: Record<string, any> = {};

  if (args.length === 2 && typeof args[1] === 'object' && args[1] !== null && !(args[1] instanceof Error)) {
    meta = args[1];
  } else if (args.length > 1) {
    const extraArgs = args.slice(1).map(arg => {
      if (arg instanceof Error) {
        return { message: arg.message, stack: arg.stack, name: arg.name };
      }
      if (typeof arg === 'object' && arg !== null) {
        return sanitizeLogData(arg);
      }
      return String(arg);
    });
    meta = { details: extraArgs.length === 1 ? extraArgs[0] : extraArgs };
  }

  return { message, meta };
}

export function logStructured(
  level: string,
  message: string,
  meta: Record<string, any> = {}
): StructuredLogEntry {
  const currentStore = logContextStore.getStore();
  const activeOtelSpan = trace.getActiveSpan();
  const activeSpanContext = activeOtelSpan?.spanContext();

  const traceId = String(meta.traceId || meta.trace_id || activeSpanContext?.traceId || currentStore?.traceId || 'trace-none');
  const spanId = String(meta.spanId || meta.span_id || activeSpanContext?.spanId || currentStore?.spanId || 'span-none');
  const interviewId = String(meta['interview.id'] || meta.interviewId || currentStore?.interviewId || (activeOtelSpan as any)?.attributes?.['interview.id'] || process.env.DEFAULT_INTERVIEW_ID || 'intv-default');
  const agentName = String(meta['agent.name'] || meta.agentName || currentStore?.agentName || (activeOtelSpan as any)?.attributes?.['agentName'] || (activeOtelSpan as any)?.attributes?.['agent.name'] || 'system');
  const userId = String(meta['user.id'] || meta.userId || currentStore?.userId || (activeOtelSpan as any)?.attributes?.['user.id'] || process.env.DEFAULT_USER_ID || 'usr-anonymous');
  const llmProvider = String(meta['llm.provider'] || meta.llmProvider || currentStore?.llmProvider || (activeOtelSpan as any)?.attributes?.['llm.provider'] || process.env.LLM_PROVIDER || 'gemini');
  const llmModel = String(meta['llm.model'] || meta.llmModel || currentStore?.llmModel || (activeOtelSpan as any)?.attributes?.['llm.model'] || process.env.LLM_MODEL || 'gemini-3.6-flash');
  const serviceName = process.env.OTEL_SERVICE_NAME || 'interviewops-api';
  const startTime = currentStore?.startTime || Date.now();
  const requestDuration = typeof meta.requestDuration === 'number' ? meta.requestDuration : (Date.now() - startTime);

  const {
    traceId: _t,
    trace_id: _t2,
    spanId: _s,
    span_id: _s2,
    interviewId: _i,
    'interview.id': _i2,
    agentName: _a,
    'agent.name': _a2,
    userId: _u,
    'user.id': _u2,
    llmProvider: _lp,
    'llm.provider': _lp2,
    llmModel: _lm,
    'llm.model': _lm2,
    requestDuration: _d,
    ...extraMeta
  } = meta;

  const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
  const sanitizedMeta = sanitizeLogData(extraMeta);

  const logEntry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: String(sanitizedMessage),
    traceId,
    spanId,
    interviewId,
    agentName,
    requestDuration,
    'service.name': serviceName,
    'agent.name': agentName,
    'interview.id': interviewId,
    'user.id': userId,
    'llm.provider': llmProvider,
    'llm.model': llmModel,
    ...sanitizedMeta
  };

  const pinoLevel = (['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const).includes(level as any)
    ? (level as pino.Level)
    : 'info';

  pinoLogger[pinoLevel](
    {
      traceId,
      trace_id: traceId,
      spanId,
      span_id: spanId,
      'service.name': serviceName,
      service: serviceName,
      'agent.name': agentName,
      agentName,
      'interview.id': interviewId,
      interviewId,
      'user.id': userId,
      userId,
      'llm.provider': llmProvider,
      llmProvider,
      'llm.model': llmModel,
      llmModel,
      requestDuration,
      ...sanitizedMeta,
    },
    logEntry.message
  );

  addLocalLog(logEntry);

  return logEntry;
}

export const logger = {
  info: (...args: any[]) => {
    const { message, meta } = formatLogArgs(args);
    return logStructured('info', message, meta);
  },
  warn: (...args: any[]) => {
    const { message, meta } = formatLogArgs(args);
    return logStructured('warn', message, meta);
  },
  error: (...args: any[]) => {
    const { message, meta } = formatLogArgs(args);
    return logStructured('error', message, meta);
  },
  debug: (...args: any[]) => {
    const { message, meta } = formatLogArgs(args);
    return logStructured('debug', message, meta);
  },
  log: (level: string, ...args: any[]) => {
    const { message, meta } = formatLogArgs(args);
    return logStructured(level, message, meta);
  }
};

let consoleIntercepted = false;

export function setupConsoleInterceptor() {
  if (consoleIntercepted) return;
  consoleIntercepted = true;

  console.log = (...args: any[]) => {
    const { message, meta } = formatLogArgs(args);
    logStructured('info', message, meta);
  };

  console.warn = (...args: any[]) => {
    const { message, meta } = formatLogArgs(args);
    logStructured('warn', message, meta);
  };

  console.error = (...args: any[]) => {
    const { message, meta } = formatLogArgs(args);
    logStructured('error', message, meta);
  };

  console.debug = (...args: any[]) => {
    const { message, meta } = formatLogArgs(args);
    logStructured('debug', message, meta);
  };
}

// Store for previewing traces
export const localTelemetryStore: TelemetrySpan[] = [];

export function addLocalTrace(span: Omit<TelemetrySpan, 'id' | 'timestamp'>) {
  const newSpan: TelemetrySpan = {
    ...span,
    id: span.spanId || ('span-' + Math.random().toString(36).substring(2, 11)),
    timestamp: new Date().toISOString()
  };
  localTelemetryStore.unshift(newSpan);
  if (localTelemetryStore.length > 50) {
    localTelemetryStore.pop();
  }
  return newSpan;
}

const otelTracer = trace.getTracer(process.env.OTEL_SERVICE_NAME || 'interviewops-api');

// OpenTelemetry Initialization reporter
export const initOpenTelemetry = () => {
  setupConsoleInterceptor();
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  logger.info(`📡 [OpenTelemetry] Single Tracer Provider initialized for service: ${process.env.OTEL_SERVICE_NAME || 'interviewops-api'}`);
  logger.info(`📡 [OpenTelemetry] OTLP Trace Exporter active targeting: ${endpoint}`);
};

export interface AITelemetryParams {
  userId?: string;
  interviewId?: string;
  sessionId?: string;
  llmProvider?: string;
  llmModel?: string;
  promptVersion?: string;
  interviewType?: string;
  difficulty?: string;
  experienceLevel?: string;
  agentName?: string;
}

/**
 * Returns standardized OpenTelemetry attributes for AI-related spans.
 * Sensitive data (e.g. raw resume text, user answers, secrets, API keys) MUST NOT be included.
 */
export function getAITelemetryAttributes(params?: AITelemetryParams): Record<string, string> {
  return {
    'user.id': params?.userId || process.env.DEFAULT_USER_ID || 'usr-anonymous',
    'interview.id': params?.interviewId || process.env.DEFAULT_INTERVIEW_ID || 'intv-default',
    'session.id': params?.sessionId || process.env.DEFAULT_SESSION_ID || 'sess-default',
    'llm.provider': params?.llmProvider || process.env.LLM_PROVIDER || 'google',
    'llm.model': params?.llmModel || process.env.LLM_MODEL || 'gemini-2.5-flash',
    'prompt.version': params?.promptVersion || PromptService.getActiveVersion(params?.agentName),
    'interview.type': params?.interviewType || 'technical',
    'difficulty': params?.difficulty || 'medium',
    'experience.level': params?.experienceLevel || 'mid',
    'agentName': params?.agentName || 'system'
  };
}

/**
 * Custom Tracer helper integrated with OpenTelemetry API
 */
export const tracer = {
  startSpan: (
    name: string,
    traceId?: string,
    parentSpan?: any,
    initialAttributes: Record<string, string | number | boolean> = {}
  ) => {
    let ctx = context.active();
    if (parentSpan) {
      const parentOtelSpan = parentSpan.otelSpan || parentSpan;
      if (parentOtelSpan) {
        ctx = trace.setSpan(ctx, parentOtelSpan);
      }
    }
    const otelSpan = otelTracer.startSpan(name, undefined, ctx);
    const spanContext = otelSpan.spanContext();
    const otelTraceId = spanContext.traceId;
    const otelSpanId = spanContext.spanId;

    const tid = traceId || parentSpan?.traceId || otelTraceId || ('trace-' + Math.random().toString(36).substring(2, 11));
    const sid = otelSpanId || parentSpan?.spanId || ('span-' + Math.random().toString(36).substring(2, 11));
    const startTime = Date.now();

    const interviewId = String(initialAttributes['interview.id'] || initialAttributes['interviewId'] || parentSpan?.interviewId || process.env.DEFAULT_INTERVIEW_ID || 'intv-default');
    const agentName = String(initialAttributes['agentName'] || name.split(':')[0] || 'system');

    const sanitizedInitialAttrs = sanitizeLogData(initialAttributes);
    const currentAttributes: Record<string, string | number | boolean> = {};

    for (const [k, v] of Object.entries(sanitizedInitialAttrs)) {
      if (v !== undefined && v !== null) {
        const val = typeof v === 'object' ? JSON.stringify(v) : (v as string | number | boolean);
        currentAttributes[k] = val;
        otelSpan.setAttribute(k, val);
      }
    }

    return {
      traceId: tid,
      spanId: sid,
      interviewId,
      agentName,
      startTime,
      otelSpan,
      setAttribute: (key: string, value: string | number | boolean) => {
        const cleanVal = sanitizeLogData(value);
        const val = typeof cleanVal === 'object' ? JSON.stringify(cleanVal) : (cleanVal as string | number | boolean);
        currentAttributes[key] = val;
        otelSpan.setAttribute(key, val);
      },
      setAttributes: (attrs: Record<string, string | number | boolean>) => {
        const cleanAttrs = sanitizeLogData(attrs);
        for (const [k, v] of Object.entries(cleanAttrs)) {
          if (v !== undefined && v !== null) {
            const val = typeof v === 'object' ? JSON.stringify(v) : (v as string | number | boolean);
            currentAttributes[k] = val;
            otelSpan.setAttribute(k, val);
          }
        }
      },
      addEvent: (eventName: string, attributes: Record<string, string | number | boolean> = {}) => {
        const cleanAttrs = sanitizeLogData(attributes);
        otelSpan.addEvent(eventName, cleanAttrs);
        logStructured('info', `[Span Event] ${eventName}`, {
          traceId: tid,
          spanId: sid,
          interviewId,
          agentName,
          requestDuration: Date.now() - startTime,
          ...cleanAttrs
        });
      },
      end: (status: 'OK' | 'ERROR' = 'OK', attributes: Record<string, string | number | boolean> = {}) => {
        const duration = Date.now() - startTime;
        const cleanAttrs = sanitizeLogData(attributes);
        for (const [k, v] of Object.entries(cleanAttrs)) {
          if (v !== undefined && v !== null) {
            const val = typeof v === 'object' ? JSON.stringify(v) : (v as string | number | boolean);
            currentAttributes[k] = val;
            otelSpan.setAttribute(k, val);
          }
        }
        if (status === 'ERROR') {
          otelSpan.setStatus({ code: SpanStatusCode.ERROR });
        } else {
          otelSpan.setStatus({ code: SpanStatusCode.OK });
        }
        otelSpan.end();

        addLocalTrace({
          traceId: tid,
          spanId: sid,
          name,
          service: process.env.OTEL_SERVICE_NAME || 'interviewops-api',
          durationMs: duration,
          status,
          attributes: currentAttributes
        });

        logStructured(status === 'ERROR' ? 'error' : 'info', `Span ${name} completed (${status})`, {
          traceId: tid,
          spanId: sid,
          interviewId,
          agentName,
          requestDuration: duration,
          ...currentAttributes
        });
      },
      recordException: (err: Error) => {
        const duration = Date.now() - startTime;
        otelSpan.recordException(err);
        otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        otelSpan.end();

        const cleanErr = sanitizeLogData(err);
        addLocalTrace({
          traceId: tid,
          spanId: sid,
          name,
          service: process.env.OTEL_SERVICE_NAME || 'interviewops-api',
          durationMs: duration,
          status: 'ERROR',
          attributes: { ...currentAttributes, 'error.message': cleanErr.message, 'error.stack': cleanErr.stack || '' }
        });

        logStructured('error', `Span ${name} failed: ${cleanErr.message}`, {
          traceId: tid,
          spanId: sid,
          interviewId,
          agentName,
          requestDuration: duration,
          error: cleanErr.message,
          ...currentAttributes
        });
      }
    };
  },
  withSpan: <T>(span: any, fn: () => T): T => {
    const parentOtelSpan = span?.otelSpan || span;
    const ctx = parentOtelSpan ? trace.setSpan(context.active(), parentOtelSpan) : context.active();

    const logCtx: LogContext = {
      traceId: span?.traceId || parentOtelSpan?.spanContext()?.traceId || 'trace-none',
      spanId: span?.spanId || parentOtelSpan?.spanContext()?.spanId || 'span-none',
      interviewId: String(span?.interviewId || (parentOtelSpan as any)?.attributes?.['interview.id'] || process.env.DEFAULT_INTERVIEW_ID || 'intv-default'),
      agentName: String(span?.agentName || span?.name?.split(':')[0] || 'system'),
      startTime: span?.startTime || Date.now()
    };

    return context.with(ctx, () => logContextStore.run(logCtx, fn));
  }
};

/**
 * Helper to derive a clean, readable API name for OpenTelemetry trace spans.
 * E.g., /api/auth/login -> 'login', /api/auth/register -> 'register', /api/interview/start -> 'interview/start'
 */
export function getApiNameFromReq(req: Request): string {
  const urlPath = (req.originalUrl || req.url || '').split('?')[0];

  if (urlPath.includes('/auth/login')) return 'login';
  if (urlPath.includes('/auth/register')) return 'register';
  if (urlPath.includes('/auth/logout')) return 'logout';
  if (urlPath.includes('/auth/me')) return 'me';
  if (urlPath.includes('/auth/refresh')) return 'refresh';
  if (urlPath.includes('/auth/google/url')) return 'google-auth-url';
  if (urlPath.includes('/auth/google/callback') || urlPath.includes('/auth/callback')) return 'google-auth-callback';
  if (urlPath.includes('/auth/google')) return 'google-auth';
  if (urlPath.includes('/auth/request-reset')) return 'request-reset';
  if (urlPath.includes('/auth/reset-password')) return 'reset-password';
  if (urlPath.includes('/auth/2fa/login-verify')) return '2fa-login-verify';
  if (urlPath.includes('/auth/2fa/setup')) return '2fa-setup';
  if (urlPath.includes('/auth/2fa/verify')) return '2fa-verify';
  if (urlPath.includes('/auth/2fa/disable')) return '2fa-disable';
  if (urlPath.includes('/auth/change-password')) return 'change-password';
  if (urlPath.includes('/auth/logins')) return 'auth-logins';
  if (urlPath.includes('/auth/sessions')) return 'auth-sessions';

  if (urlPath.includes('/interview/start')) return 'interview/start';
  if (urlPath.includes('/interview/history')) return 'interview/history';
  if (urlPath.includes('/interview/evaluate') || urlPath.includes('/interview/answer') || urlPath.includes('/interview/session')) return 'interview/answer';
  if (urlPath.includes('/interview')) return 'interview';

  if (urlPath.includes('/resumes')) return 'resumes';
  if (urlPath.includes('/profile')) return 'profile';
  if (urlPath.includes('/progress')) return 'progress';
  if (urlPath.includes('/billing')) return 'billing';
  if (urlPath.includes('/telemetry')) return 'telemetry';
  if (urlPath.includes('/health')) return 'health';
  if (urlPath.includes('/ready')) return 'ready';

  const cleaned = urlPath.replace(/^\/api\//, '').replace(/^\//, '');
  if (!cleaned) return req.method || 'http';

  const parts = cleaned.split('/').filter(p => p && !p.match(/^[0-9a-fA-F-]{36}$/));
  return parts.length > 0 ? parts[parts.length - 1] : cleaned;
}

/**
 * requestTracing middleware tracks incoming Express requests
 */
export function requestTracing(req: Request, res: Response, next: NextFunction) {
  const traceId = (req.headers['x-trace-id'] as string) || 'trace-' + Math.random().toString(36).substring(2, 9);
  const spanId = 'span-' + Math.random().toString(36).substring(2, 9);
  const interviewId = String(req.params.interviewId || req.body?.interviewId || req.headers['x-interview-id'] || process.env.DEFAULT_INTERVIEW_ID || 'intv-default');
  const agentName = 'http';
  const startTime = Date.now();
  const apiName = getApiNameFromReq(req);

  req.headers['x-trace-id'] = traceId;
  res.setHeader('X-Trace-Id', traceId);

  // Update active OpenTelemetry HTTP span name & attributes
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.updateName(apiName);
    activeSpan.setAttribute('api.name', apiName);
    activeSpan.setAttribute('http.route', req.originalUrl || req.url);
    activeSpan.setAttribute('rpc.method', apiName);
    activeSpan.setAttribute('service.name', process.env.OTEL_SERVICE_NAME || 'interviewops-api');
  }

  const logCtx: LogContext = {
    traceId,
    spanId,
    interviewId,
    agentName,
    startTime
  };

  logContextStore.run(logCtx, () => {
    const originalEnd = res.end;
    res.end = function (this: any, chunk?: any, encoding?: any, callback?: any) {
      const duration = Date.now() - startTime;
      const status = res.statusCode >= 400 ? 'ERROR' : 'OK';
      const finalApiName = getApiNameFromReq(req);

      const currentActiveSpan = trace.getActiveSpan();
      if (currentActiveSpan) {
        currentActiveSpan.updateName(finalApiName);
        currentActiveSpan.setAttribute('api.name', finalApiName);
        currentActiveSpan.setAttribute('rpc.method', finalApiName);
      }

      addLocalTrace({
        traceId,
        spanId,
        name: finalApiName,
        service: process.env.OTEL_SERVICE_NAME || 'interviewops-api',
        durationMs: duration,
        status,
        attributes: {
          'api.name': finalApiName,
          'http.status_code': res.statusCode,
          'http.method': req.method,
          'http.url': req.originalUrl || req.url,
          'http.user_agent': req.headers['user-agent'] || 'unknown',
          'interview.id': interviewId
        }
      });

      return originalEnd.call(this, chunk, encoding, callback);
    } as any;

    next();
  });
}

/**
 * Context tracker helper
 */
export function traceContext(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Trace-Id', (req.headers['x-trace-id'] as string) || '');
  next();
}

// Automatically setup console interceptor when observability module loads
setupConsoleInterceptor();
