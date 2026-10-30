import { Router } from 'express';
import { z } from 'zod';
import {
  addMonths,
  detectRecurring,
  estimateMonthlyNet,
  monthOf,
  monthPeriod,
  monthlyTrend,
  primaryCurrency,
  summarize,
  type Tx,
} from '../analytics.js';
import { CATEGORIES } from '../categorize.js';
import { todayYmd } from '../clock.js';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { planGoal } from '../goals.js';
import {
  categoryByMonth,
  planPurchase,
  spendByWeekday,
  topPayees,
  topSpendDays,
  wasteTips,
} from '../insights.js';
import { clearDemo, loadDemo } from '../demo.js';
import { sendMail } from '../mailer.js';
import { formatMinor } from '../money.js';
import { idParam, parse, uid, wrap } from './util.js';

export const dataRouter = Router();

export async function loadTxs(userId: string): Promise<Tx[]> {
  return query<Tx>(
    'SELECT id, booked_on, description, amount_minor, trim(currency) AS currency, category FROM transactions WHERE user_id=$1 ORDER BY booked_on, created_at',
    [userId],
  );
}

const currencyCode = z
  .string()
  .length(3)
  .transform((s) => s.toUpperCase());

// ---- accounts
dataRouter.get(
  '/accounts',
  wrap(async (req, res) => {
    res.json({
      accounts: await query(
        'SELECT id, name, institution, trim(currency) AS currency, source, created_at FROM accounts WHERE user_id=$1 ORDER BY created_at',
        [uid(req)],
      ),
    });
  }),
);
dataRouter.post(
  '/accounts',
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(80),
        institution: z.string().trim().max(80).default(''),
        currency: currencyCode,
      }),
      req.body,
    );
    const rows = await query(
      "INSERT INTO accounts(user_id,name,institution,currency,source) VALUES ($1,$2,$3,$4,'statement') RETURNING id, name, institution, trim(currency) AS currency, source",
      [uid(req), b.name, b.institution, b.currency],
    );
    res.status(201).json({ account: rows[0] });
  }),
);

// ---- transactions
dataRouter.get(
  '/transactions',
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        category: z.enum(CATEGORIES).optional(),
        currency: currencyCode.optional(),
        q: z.string().trim().max(100).optional(),
      }),
      req.query,
    );
    const where = ['t.user_id=$1'];
    const params: unknown[] = [uid(req)];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (q.from) add('t.booked_on >= ?', q.from);
    if (q.to) add('t.booked_on <= ?', q.to);
    if (q.category) add('t.category = ?', q.category);
    if (q.currency) add('t.currency = ?', q.currency);
    if (q.q) add("t.description ILIKE ? ESCAPE '\\'", `%${q.q.replace(/[\\%_]/g, '\\$&')}%`);
    const w = where.join(' AND ');
    const total = (
      await query<{ n: number }>(`SELECT count(*)::int AS n FROM transactions t WHERE ${w}`, params)
    )[0]!.n;
    const rows = await query(
      `SELECT t.id, t.booked_on, t.description, t.amount_minor, trim(t.currency) AS currency, t.category, t.is_demo, t.source_ref, a.name AS account_name
    FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE ${w} ORDER BY t.booked_on DESC, t.created_at DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      params,
    );
    res.json({ transactions: rows, page: q.page, pageSize: q.pageSize, total });
  }),
);

dataRouter.patch(
  '/transactions/:id',
  wrap(async (req, res) => {
    const b = parse(
      z
        .object({
          category: z.enum(CATEGORIES).optional(),
          description: z.string().trim().min(1).max(300).optional(),
        })
        .refine((v) => Object.keys(v).length > 0),
      req.body,
    );
    const rows = await query(
      'UPDATE transactions SET category=COALESCE($3,category), description=COALESCE($4,description) WHERE id=$1 AND user_id=$2 RETURNING id, booked_on, description, amount_minor, trim(currency) AS currency, category',
      [idParam(req), uid(req), b.category ?? null, b.description ?? null],
    );
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found.');
    res.json({ transaction: rows[0] });
  }),
);

dataRouter.delete(
  '/transactions/:id',
  wrap(async (req, res) => {
    const rows = await query('DELETE FROM transactions WHERE id=$1 AND user_id=$2 RETURNING id', [
      idParam(req),
      uid(req),
    ]);
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found.');
    res.status(204).end();
  }),
);

// ---- insights: who got paid most, where money went, which days, waste tips
dataRouter.get(
  '/insights',
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        currency: currencyCode.optional(),
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      }),
      req.query,
    );
    const txs = await loadTxs(uid(req));
    const currency = q.currency ?? primaryCurrency(txs);
    if (!currency) {
      res.json({ empty: true });
      return;
    }
    const months = [
      ...new Set(txs.filter((t) => t.currency === currency).map((t) => monthOf(t.booked_on))),
    ].sort();
    const month = q.month ?? months[months.length - 1]!;
    const period = monthPeriod(month);
    res.json({
      empty: false,
      currency,
      month,
      months_available: months,
      summary: summarize(txs, currency, period),
      payees_month: topPayees(txs, currency, period),
      payees_all: topPayees(txs, currency, null),
      weekday: spendByWeekday(txs, currency, period),
      top_days: topSpendDays(txs, currency, period),
      tips: wasteTips(txs, currency, month),
      category_months: categoryByMonth(txs, currency),
      basis: 'actual',
    });
  }),
);

dataRouter.post(
  '/purchase-plan',
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        price_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        saved_minor: z.number().int().min(0).default(0),
        months: z.number().int().min(1).max(120),
        currency: currencyCode.optional(),
      }),
      req.body,
    );
    const txs = await loadTxs(uid(req));
    const currency = b.currency ?? primaryCurrency(txs) ?? 'TRY';
    res.json({
      currency,
      ...planPurchase(
        {
          price_minor: b.price_minor,
          saved_minor: b.saved_minor,
          months: b.months,
          currency,
          today: todayYmd(),
        },
        txs,
        estimateMonthlyNet(txs, currency),
      ),
    });
  }),
);

// ---- analytics (all numbers computed by deterministic functions in analytics.ts)
dataRouter.get(
  '/analytics',
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        currency: currencyCode.optional(),
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      }),
      req.query,
    );
    const txs = await loadTxs(uid(req));
    const currencies = [...new Set(txs.map((t) => t.currency))].sort();
    const currency = q.currency ?? primaryCurrency(txs);
    if (!currency) {
      res.json({ empty: true, currencies: [] });
      return;
    }
    const inCur = txs.filter((t) => t.currency === currency);
    const months = [...new Set(inCur.map((t) => monthOf(t.booked_on)))].sort();
    const month = q.month ?? months[months.length - 1]!;
    const prev = addMonths(month, -1);
    res.json({
      empty: false,
      currencies,
      currency,
      month,
      months_available: months,
      summary: summarize(txs, currency, monthPeriod(month)),
      previous_summary: summarize(txs, currency, monthPeriod(prev)),
      trend: monthlyTrend(txs, currency),
      recurring: detectRecurring(txs, currency),
      estimate: estimateMonthlyNet(txs, currency),
      note:
        currencies.length > 1
          ? 'You have transactions in several currencies. Totals are shown per currency and never combined.'
          : null,
    });
  }),
);

// ---- emailed monthly report (always to the signed-in user's own address, never to a free-form recipient)
dataRouter.post(
  '/reports/email',
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      }),
      req.body ?? {},
    );
    const user = await query<{ email: string }>('SELECT email FROM users WHERE id=$1', [uid(req)]);
    const txs = await loadTxs(uid(req));
    const currency = primaryCurrency(txs);
    if (!currency || !user[0])
      throw new ApiError(409, 'NO_DATA', 'There are no confirmed transactions to report yet.');
    const months = [
      ...new Set(txs.filter((t) => t.currency === currency).map((t) => monthOf(t.booked_on))),
    ].sort();
    const month = q.month ?? months[months.length - 1]!;
    const sm = summarize(txs, currency, monthPeriod(month));
    const f = (n: number) => `${formatMinor(n, currency)} ${currency}`;
    const lines = [
      `FinUp report for ${month} (${currency}, from your confirmed transactions)`,
      `Income: ${f(sm.income_minor)}`,
      `Expenses: ${f(sm.expenses_minor)}`,
      `Net: ${f(sm.net_minor)}`,
      `Transactions: ${sm.transaction_count}`,
      '',
      'Top spending categories:',
      ...sm.by_category
        .slice(0, 5)
        .map((c) => `- ${c.category}: ${f(c.total_minor)} (${(c.share_bp / 100).toFixed(1)}%)`),
    ];
    const sent = await sendMail({
      to: user[0].email,
      subject: `FinUp report ${month} / تقرير ${month}`,
      text: lines.join('\n'),
    });
    if (!sent) throw new ApiError(503, 'MAIL_FAILED', 'Could not send the email right now.');
    res.json({ sent: true, month, to: user[0].email });
  }),
);

// ---- goals
const goalBody = z.object({
  name: z.string().trim().min(1).max(100),
  target_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  current_minor: z.number().int().min(0).default(0),
  currency: currencyCode,
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function goalsWithPlans(userId: string) {
  const goals = await query<{
    id: string;
    name: string;
    target_minor: number;
    current_minor: number;
    currency: string;
    deadline: string;
  }>(
    'SELECT id, name, target_minor, current_minor, trim(currency) AS currency, deadline FROM goals WHERE user_id=$1 ORDER BY deadline',
    [userId],
  );
  const txs = goals.length ? await loadTxs(userId) : [];
  const today = todayYmd();
  return goals.map((g) => ({
    ...g,
    plan: planGoal({ ...g, today }, estimateMonthlyNet(txs, g.currency)),
  }));
}
export { goalsWithPlans };

dataRouter.get(
  '/goals',
  wrap(async (req, res) => {
    res.json({ goals: await goalsWithPlans(uid(req)), today: todayYmd() });
  }),
);
dataRouter.post(
  '/goals',
  wrap(async (req, res) => {
    const b = parse(goalBody, req.body);
    const rows = await query(
      'INSERT INTO goals(user_id,name,target_minor,current_minor,currency,deadline) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [uid(req), b.name, b.target_minor, b.current_minor, b.currency, b.deadline],
    );
    const g = (await goalsWithPlans(uid(req))).find((x) => x.id === (rows[0] as { id: string }).id);
    res.status(201).json({ goal: g });
  }),
);
dataRouter.patch(
  '/goals/:id',
  wrap(async (req, res) => {
    const b = parse(goalBody.partial(), req.body);
    const rows = await query(
      'UPDATE goals SET name=COALESCE($3,name), target_minor=COALESCE($4,target_minor), current_minor=COALESCE($5,current_minor), currency=COALESCE($6,currency), deadline=COALESCE($7,deadline) WHERE id=$1 AND user_id=$2 RETURNING id',
      [
        idParam(req),
        uid(req),
        b.name ?? null,
        b.target_minor ?? null,
        b.current_minor ?? null,
        b.currency ?? null,
        b.deadline ?? null,
      ],
    );
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Goal not found.');
    res.json({ goal: (await goalsWithPlans(uid(req))).find((x) => x.id === idParam(req)) });
  }),
);
dataRouter.delete(
  '/goals/:id',
  wrap(async (req, res) => {
    const rows = await query('DELETE FROM goals WHERE id=$1 AND user_id=$2 RETURNING id', [
      idParam(req),
      uid(req),
    ]);
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Goal not found.');
    res.status(204).end();
  }),
);

// ---- budgets
dataRouter.get(
  '/budgets',
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      }),
      req.query,
    );
    const budgets = await query<{
      id: string;
      category: string;
      limit_minor: number;
      currency: string;
    }>(
      'SELECT id, category, limit_minor, trim(currency) AS currency FROM budgets WHERE user_id=$1 ORDER BY category',
      [uid(req)],
    );
    const txs = budgets.length ? await loadTxs(uid(req)) : [];
    const month = q.month ?? monthOf(todayYmd());
    const out = budgets.map((b) => {
      const s = summarize(txs, b.currency, monthPeriod(month));
      const spent = s.by_category.find((c) => c.category === b.category)?.total_minor ?? 0;
      return {
        ...b,
        month,
        spent_minor: spent,
        remaining_minor: b.limit_minor - spent,
        over: spent > b.limit_minor,
      };
    });
    res.json({ budgets: out, month });
  }),
);
dataRouter.put(
  '/budgets',
  wrap(async (req, res) => {
    const b = parse(
      z.object({
        category: z.enum(CATEGORIES),
        limit_minor: z.number().int().positive(),
        currency: currencyCode,
      }),
      req.body,
    );
    const rows = await query(
      'INSERT INTO budgets(user_id,category,limit_minor,currency) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,category,currency) DO UPDATE SET limit_minor=EXCLUDED.limit_minor RETURNING id, category, limit_minor, trim(currency) AS currency',
      [uid(req), b.category, b.limit_minor, b.currency],
    );
    res.json({ budget: rows[0] });
  }),
);
dataRouter.delete(
  '/budgets/:id',
  wrap(async (req, res) => {
    const rows = await query('DELETE FROM budgets WHERE id=$1 AND user_id=$2 RETURNING id', [
      idParam(req),
      uid(req),
    ]);
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Budget not found.');
    res.status(204).end();
  }),
);

// ---- demo data
dataRouter.post(
  '/demo',
  wrap(async (req, res) => {
    res.status(201).json({ loaded: await loadDemo(uid(req)) });
  }),
);
dataRouter.delete(
  '/demo',
  wrap(async (req, res) => {
    await clearDemo(uid(req));
    res.status(204).end();
  }),
);
