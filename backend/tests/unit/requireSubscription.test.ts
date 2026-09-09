/**
 * The gate is exercised through a real Express pipeline so the assertions cover
 * what a client actually receives: the status code and the error envelope
 * produced by `errorHandler`, not just the value handed to `next()`.
 */

import express, { type Express, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';
import { requireSubscription } from '../../src/middleware/requireSubscription';

type Entitlements = { nutrition: boolean } | undefined;

interface GatedApp {
  app: Express;
  protectedHandler: Mock;
}

function buildGatedApp(entitlements: Entitlements): GatedApp {
  const protectedHandler = vi.fn();
  const app = express();

  app.get(
    '/api/products/:barcode/nutrition',
    (req, _res, next) => {
      req.entitlements = entitlements;
      next();
    },
    requireSubscription,
    (req: Request, res: Response) => {
      protectedHandler(req.params.barcode);
      res.json({ barcode: req.params.barcode, nutrition: { nutrients: [] } });
    },
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, protectedHandler };
}

describe('requireSubscription', () => {
  it('lets the request through to the protected handler when nutrition is entitled', async () => {
    const { app, protectedHandler } = buildGatedApp({ nutrition: true });

    const response = await request(app).get('/api/products/3017624010701/nutrition');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      barcode: '3017624010701',
      nutrition: { nutrients: [] },
    });
    expect(protectedHandler).toHaveBeenCalledTimes(1);
    expect(protectedHandler).toHaveBeenCalledWith('3017624010701');
  });

  it('answers 402 SUBSCRIPTION_REQUIRED and skips the handler when nutrition is not entitled', async () => {
    const { app, protectedHandler } = buildGatedApp({ nutrition: false });

    const response = await request(app).get('/api/products/3017624010701/nutrition');

    expect(response.status).toBe(402);
    expect(response.body).toEqual({
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'An active subscription is required to read nutritional values.',
      },
    });
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('answers 402 SUBSCRIPTION_REQUIRED when no entitlements were attached at all', async () => {
    const { app, protectedHandler } = buildGatedApp(undefined);

    const response = await request(app).get('/api/products/3017624010701/nutrition');

    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('returns a JSON envelope that leaks no details about the subscription check', async () => {
    const { app } = buildGatedApp({ nutrition: false });

    const response = await request(app).get('/api/products/3017624010701/nutrition');

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(Object.keys(response.body)).toEqual(['error']);
    expect(Object.keys(response.body.error).sort()).toEqual(['code', 'message']);
  });

  it('forwards an HttpError carrying status 402 instead of writing the response itself', () => {
    const req = { entitlements: { nutrition: false } } as unknown as Request;
    const res = {
      status: vi.fn(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    requireSubscription(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwarded: unknown = next.mock.calls[0]?.[0];
    expect(forwarded).toMatchObject({ status: 402, code: 'SUBSCRIPTION_REQUIRED' });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next with no argument for an entitled request', () => {
    const req = { entitlements: { nutrition: true } } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn();

    requireSubscription(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
