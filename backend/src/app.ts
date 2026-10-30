import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { requireAuth } from './auth.js';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { assistantRouter } from './routes/assistant.js';
import { authRouter } from './routes/auth.js';
import { banksRouter } from './routes/banks.js';
import { dataRouter } from './routes/data.js';
import { importsRouter } from './routes/imports.js';
import { privacyRouter } from './routes/privacy.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'style-src': ["'self'", 'https:', "'unsafe-inline'"],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        },
      },
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/imports', requireAuth, importsRouter);
  app.use('/api/assistant', requireAuth, assistantRouter);
  app.use('/api/banks', requireAuth, banksRouter);
  app.use('/api', requireAuth, privacyRouter);
  app.use('/api', requireAuth, dataRouter);
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Route not found.')));

  // Production: serve the built frontend from the same origin so a phone needs only one HTTPS URL.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  if (config.nodeEnv !== 'test' && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // Centralized error handler: one shape for every failure, no stack traces to clients.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (err instanceof ApiError) {
      res
        .status(err.status)
        .json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      res.status(tooBig ? 413 : 400).json({
        error: {
          code: tooBig ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
          message: tooBig
            ? `File is larger than ${Math.round(config.maxUploadBytes / 1048576)} MB.`
            : err.message,
        },
      });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res
        .status(400)
        .json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } });
      return;
    }
    console.error(err);
    res
      .status(500)
      .json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
  });
  return app;
}
