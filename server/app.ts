import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from './config';
import { requestTracing, traceContext } from './observability';
import { authenticateJWT } from './middleware/jwt.middleware';
import { userContextMiddleware } from './middleware/userContext.middleware';
import { apiRouter } from './api';
import { notFoundHandler, globalErrorHandler } from './middleware/error_handling';

import { AuthController } from './api/auth/auth.controller';
import { authLimiter } from './middleware/rateLimit';
import { getSupabaseClient, isSupabaseConfigured } from './services/supabase';

export const app = express();

// Disable X-Powered-By header
app.disable('x-powered-by');

// Trust reverse proxy (Cloud Run, Nginx, ALB) for accurate client IP resolution
app.set('trust proxy', config.trustProxy);

// Security Middlewares using Helmet and CORS
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

app.use(cors({
  origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id'],
  credentials: true,
}));

// Enable Gzip/Deflate compression for response payloads
app.use(compression());

// Enable JSON parser, URL-encoded parser, and text parser with request size limits
app.use(express.json({ limit: config.maxRequestBodySize }));
app.use(express.urlencoded({ limit: config.maxRequestBodySize, extended: true }));
app.use(express.text({ limit: config.maxRequestBodySize }));

// Attach OpenTelemetry Tracing
app.use(requestTracing);
app.use(traceContext);

// Health (Liveness) checks
app.get(['/health', '/healthz'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Readiness check
app.get('/ready', async (req, res) => {
  const dependencies: Record<string, any> = {
    supabase: 'not_configured'
  };
  let isReady = true;

  try {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        dependencies.supabase = 'failed_to_initialize';
        isReady = false;
      } else {
        // Query resumes table (limit 1) to check connectivity
        const { error } = await supabase.from('resumes').select('id').limit(1);
        if (error) {
          dependencies.supabase = `error: ${error.message}`;
          isReady = false;
        } else {
          dependencies.supabase = 'connected';
        }
      }
    }
  } catch (err: any) {
    dependencies.supabase = `exception: ${err.message || err}`;
    isReady = false;
  }

  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      dependencies
    });
  } else {
    res.status(503).json({
      status: 'unready',
      timestamp: new Date().toISOString(),
      dependencies
    });
  }
});

// Attach Application-wide JWT Authentication Middleware
app.use(authenticateJWT);
app.use(userContextMiddleware);

// Mount Master Modular API Router under /api
app.use('/api', apiRouter);

// OAuth Callback handling for /auth/callback
app.get(['/auth/callback', '/auth/callback/'], authLimiter, AuthController.googleCallback);

// Catch-all 404 handler for unmatched API routes
app.use('/api/*', notFoundHandler);

// Centralized Application-Wide Error Handler Middleware
app.use(globalErrorHandler);
