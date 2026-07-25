import express from 'express';
import path from 'path';
import { app } from './app';
import { config } from './config';
import { initOpenTelemetry } from './observability';

const rootDir = process.cwd();

// Initialize Observability Agents & SDKs
initOpenTelemetry();

// Serving compiled static files in Production or attaching Vite middleware in Dev
async function startServer() {
  if (config.isProd) {
    const distPath = path.join(rootDir, 'dist');
    console.log(`📦 [Production Mode] Serving client assets from: ${distPath}`);
    
    app.use(express.static(distPath));
    
    // Single-page-app routing fallback: serve index.html for unknown routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('🚧 [Development Mode] Attaching Vite middleware for development.');
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('⚠️ Could not attach Vite middleware:', err);
    }
  }

  // Start the cohesive server
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`🚀 [InterviewOps Backend] Listening on http://0.0.0.0:${config.port}`);
    console.log(`🔬 [Observability] Endpoint http://0.0.0.0:${config.port}/api/telemetry is live.`);
  });

  return server;
}

const serverPromise = startServer();
export default serverPromise;
