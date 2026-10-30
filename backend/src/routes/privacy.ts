import { Router } from 'express';
import { z } from 'zod';
import { destroySession } from '../auth.js';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { parse, uid, wrap } from './util.js';

export const privacyRouter = Router();

privacyRouter.get(
  '/export',
  wrap(async (req, res) => {
    const u = uid(req);
    const [user, accounts, transactions, goals, budgets, imports] = await Promise.all([
      query('SELECT id, email, created_at FROM users WHERE id=$1', [u]),
      query(
        'SELECT id, name, institution, trim(currency) AS currency, source, created_at FROM accounts WHERE user_id=$1',
        [u],
      ),
      query(
        'SELECT id, account_id, booked_on, description, amount_minor, trim(currency) AS currency, category, source_ref, is_demo FROM transactions WHERE user_id=$1 ORDER BY booked_on',
        [u],
      ),
      query(
        'SELECT id, name, target_minor, current_minor, trim(currency) AS currency, deadline FROM goals WHERE user_id=$1',
        [u],
      ),
      query(
        'SELECT id, category, limit_minor, trim(currency) AS currency FROM budgets WHERE user_id=$1',
        [u],
      ),
      query(
        'SELECT id, filename, file_type, status, created_at FROM import_batches WHERE user_id=$1',
        [u],
      ),
    ]);
    res.setHeader('Content-Disposition', 'attachment; filename="finup-export.json"');
    res.json({
      exported_at: new Date().toISOString(),
      amounts_are: 'signed integer minor units (e.g. kuruş/cents)',
      user: user[0],
      accounts,
      transactions,
      goals,
      budgets,
      imports,
    });
  }),
);

privacyRouter.post(
  '/delete-account',
  wrap(async (req, res) => {
    const { confirmEmail } = parse(
      z.object({ confirmEmail: z.string().trim().toLowerCase() }),
      req.body,
    );
    const rows = await query<{ email: string }>('SELECT email FROM users WHERE id=$1', [uid(req)]);
    if (rows[0]?.email !== confirmEmail)
      throw new ApiError(
        400,
        'CONFIRMATION_MISMATCH',
        'The email you typed does not match your account.',
      );
    await destroySession(req, res);
    await query('DELETE FROM users WHERE id=$1', [uid(req)]); // cascades to every owned row
    res.status(204).end();
  }),
);
