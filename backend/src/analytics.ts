import { normalizeDescription } from './categorize.js';

export interface Tx {
  id?: string;
  booked_on: string; // YYYY-MM-DD
  description: string;
  amount_minor: number; // signed
  currency: string;
  category: string;
}

export interface Period {
  from: string;
  to: string;
} // inclusive YYYY-MM-DD

export const monthOf = (ymd: string): string => ymd.slice(0, 7);

export function inPeriod(tx: Tx, p: Period): boolean {
  return tx.booked_on >= p.from && tx.booked_on <= p.to;
}

export function monthPeriod(month: string): Period {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export interface CategoryTotal {
  category: string;
  total_minor: number;
  share_bp: number;
  count: number;
}
export interface Summary {
  currency: string;
  period: Period;
  income_minor: number;
  expenses_minor: number; // positive magnitude
  net_minor: number;
  transaction_count: number;
  savings_rate_bp: number | null; // basis points of income retained; null when no income
  by_category: CategoryTotal[]; // expenses only, descending
  basis: 'actual';
}

/** Single-currency summary. Transactions of other currencies are ignored, never converted. */
export function summarize(all: Tx[], currency: string, period: Period): Summary {
  const txs = all.filter((t) => t.currency === currency && inPeriod(t, period));
  let income = 0;
  let expenses = 0;
  const cats = new Map<string, { total: number; count: number }>();
  for (const t of txs) {
    if (t.amount_minor > 0) income += t.amount_minor;
    else {
      expenses += -t.amount_minor;
      const c = cats.get(t.category) ?? { total: 0, count: 0 };
      c.total += -t.amount_minor;
      c.count += 1;
      cats.set(t.category, c);
    }
  }
  const by_category = [...cats.entries()]
    .map(([category, v]) => ({
      category,
      total_minor: v.total,
      count: v.count,
      share_bp: expenses > 0 ? Math.round((v.total * 10000) / expenses) : 0,
    }))
    .sort((a, b) => b.total_minor - a.total_minor || a.category.localeCompare(b.category));
  return {
    currency,
    period,
    income_minor: income,
    expenses_minor: expenses,
    net_minor: income - expenses,
    transaction_count: txs.length,
    savings_rate_bp: income > 0 ? Math.round(((income - expenses) * 10000) / income) : null,
    by_category,
    basis: 'actual',
  };
}

export interface MonthPoint {
  month: string;
  income_minor: number;
  expenses_minor: number;
  net_minor: number;
}

export function monthlyTrend(all: Tx[], currency: string): MonthPoint[] {
  const map = new Map<string, MonthPoint>();
  for (const t of all) {
    if (t.currency !== currency) continue;
    const month = monthOf(t.booked_on);
    const p = map.get(month) ?? { month, income_minor: 0, expenses_minor: 0, net_minor: 0 };
    if (t.amount_minor > 0) p.income_minor += t.amount_minor;
    else p.expenses_minor += -t.amount_minor;
    p.net_minor = p.income_minor - p.expenses_minor;
    map.set(month, p);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Currency with the most transactions; stable tie-break alphabetical. */
export function primaryCurrency(all: Tx[]): string | null {
  const counts = new Map<string, number>();
  for (const t of all) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted[0]?.[0] ?? null;
}

export interface MonthlyEstimate {
  net_minor: number;
  months_used: string[];
  /** True when only one month of data exists, so the (possibly partial) latest month had to be used. */
  includes_latest_month: boolean;
  basis: 'estimated';
}

/**
 * Average net cash flow over up to `maxMonths` most recent *complete* months of data.
 * A month is complete when it is earlier than the latest month that has transactions.
 * Falls back to the latest month if it is the only one, flagged by months_used length.
 */
export function estimateMonthlyNet(
  all: Tx[],
  currency: string,
  maxMonths = 3,
): MonthlyEstimate | null {
  const trend = monthlyTrend(all, currency);
  if (trend.length === 0) return null;
  const complete = trend.length > 1 ? trend.slice(0, -1) : trend;
  const used = complete.slice(-maxMonths);
  const sum = used.reduce((a, p) => a + p.net_minor, 0);
  return {
    net_minor: Math.trunc(sum / used.length),
    months_used: used.map((p) => p.month),
    includes_latest_month: trend.length === 1,
    basis: 'estimated',
  };
}

export interface RecurringItem {
  label: string;
  typical_minor: number; // magnitude
  months: number;
  currency: string;
  last_seen: string;
}

/** Same normalized description, amounts within 5% of each other, in at least 3 distinct months. */
export function detectRecurring(all: Tx[], currency: string): RecurringItem[] {
  const groups = new Map<string, Tx[]>();
  for (const t of all) {
    if (t.currency !== currency || t.amount_minor >= 0) continue;
    const key = normalizeDescription(t.description);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  const out: RecurringItem[] = [];
  for (const txs of groups.values()) {
    const months = new Set(txs.map((t) => monthOf(t.booked_on)));
    if (months.size < 3) continue;
    const amounts = txs.map((t) => -t.amount_minor).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)]!;
    if (!amounts.every((a) => Math.abs(a - median) * 20 <= median)) continue;
    const last = txs.reduce((a, t) => (t.booked_on > a ? t.booked_on : a), '');
    out.push({
      label: txs[0]!.description,
      typical_minor: median,
      months: months.size,
      currency,
      last_seen: last,
    });
  }
  return out.sort((a, b) => b.typical_minor - a.typical_minor);
}
