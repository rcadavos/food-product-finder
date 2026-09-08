import { Router } from 'express';
import { demoUser } from '../middleware/demoUser';
import { billingRouter } from './billing';
import { meRouter } from './me';
import { productsRouter } from './products';
import { searchesRouter } from './searches';

export const apiRouter: Router = Router();

// Health stays in front of the demo-user middleware so a probe never touches
// the database.
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

apiRouter.use(demoUser);
apiRouter.use('/me', meRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/searches', searchesRouter);
apiRouter.use('/billing', billingRouter);
