import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { CATEGORIES } from '../categorize.js';
import { config } from '../config.js';
import { query, tx, type Queryable } from '../db.js';
import { ApiError } from '../errors.js';
import { parseDate } from '../dates.js';
import { extractPdfLines, pdfLinesToGrid } from '../import/pdf.js';
import { detectKind, readCsv, readXlsx, type Grid } from '../import/readers.js';
import {
  computeKey,
  guessMapping,
  stageRows,
  type Mapping,
  type StagedRowDraft,
} from '../import/normalize.js';
import { detectCurrency, parseAmount } from '../money.js';
import { idParam, parse, uid, wrap } from './util.js';

export const importsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});
const MAX_ROWS = 20000;

async function getBatch(id: string, userId: string) {
  const rows = await query<{
    id: string;
    account_id: string;
    filename: string;
    file_type: string;
    status: string;
    grid: Grid;
    mapping: Mapping | null;
    notes: string[];
    created_at: string;
  }>(
    'SELECT id, account_id, filename, file_type, status, grid, mapping, notes, created_at FROM import_batches WHERE id=$1 AND user_id=$2',
    [id, userId],
  );
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Import not found.');
  return rows[0];
}

async function insertRows(
  db: Queryable,
  batchId: string,
  userId: string,
  rows: StagedRowDraft[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params: unknown[] = [];
    const values = chunk.map((r, j) => {
      const o = j * 13;
      params.push(
        batchId,
        userId,
        r.rowRef,
        JSON.stringify(r.raw),
        r.bookedOn,
        r.description,
        r.amountMinor,
        r.currency,
        r.category,
        r.status,
        JSON.stringify(r.issues),
        r.include,
        r.dedupeKey,
      );
      return `(${Array.from({ length: 13 }, (_, k) => `$${o + k + 1}`).join(',')})`;
    });
    await query(
      `INSERT INTO staged_rows(batch_id,user_id,row_ref,raw,booked_on,description,amount_minor,currency,category,status,issues,include,dedupe_key) VALUES ${values.join(',')}`,
      params,
      db,
    );
  }
}

async function existingKeys(userId: string, accountId: string): Promise<Set<string>> {
  const rows = await query<{ dedupe_key: string }>(
    'SELECT dedupe_key FROM transactions WHERE user_id=$1 AND account_id=$2 AND dedupe_key IS NOT NULL',
    [userId, accountId],
  );
  return new Set(rows.map((r) => r.dedupe_key));
}

async function counts(batchId: string) {
  const rows = await query<{ status: string; include: boolean; n: number; confirmed: boolean }>(
    'SELECT status, include, confirmed, count(*)::int AS n FROM staged_rows WHERE batch_id=$1 GROUP BY status, include, confirmed',
    [batchId],
  );
  const c = {
    total: 0,
    ok: 0,
    flagged: 0,
    flagged_unconfirmed: 0,
    duplicate: 0,
    invalid: 0,
    included: 0,
  };
  for (const r of rows) {
    c.total += r.n;
    c[r.status as 'ok' | 'flagged' | 'duplicate' | 'invalid'] += r.n;
    if (r.status === 'flagged' && r.include && !r.confirmed) c.flagged_unconfirmed += r.n;
    if (r.include) c.included += r.n;
  }
  return c;
}

const rowCols =
  'id, row_ref, raw, booked_on, description, amount_minor, currency, category, status, issues, include, confirmed';

importsRouter.get(
  '/',
  wrap(async (req, res) => {
    const rows = await query(
      'SELECT id, filename, file_type, status, created_at, committed_at FROM import_batches WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [uid(req)],
    );
    res.json({ imports: rows });
  }),
);

importsRouter.post(
  '/',
  upload.single('file'),
  wrap(async (req, res) => {
    const userId = uid(req);
    const body = parse(
      z.object({
        accountId: z.string().uuid().optional(),
        currency: z
          .string()
          .length(3)
          .transform((s) => s.toUpperCase())
          .optional(),
        accountName: z.string().trim().min(1).max(80).optional(),
      }),
      req.body ?? {},
    );
    if (!req.file) throw new ApiError(400, 'NO_FILE', 'Attach a file in the "file" field.');
    const kind = detectKind(req.file.originalname, req.file.buffer);
    if (!kind)
      throw new ApiError(
        415,
        'UNSUPPORTED_FORMAT',
        'Unsupported file type. Upload a .pdf, .csv or .xlsx file.',
      );

    let grid: Grid;
    const notes: string[] = [];
    if (kind === 'csv') grid = readCsv(req.file.buffer);
    else if (kind === 'xlsx') grid = await readXlsx(req.file.buffer);
    else {
      const { grid: g, skippedLines } = pdfLinesToGrid(await extractPdfLines(req.file.buffer));
      if (g.length <= 1)
        throw new ApiError(
          422,
          'PDF_NO_TRANSACTIONS',
          'No transaction rows were recognised in this PDF. Try exporting the statement as CSV or XLSX from your bank.',
        );
      grid = g;
      notes.push(
        `PDF text was parsed heuristically; ${skippedLines} non-transaction line(s) were ignored. Review every row.`,
      );
    }
    if (grid.length === 0) throw new ApiError(422, 'EMPTY_FILE', 'The file contains no rows.');
    if (grid.length > MAX_ROWS)
      throw new ApiError(
        413,
        'TOO_MANY_ROWS',
        `The file has more than ${MAX_ROWS} rows. Split it and upload in parts.`,
      );

    let accountId = body.accountId;
    let accountCurrency = body.currency ?? 'TRY';
    if (accountId) {
      const a = await query<{ currency: string }>(
        'SELECT currency FROM accounts WHERE id=$1 AND user_id=$2',
        [accountId, userId],
      );
      if (!a[0]) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
      accountCurrency = a[0].currency.trim();
    } else {
      const name = body.accountName ?? 'Imported statements';
      const found = await query<{ id: string; currency: string }>(
        "SELECT id, currency FROM accounts WHERE user_id=$1 AND name=$2 AND source='statement' AND currency=$3",
        [userId, name, accountCurrency],
      );
      accountId =
        found[0]?.id ??
        (
          await query<{ id: string }>(
            "INSERT INTO accounts(user_id,name,currency,source) VALUES ($1,$2,$3,'statement') RETURNING id",
            [userId, name, accountCurrency],
          )
        )[0]!.id;
    }

    const guess = guessMapping(grid, accountCurrency);
    const result = await tx(async (db) => {
      const status = guess.complete ? 'review' : 'needs_mapping';
      const b = await query<{ id: string }>(
        'INSERT INTO import_batches(user_id,account_id,filename,file_type,status,grid,mapping,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [
          userId,
          accountId,
          req.file!.originalname.slice(0, 200),
          kind,
          status,
          JSON.stringify(grid),
          guess.mapping ? JSON.stringify(guess.mapping) : null,
          JSON.stringify(notes),
        ],
        db,
      );
      const batchId = b[0]!.id;
      if (guess.mapping) {
        const staged = stageRows(grid, guess.mapping, {
          accountId: accountId!,
          existingKeys: await existingKeys(userId, accountId!),
        });
        await insertRows(db, batchId, userId, staged.rows);
        if (staged.notes.length)
          await query(
            'UPDATE import_batches SET notes = notes || $2::jsonb WHERE id=$1',
            [batchId, JSON.stringify(staged.notes)],
            db,
          );
      }
      return batchId;
    });

    res.status(201).json(await batchView(result, userId, 0, 200));
  }),
);

async function batchView(id: string, userId: string, offset: number, limit: number) {
  const b = await getBatch(id, userId);
  const base = {
    id: b.id,
    filename: b.filename,
    file_type: b.file_type,
    status: b.status,
    notes: b.notes,
    mapping: b.mapping,
  };
  if (b.status === 'needs_mapping') {
    const g = guessMapping(b.grid, 'TRY');
    return {
      ...base,
      columns: b.grid.slice(0, 15),
      suggested_mapping: g.partial,
      rows: [],
      counts: null,
    };
  }
  const rows = await query(
    `SELECT ${rowCols} FROM staged_rows WHERE batch_id=$1 ORDER BY row_ref LIMIT $2 OFFSET $3`,
    [id, limit, offset],
  );
  return { ...base, rows, counts: await counts(id), offset, limit };
}

importsRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(500).default(200),
        status: z.enum(['ok', 'flagged', 'duplicate', 'invalid']).optional(),
      }),
      req.query,
    );
    const id = idParam(req);
    if (q.status) {
      await getBatch(id, uid(req));
      const rows = await query(
        `SELECT ${rowCols} FROM staged_rows WHERE batch_id=$1 AND status=$2 ORDER BY row_ref LIMIT $3 OFFSET $4`,
        [id, q.status, q.limit, q.offset],
      );
      res.json({ rows, counts: await counts(id) });
      return;
    }
    res.json(await batchView(id, uid(req), q.offset, q.limit));
  }),
);

const colIdx = z.number().int().min(0).max(200).nullable();
const mappingSchema = z.object({
  headerRow: z.number().int().min(-1).max(100), // -1 = the file has no header row
  date: colIdx,
  description: colIdx,
  amount: colIdx,
  debit: colIdx,
  credit: colIdx,
  balance: colIdx,
  currency: colIdx,
  type: colIdx,
  defaultCurrency: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase()),
  decimalSeparator: z.enum(['auto', 'comma', 'dot']).default('auto'),
  dateOrder: z.enum(['dmy', 'mdy']).optional(),
});

importsRouter.post(
  '/:id/mapping',
  wrap(async (req, res) => {
    const userId = uid(req);
    const id = idParam(req);
    const m = parse(mappingSchema, req.body) as Mapping;
    const b = await getBatch(id, userId);
    if (b.status === 'committed' || b.status === 'discarded')
      throw new ApiError(409, 'BATCH_CLOSED', 'This import is already closed.');
    if (
      m.date === null ||
      m.description === null ||
      (m.amount === null && m.debit === null && m.credit === null)
    ) {
      throw new ApiError(
        400,
        'MAPPING_INCOMPLETE',
        'Map at least the date, description and either an amount column or debit/credit columns.',
      );
    }
    const width = Math.max(...b.grid.map((r) => r.length));
    for (const v of [
      m.date,
      m.description,
      m.amount,
      m.debit,
      m.credit,
      m.balance,
      m.currency,
      m.type,
    ]) {
      if (v !== null && v >= width)
        throw new ApiError(
          400,
          'MAPPING_OUT_OF_RANGE',
          'A mapped column does not exist in the file.',
        );
    }
    await tx(async (db) => {
      await query('DELETE FROM staged_rows WHERE batch_id=$1', [id], db);
      const staged = stageRows(b.grid, m, {
        accountId: b.account_id,
        existingKeys: await existingKeys(userId, b.account_id),
      });
      await insertRows(db, id, userId, staged.rows);
      await query(
        "UPDATE import_batches SET status='review', mapping=$2 WHERE id=$1",
        [id, JSON.stringify(m)],
        db,
      );
    });
    res.json(await batchView(id, userId, 0, 200));
  }),
);

const patchSchema = z.object({
  bookedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  description: z.string().trim().min(1).max(300).optional(),
  amount: z.string().trim().min(1).max(40).optional(), // magnitude or signed, as typed by the user
  direction: z.enum(['in', 'out']).optional(),
  currency: z.string().length(3).optional(),
  category: z.enum(CATEGORIES).optional(),
  include: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});

importsRouter.patch(
  '/:id/rows/:rowId',
  wrap(async (req, res) => {
    const userId = uid(req);
    const batch = await getBatch(idParam(req), userId);
    if (batch.status !== 'review')
      throw new ApiError(409, 'BATCH_CLOSED', 'This import is not in review.');
    const p = parse(patchSchema, req.body);
    const cur = (
      await query<{
        id: string;
        row_ref: number;
        booked_on: string | null;
        description: string;
        amount_minor: number | null;
        currency: string | null;
        category: string;
        status: string;
        include: boolean;
        issues: string[];
      }>('SELECT * FROM staged_rows WHERE id=$1 AND batch_id=$2 AND user_id=$3', [
        idParam(req, 'rowId'),
        batch.id,
        userId,
      ])
    )[0];
    if (!cur) throw new ApiError(404, 'NOT_FOUND', 'Row not found.');

    const currency =
      (p.currency ? (detectCurrency(p.currency) ?? p.currency.toUpperCase()) : cur.currency) ??
      'TRY';
    let bookedOn = cur.booked_on;
    if (p.bookedOn) {
      const d = parseDate(p.bookedOn);
      if (!d) throw new ApiError(400, 'INVALID_DATE', 'That is not a valid date.');
      bookedOn = d.ymd;
    }
    let amount = cur.amount_minor;
    if (p.amount !== undefined) {
      const a = parseAmount(p.amount, currency);
      if (!a || a.minor === 0)
        throw new ApiError(400, 'INVALID_AMOUNT', 'That is not a valid non-zero amount.');
      amount = p.direction
        ? p.direction === 'out'
          ? -Math.abs(a.minor)
          : Math.abs(a.minor)
        : a.minor;
    } else if (p.direction && amount !== null) {
      amount = p.direction === 'out' ? -Math.abs(amount) : Math.abs(amount);
    }
    const description = p.description ?? cur.description;
    const edited = Object.keys(p).some((k) => k !== 'include');
    const complete = bookedOn !== null && amount !== null;
    let status = cur.status;
    const issues: string[] = [];
    let key: string | null = null;
    if (!complete) status = 'invalid';
    else {
      key = computeKey(
        batch.account_id,
        bookedOn!,
        amount!,
        currency,
        description,
        1000 + cur.row_ref,
      );
      const dup = edited
        ? []
        : await query('SELECT 1 FROM transactions WHERE user_id=$1 AND dedupe_key=$2', [
            userId,
            key,
          ]);
      status = dup.length ? 'duplicate' : 'ok';
      if (dup.length) issues.push('Already imported earlier.');
    }
    const include = !complete
      ? false
      : (p.include ??
        ((cur.status === 'duplicate' || cur.status === 'invalid') && status === 'ok'
          ? true
          : cur.include));
    const confirmed = p.confirmed ?? (edited && complete);
    const rows = await query(
      `UPDATE staged_rows SET booked_on=$4, description=$5, amount_minor=$6, currency=$7, category=$8, status=$9, issues=$10, include=$11, confirmed=$12, dedupe_key=COALESCE($13, dedupe_key)
     WHERE id=$1 AND batch_id=$2 AND user_id=$3 RETURNING ${rowCols}`,
      [
        cur.id,
        batch.id,
        userId,
        bookedOn,
        description,
        amount,
        currency,
        p.category ?? cur.category,
        status,
        JSON.stringify(issues),
        include,
        confirmed,
        key,
      ],
    );
    res.json({ row: rows[0], counts: await counts(batch.id) });
  }),
);

importsRouter.post(
  '/:id/confirm-flagged',
  wrap(async (req, res) => {
    const userId = uid(req);
    const batch = await getBatch(idParam(req), userId);
    await query(
      "UPDATE staged_rows SET confirmed=true WHERE batch_id=$1 AND user_id=$2 AND status='flagged'",
      [batch.id, userId],
    );
    res.json({ counts: await counts(batch.id) });
  }),
);

importsRouter.post(
  '/:id/commit',
  wrap(async (req, res) => {
    const userId = uid(req);
    const { confirmFlagged } = parse(
      z.object({ confirmFlagged: z.boolean().default(false) }),
      req.body ?? {},
    );
    const batch = await getBatch(idParam(req), userId);
    if (batch.status !== 'review')
      throw new ApiError(409, 'BATCH_CLOSED', 'This import is not in review.');
    const c = await counts(batch.id);
    if (c.flagged_unconfirmed > 0 && !confirmFlagged) {
      throw new ApiError(
        409,
        'UNRESOLVED_FLAGGED',
        `${c.flagged_unconfirmed} flagged row(s) have not been reviewed. Edit or confirm them, or choose to import them as they are.`,
        { flagged: c.flagged_unconfirmed },
      );
    }
    const result = await tx(async (db) => {
      const staged = await query<{
        booked_on: string;
        description: string;
        amount_minor: number;
        currency: string;
        category: string;
        dedupe_key: string;
        row_ref: number;
        status: string;
      }>(
        "SELECT booked_on, description, amount_minor, currency, category, dedupe_key, row_ref, status FROM staged_rows WHERE batch_id=$1 AND user_id=$2 AND include AND status IN ('ok','flagged','duplicate') AND booked_on IS NOT NULL AND amount_minor IS NOT NULL AND currency IS NOT NULL ORDER BY row_ref",
        [batch.id, userId],
        db,
      );
      let imported = 0;
      let flaggedImported = 0;
      for (const s of staged) {
        const r = await query(
          'INSERT INTO transactions(user_id,account_id,batch_id,booked_on,description,amount_minor,currency,category,source_ref,dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING id',
          [
            userId,
            batch.account_id,
            batch.id,
            s.booked_on,
            s.description,
            s.amount_minor,
            s.currency,
            s.category,
            `${batch.filename}#row${s.row_ref}`,
            s.dedupe_key,
          ],
          db,
        );
        imported += r.length;
        if (s.status === 'flagged') flaggedImported += r.length;
      }
      await query(
        "UPDATE import_batches SET status='committed', committed_at=now() WHERE id=$1",
        [batch.id],
        db,
      );
      return { imported, attempted: staged.length, flaggedImported };
    });
    res.json({
      imported: result.imported,
      skipped_duplicates: Math.max(c.duplicate, result.attempted - result.imported),
      skipped_invalid: c.invalid,
      skipped_excluded: c.total - c.included,
      flagged_imported: result.flaggedImported,
    });
  }),
);

importsRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const batch = await getBatch(idParam(req), uid(req));
    if (batch.status === 'committed')
      throw new ApiError(
        409,
        'BATCH_CLOSED',
        'A committed import cannot be discarded; delete its transactions instead.',
      );
    await query("UPDATE import_batches SET status='discarded', grid='[]' WHERE id=$1", [batch.id]);
    await query('DELETE FROM staged_rows WHERE batch_id=$1', [batch.id]);
    res.status(204).end();
  }),
);
