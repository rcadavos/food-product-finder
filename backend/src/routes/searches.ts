import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../lib/httpError';
import { emptyToUndefined } from '../lib/zodHelpers';
import { clearSearches, getRecentSearches } from '../services/searchHistoryService';
import type { RecentSearch } from '../types/api';

const listQuerySchema = z.object({
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50).default(10)),
});

export const searchesRouter: Router = Router();

searchesRouter.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', z.flattenError(parsed.error));
  }

  const searches: RecentSearch[] = await getRecentSearches({
    userId: req.user!.id,
    limit: parsed.data.limit,
  });

  res.json({ searches });
});

searchesRouter.delete('/', async (req, res) => {
  await clearSearches(req.user!.id);
  res.status(204).end();
});
