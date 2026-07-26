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
  base: { service: process.env.OTEL_SERVICE_NAME || 'interviewops-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const meter = metrics.getMeter(process.env.OTEL_SERVICE_NAME || 'interviewops-api');

// OpenTelemetry Metrics Instruments
export const interviewsTotalCounter = meter.createCounter('interviews_total', {
  description: 'Total number of interviews initialized or completed',
});

export const questionsGeneratedTotalCounter = meter.createCounter('questions_generated_total', {
  description: 'Total number of interview questions generated',
});

export const evaluationCompletedTotalCounter = meter.createCounter('evaluation_completed_total', {
  description: 'Total number of evaluations completed',
});

export const llmRequestDurationHistogram = meter.createHistogram('llm_request_duration', {
  description: 'Duration of LLM requests in milliseconds',
  unit: 'ms',
});

export const llmRequestFailuresCounter = meter.createCounter('llm_request_failures', {
  description: 'Total number of failed LLM requests',
});

export const recordMetric = {
  recordInterviewStarted: (attributes: Record<string, string | number | boolean> = {}) => {
    interviewsTotalCounter.add(1, attributes);
  },
  recordQuestionsGenerated: (count: number = 1, attributes: Record<string, string | number | boolean> = {}) => {
    questionsGeneratedTotalCounter.add(count, attributes);
  },
  recordEvaluationCompleted: (count: number = 1, attributes: Record<string, string | number | boolean> = {}) => {
    evaluationCompletedTotalCounter.add(count, attributes);
  },
  recordLLMRequestDuration: (durationMs: number, attributes: Record<string, string | number | boolean> = {}) => {
    llmRequestDurationHistogram.record(durationMs, attributes);
  },
  recordLLMRequestFailure: (attributes: Record<string, string | number | boolean> = {}) => {
    llmRequestFailuresCounter.add(1, attributes);
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

export function logStructured(
  level: string,
  message: string,
  meta: Record<string, any> = {}
): StructuredLogEntry {
  const currentStore = logContextStore.getStore();
  const activeOtelSpan = trace.getActiveSpan();
  const activeSpanContext = activeOtelSpan?.spanContext();

  const traceId = meta.traceId || currentStore?.traceId || activeSpanContext?.traceId || 'trace-none';
  const spanId = meta.spanId || currentStore?.spanId || activeSpanContext?.spanId || 'span-none';
  const interviewId = meta.interviewId || currentStore?.interviewId || (activeOtelSpan as any)?.attributes?.['interview.id'] || process.env.DEFAULT_INTERVIEW_ID || 'intv-default';
  const agentName = meta.agentName || currentStore?.agentName || (activeOtelSpan as any)?.attributes?.['agentName'] || 'system';
  const startTime = currentStore?.startTime || Date.now();
  const requestDuration = typeof meta.requestDuration === 'number' ? meta.requestDuration : (Date.now() - startTime);

  const { traceId: _t, spanId: _s, interviewId: _i, agentName: _a, requestDuration: _d, ...extraMeta } = meta;

  const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
  const sanitizedMeta = sanitizeLogData(extraMeta);

  const logEntry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: String(sanitizedMessage),
    traceId: String(traceId),
    spanId: String(spanId),
    interviewId: String(interviewId),
    agentName: String(agentName),
    requestDuration,
    ...sanitizedMeta
  };

  // pino's own level names are a superset of ours ('debug' included); anything unrecognized
  // (e.g. a stray custom level) falls back to 'info' so we never throw from a logging call.
  const pinoLevel = (['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const).includes(level as any)
    ? (level as pino.Level)
    : 'info';

  // Pass fields as the first arg (pino merges them into the JSON line) and the message second.
  // This is also the call shape @opentelemetry/instrumentation-pino hooks into to attach
  // trace_id/span_id/trace_flags and forward the record to SigNoz.
  pinoLogger[pinoLevel](
    {
      traceId: logEntry.traceId,
      spanId: logEntry.spanId,
      interviewId: logEntry.interviewId,
      agentName: logEntry.agentName,
      requestDuration: logEntry.requestDuration,
      ...sanitizedMeta,
    },
    logEntry.message
  );

  addLocalLog(logEntry);

  return logEntry;
}

export const logger = {
  info: (message: string, meta: Record<string, any> = {}) => logStructured('info', message, meta),
  warn: (message: string, meta: Record<string, any> = {}) => logStructured('warn', message, meta),
  error: (message: string, meta: Record<string, any> = {}) => logStructured('error', message, meta),
  debug: (message: string, meta: Record<string, any> = {}) => logStructured('debug', message, meta),
  log: (level: string, message: string, meta: Record<string, any> = {}) => logStructured(level, message, meta)
};

let consoleIntercepted = false;

export function setupConsoleInterceptor() {
  if (consoleIntercepted) return;
  consoleIntercepted = true;

  // NOTE: logStructured() no longer writes to console at all (it writes via pinoLogger,
  // which owns its own output stream) — so there's no risk of console.log calling itself
  // recursively here anymore. Any raw console.* call anywhere in the app (agents, libraries,
  // etc.) gets funneled through the same pino instance so it's sanitized, trace-correlated,
  // and shipped to SigNoz just like everything logged via `logger.*` directly.
  console.log = (...args: any[]) => {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(sanitizeLogData(a)) : String(a))).join(' ');
    logStructured('info', msg);
  };

  console.warn = (...args: any[]) => {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(sanitizeLogData(a)) : String(a))).join(' ');
    logStructured('warn', msg);
  };

  console.error = (...args: any[]) => {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(sanitizeLogData(a)) : String(a))).join(' ');
    logStructured('error', msg);
  };
}

// Global simulation store for previewing traces
export const localTelemetryStore: TelemetrySpan[] = [
  {
    id: 'span-auth-01',
    traceId: 'trace-user-login-102',
    spanId: 'span-auth-01',
    name: 'POST /api/auth/login',
    service: 'interviewops-api',
    durationMs: 42,
    status: 'OK',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    attributes: { 'http.status_code': 200, 'auth.role': 'user' }
  },
  {
    id: 'span-db-01',
    traceId: 'trace-user-login-102',
    spanId: 'span-db-01',
    name: 'SELECT FROM users',
    service: 'supabase-postgresql',
    durationMs: 12,
    status: 'OK',
    timestamp: new Date(Date.now() - 299900).toISOString(),
    attributes: { 'db.system': 'postgresql', 'db.name': 'interviewops' }
  },
  {
    id: 'span-resume-01',
    traceId: 'trace-resume-analysis-948',
    spanId: 'span-resume-01',
    name: 'POST /api/interview/upload-resume',
    service: 'interviewops-api',
    durationMs: 1420,
    status: 'OK',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    attributes: { 'http.status_code': 200, 'file.size_bytes': 148200 }
  },
  {
    id: 'span-resume-agent-01',
    traceId: 'trace-resume-analysis-948',
    spanId: 'span-resume-agent-01',
    name: 'resume-agent:parseAndExtract',
    service: 'resume-agent',
    durationMs: 980,
    status: 'OK',
    timestamp: new Date(Date.now() - 119500).toISOString(),
    attributes: { 'ai.provider': 'gemini', 'ai.model': 'gemini-1.5-flash' }
  }
];

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
    'llm.model': params?.llmModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
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
 * requestTracing middleware tracks incoming Express requests
 */
export function requestTracing(req: Request, res: Response, next: NextFunction) {
  const traceId = (req.headers['x-trace-id'] as string) || 'trace-' + Math.random().toString(36).substring(2, 9);
  const spanId = 'span-' + Math.random().toString(36).substring(2, 9);
  const interviewId = String(req.params.interviewId || req.body?.interviewId || req.headers['x-interview-id'] || process.env.DEFAULT_INTERVIEW_ID || 'intv-default');
  const agentName = 'http';
  const startTime = Date.now();

  req.headers['x-trace-id'] = traceId;
  res.setHeader('X-Trace-Id', traceId);

  const logCtx: LogContext = {
    traceId,
    spanId,
    interviewId,
    agentName,
    startTime
  };

  logContextStore.run(logCtx, () => {
    const originalEnd = res.end;
    res.end = function(this: any, chunk?: any, encoding?: any, callback?: any) {
      const duration = Date.now() - startTime;
      const status = res.statusCode >= 400 ? 'ERROR' : 'OK';

      addLocalTrace({
        traceId,
        spanId,
        name: `${req.method} ${req.originalUrl || req.url}`,
        service: 'interviewops-api',
        durationMs: duration,
        status,
        attributes: {
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
