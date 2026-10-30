import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { answer, buildFacts, type GoalRow } from '../ai/assistant.js';
import { todayYmd } from '../clock.js';
import { config } from '../config.js';
import { query } from '../db.js';
import { loadTxs } from './data.js';
import { parse, uid, wrap } from './util.js';

export const assistantRouter = Router();
const limiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

assistantRouter.get('/status', (_req, res) => {
  res.json({
    mode: config.anthropicApiKey ? 'llm' : 'fallback',
    configured: Boolean(config.anthropicApiKey),
  });
});

assistantRouter.post(
  '/',
  limiter,
  wrap(async (req, res) => {
    const { question } = parse(z.object({ question: z.string().trim().min(1).max(500) }), req.body);
    // Authorization first: only the caller's own rows are ever loaded.
    const userId = uid(req);
    const [txs, goals] = await Promise.all([
      loadTxs(userId),
      query<GoalRow>(
        'SELECT name, target_minor, current_minor, trim(currency) AS currency, deadline FROM goals WHERE user_id=$1',
        [userId],
      ),
    ]);
    const facts = buildFacts(question, txs, goals, todayYmd());
    res.json(await answer(question, facts));
  }),
);
