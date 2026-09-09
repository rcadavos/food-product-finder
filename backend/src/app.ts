import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes/index';
import { webhooksRouter } from './routes/webhooks';

/**
 * Builds the Express application. It neither listens nor touches the database,
 * so tests can mount it directly with Supertest.
 */
export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: false }));

  // Stripe signs the exact bytes it sent, so this route must be mounted with a
  // raw body parser before any JSON parsing turns them into an object. Its cap
  // is stated rather than inherited from body-parser: the route is deliberately
  // unauthenticated and unthrottled, and Stripe never sends close to a megabyte.
  app.use(
    '/api/webhooks/stripe',
    express.raw({ type: 'application/json', limit: '1mb' }),
    webhooksRouter,
  );

  app.use(express.json({ limit: '100kb' }));
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
