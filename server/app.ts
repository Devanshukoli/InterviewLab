import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { requestTracing, traceContext } from './observability';
import { authenticateJWT } from './middleware/jwt.middleware';
import { apiRouter } from './api';
import { notFoundHandler, globalErrorHandler } from './middleware/error_handling';

import { AuthController } from './api/auth/auth.controller';

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

// Enable JSON parser, URL-encoded parser, and text parser with request size limits
app.use(express.json({ limit: config.maxRequestBodySize }));
app.use(express.urlencoded({ limit: config.maxRequestBodySize, extended: true }));
app.use(express.text({ limit: config.maxRequestBodySize }));

// Attach OpenTelemetry Tracing
app.use(requestTracing);
app.use(traceContext);

// Attach Application-wide JWT Authentication Middleware
app.use(authenticateJWT);

// Mount Master Modular API Router under /api
app.use('/api', apiRouter);

// OAuth Callback handling for /auth/callback
app.get(['/auth/callback', '/auth/callback/'], AuthController.googleCallback);

// Catch-all 404 handler for unmatched API routes
app.use('/api/*', notFoundHandler);

// Centralized Application-Wide Error Handler Middleware
app.use(globalErrorHandler);
