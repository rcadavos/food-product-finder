import { env, isTest } from '../config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// A noisy test run hides the assertion output that actually matters.
const silent = isTest && env.LOG_LEVEL !== 'debug';
const threshold = SEVERITY[env.LOG_LEVEL];

/** Errors serialise to `{}` through `JSON.stringify`, which loses the whole point of logging them. */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return typeof value === 'bigint' ? value.toString() : value;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (silent || SEVERITY[level] < threshold) return;
  const entry = { ts: new Date().toISOString(), level, msg: message, ...(meta ? { meta } : {}) };
  let line: string;
  try {
    line = JSON.stringify(entry, replacer);
  } catch {
    line = JSON.stringify({ ts: entry.ts, level, msg: message, meta: '[unserialisable]' });
  }
  const write = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  write(line);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>): void => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>): void => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>): void => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>): void => emit('error', message, meta),
};
