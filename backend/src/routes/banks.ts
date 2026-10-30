import { Router } from 'express';
import { TURKISH_BANKS } from '../banks/turkey.js';
import { bankStatus, getConfiguredProvider } from '../banks/provider.js';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { idParam, uid, wrap } from './util.js';

export const banksRouter = Router();

banksRouter.get('/status', (_req, res) => {
  res.json(bankStatus());
});

banksRouter.get('/institutions', (_req, res) => {
  res.json({ country: 'TR', institutions: TURKISH_BANKS, live_sync: bankStatus().configured });
});

banksRouter.get(
  '/connections',
  wrap(async (req, res) => {
    // token_ciphertext is deliberately never selected.
    res.json({
      connections: await query(
        'SELECT id, provider, institution_id, status, last_synced_at FROM bank_connections WHERE user_id=$1',
        [uid(req)],
      ),
    });
  }),
);

banksRouter.post(
  '/connect',
  wrap(async () => {
    if (!getConfiguredProvider())
      throw new ApiError(409, 'BANK_NOT_CONFIGURED', bankStatus().reason, {
        alternatives: bankStatus().alternatives,
      });
    throw new ApiError(501, 'NOT_IMPLEMENTED', 'Provider consent flow is not implemented.');
  }),
);

banksRouter.get(
  '/callback',
  wrap(async () => {
    throw new ApiError(409, 'BANK_NOT_CONFIGURED', bankStatus().reason);
  }),
);

banksRouter.delete(
  '/connections/:id',
  wrap(async (req, res) => {
    const rows = await query(
      "UPDATE bank_connections SET status='revoked', token_ciphertext=NULL WHERE id=$1 AND user_id=$2 RETURNING id",
      [idParam(req), uid(req)],
    );
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Connection not found.');
    res.status(204).end();
  }),
);
