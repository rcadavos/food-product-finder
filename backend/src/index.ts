import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { disconnectPrisma } from './lib/prisma';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const server: Server = createApp().listen(env.PORT, () => {
  logger.info('Food Product Finder API started', {
    url: `http://localhost:${env.PORT}/api`,
    nodeEnv: env.NODE_ENV,
  });
});

server.on('error', (error: NodeJS.ErrnoException) => {
  const hint = error.code === 'EADDRINUSE' ? `port ${env.PORT} is already in use` : error.message;
  logger.error('The API server could not start', { hint, error });
  process.exit(1);
});

let shuttingDown = false;

function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { signal });

  // A connection that refuses to drain must not keep the process alive forever.
  const forceExit = setTimeout(() => {
    logger.warn('Shutdown timed out, exiting anyway');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await closeServer();
    await disconnectPrisma();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown failed', { error });
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
