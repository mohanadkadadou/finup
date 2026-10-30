import {
  addMonths,
  detectRecurring,
  inPeriod,
  monthOf,
  monthPeriod,
  summarize,
  type MonthlyEstimate,
  type Period,
  type Tx,
} from './analytics.js';
import { normalizeDescription } from './categorize.js';
import { planGoal, type GoalPlan } from './goals.js';

/** Categories a person can realistically trim. Housing, utilities, fees and transfers are excluded. */
export const DISCRETIONARY = ['Dining', 'Shopping', 'Entertainment', 'Travel', 'Subscriptions'];

const expenseTxs = (all: Tx[], currency: string, period: Period | null): Tx[] =>
  all.filter(
    (t) => t.currency === currency && t.amount_minor < 0 && (period ? inPeriod(t, period) : true),
  );

export interface PayeeTotal {
  label: string;
  category: string;
  total_minor: number;
  count: number;
  avg_minor: number;
  share_bp: number;
  last_seen: string;
}

/** Who received the most money. Payees are grouped by normalized description; amounts stay integer. */
export function topPayees(
  all: Tx[],
  currency: string,
  period: Period | null,
  limit = 8,
): PayeeTotal[] {
  const txs = expenseTxs(all, currency, period);
  const total = txs.reduce((a, t) => a + -t.amount_minor, 0);
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    const key = normalizeDescription(t.description) || t.description;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  const out: PayeeTotal[] = [];
  for (const g of groups.values()) {
    const sum = g.reduce((a, t) => a + -t.amount_minor, 0);
    const labels = new Map<string, number>();
    const cats = new Map<string, number>();
    for (const t of g) {
      labels.set(t.description, (labels.get(t.description) ?? 0) + 1);
      cats.set(t.category, (cats.get(t.category) ?? 0) + 1);
    }
    const top = <K>(m: Map<K, number>): K => [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    out.push({
      label: top(labels),
      category: top(cats),
      total_minor: sum,
      count: g.length,
      avg_minor: Math.round(sum / g.length),
      share_bp: total > 0 ? Math.round((sum * 10000) / total) : 0,
      last_seen: g.reduce((a, t) => (t.booked_on > a ? t.booked_on : a), ''),
    });
  }
  return out
    .sort((a, b) => b.total_minor - a.total_minor || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export interface WeekdayStat {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  total_minor: number;
  count: number;
  /** Average spend per calendar occurrence of this weekday in the observed span. */
  avg_per_day_minor: number;
}

const dow = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const nextDay = (ymd: string): string =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Spend per weekday. Averages divide by how many of that weekday fall inside the observed span. */
export function spendByWeekday(all: Tx[], currency: string, period: Period | null): WeekdayStat[] {
  const txs = expenseTxs(all, currency, period);
  const stats: WeekdayStat[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    total_minor: 0,
    count: 0,
    avg_per_day_minor: 0,
  }));
  if (txs.length === 0) return stats;
  const dates = txs.map((t) => t.booked_on).sort();
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const occ = new Array<number>(7).fill(0);
  for (let d = first; d <= last; d = nextDay(d)) occ[dow(d)]! += 1;
  for (const t of txs) {
    const s = stats[dow(t.booked_on)]!;
    s.total_minor += -t.amount_minor;
    s.count += 1;
  }
  for (const s of stats)
    s.avg_per_day_minor = Math.round(s.total_minor / Math.max(1, occ[s.weekday]!));
  return stats;
}

export interface DayTotal {
  date: string;
  weekday: number;
  total_minor: number;
  count: number;
}

export function topSpendDays(
  all: Tx[],
  currency: string,
  period: Period | null,
  limit = 5,
): DayTotal[] {
  const map = new Map<string, DayTotal>();
  for (const t of expenseTxs(all, currency, period)) {
    const d = map.get(t.booked_on) ?? {
      date: t.booked_on,
      weekday: dow(t.booked_on),
      total_minor: 0,
      count: 0,
    };
    d.total_minor += -t.amount_minor;
    d.count += 1;
    map.set(t.booked_on, d);
  }
  return [...map.values()]
    .sort((a, b) => b.total_minor - a.total_minor || b.date.localeCompare(a.date))
    .slice(0, limit);
}

export interface Tip {
  id: string;
  kind:
    | 'overspend'
    | 'low_savings'
    | 'category_heavy'
    | 'category_growth'
    | 'frequent_small'
    | 'weekend_spike'
    | 'subscriptions'
    | 'recurring'
    | 'fees';
  /** Illustrative monthly amount you could keep, or null when the tip is not about a number. */
  saving_minor: number | null;
  params: Record<string, string | number>;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/**
 * Deterministic, explainable waste-reduction tips for one month. Every number comes from the user's own
 * transactions; "saving" figures are simple illustrative cuts (stated in params), never forecasts.
 */
export function wasteTips(all: Tx[], currency: string, month: string): Tip[] {
  const period = monthPeriod(month);
  const s = summarize(all, currency, period);
  const prev = summarize(all, currency, monthPeriod(addMonths(month, -1)));
  const tips: Tip[] = [];
  if (s.expenses_minor === 0) return tips;

  if (s.income_minor > 0 && s.expenses_minor > s.income_minor)
    tips.push({
      id: 'overspend',
      kind: 'overspend',
      saving_minor: s.expenses_minor - s.income_minor,
      params: { gap_minor: s.expenses_minor - s.income_minor },
    });
  else if (s.income_minor > 0 && s.savings_rate_bp !== null && s.savings_rate_bp < 1000)
    tips.push({
      id: 'low_savings',
      kind: 'low_savings',
      saving_minor: Math.max(0, Math.floor(s.income_minor / 5) - s.net_minor),
      params: {
        rate_pct: Math.round(s.savings_rate_bp / 100),
        target_minor: Math.floor(s.income_minor / 5),
      },
    });

  for (const c of s.by_category) {
    if (DISCRETIONARY.includes(c.category) && c.category !== 'Subscriptions' && c.share_bp >= 1500)
      tips.push({
        id: `heavy-${c.category}`,
        kind: 'category_heavy',
        saving_minor: Math.floor(c.total_minor / 5),
        params: {
          category: c.category,
          share_pct: Math.round(c.share_bp / 100),
          total_minor: c.total_minor,
          cut_pct: 20,
        },
      });
    const before = prev.by_category.find((p) => p.category === c.category)?.total_minor ?? 0;
    const delta = c.total_minor - before;
    if (before > 0 && delta * 10 >= before * 3 && delta * 20 >= s.expenses_minor)
      tips.push({
        id: `growth-${c.category}`,
        kind: 'category_growth',
        saving_minor: delta,
        params: {
          category: c.category,
          change_pct: Math.round((delta * 100) / before),
          delta_minor: delta,
        },
      });
  }

  const monthExpenses = expenseTxs(all, currency, period);
  const med = median(monthExpenses.map((t) => -t.amount_minor));
  const small = monthExpenses.filter(
    (t) => DISCRETIONARY.includes(t.category) && -t.amount_minor * 5 <= med && -t.amount_minor > 0,
  );
  if (small.length >= 10) {
    const total = small.reduce((a, t) => a + -t.amount_minor, 0);
    tips.push({
      id: 'small',
      kind: 'frequent_small',
      saving_minor: Math.floor(total / 4),
      params: { count: small.length, total_minor: total, cut_pct: 25 },
    });
  }

  const wd = spendByWeekday(all, currency, period);
  const weekend = [0, 6].map((i) => wd[i]!.avg_per_day_minor);
  const weekdays = [1, 2, 3, 4, 5].map((i) => wd[i]!.avg_per_day_minor);
  const avgWeekend = weekend.reduce((a, b) => a + b, 0) / 2;
  const avgWeek = weekdays.reduce((a, b) => a + b, 0) / 5;
  if (avgWeek > 0 && avgWeekend * 2 >= avgWeek * 3 && s.transaction_count >= 12)
    tips.push({
      id: 'weekend',
      kind: 'weekend_spike',
      saving_minor: null,
      params: { ratio_x10: Math.round((avgWeekend * 10) / avgWeek) },
    });

  const subs = s.by_category.find((c) => c.category === 'Subscriptions');
  if (subs)
    tips.push({
      id: 'subs',
      kind: 'subscriptions',
      saving_minor: null,
      params: {
        total_minor: subs.total_minor,
        count: subs.count,
        yearly_minor: subs.total_minor * 12,
      },
    });

  const rec = detectRecurring(all, currency);
  if (rec.length > 0)
    tips.push({
      id: 'recurring',
      kind: 'recurring',
      saving_minor: null,
      params: {
        count: rec.length,
        monthly_minor: rec.reduce((a, r) => a + r.typical_minor, 0),
        top_label: rec[0]!.label,
      },
    });

  const fees = s.by_category.find((c) => c.category === 'Fees');
  if (fees)
    tips.push({
      id: 'fees',
      kind: 'fees',
      saving_minor: fees.total_minor,
      params: { total_minor: fees.total_minor },
    });

  return tips.sort((a, b) => (b.saving_minor ?? -1) - (a.saving_minor ?? -1));
}

export interface PurchaseInput {
  price_minor: number;
  saved_minor: number;
  months: number;
  currency: string;
  today: string;
}
export interface Cut {
  category: string;
  monthly_minor: number;
  cut_minor: number;
}
export interface PurchasePlan {
  remaining_minor: number;
  months: number;
  deadline: string;
  plan: GoalPlan;
  /** Months needed at the estimated monthly net, or null when net is not positive / unknown. */
  months_at_current_net: number | null;
  /** How much per month is missing versus the estimate; 0 when affordable, null with no data. */
  shortfall_minor: number | null;
  cuts: Cut[];
  cuts_total_minor: number;
  months_with_cuts: number | null;
  cuts_close_gap: boolean | null;
  cut_pct: number;
  basis: string;
}

/** Plans a purchase with the same deterministic goal maths, plus what trimming discretionary spend would add. */
export function planPurchase(
  input: PurchaseInput,
  all: Tx[],
  estimate: MonthlyEstimate | null,
): PurchasePlan {
  const deadline = monthPeriod(addMonths(monthOf(input.today), input.months)).to;
  const plan = planGoal(
    {
      target_minor: input.price_minor,
      current_minor: input.saved_minor,
      currency: input.currency,
      deadline,
      today: input.today,
    },
    estimate,
  );
  const remaining = plan.remaining_minor;
  const est = estimate?.net_minor ?? null;

  const refMonth = estimate?.months_used[estimate.months_used.length - 1];
  const cut_pct = 20;
  const cuts: Cut[] = [];
  if (refMonth) {
    const s = summarize(all, input.currency, monthPeriod(refMonth));
    for (const c of s.by_category)
      if (DISCRETIONARY.includes(c.category) && Math.floor(c.total_minor / 5) > 0)
        cuts.push({
          category: c.category,
          monthly_minor: c.total_minor,
          cut_minor: Math.floor((c.total_minor * cut_pct) / 100),
        });
  }
  const cutsTotal = cuts.reduce((a, c) => a + c.cut_minor, 0);
  const withCuts = (est ?? 0) + cutsTotal;
  return {
    remaining_minor: remaining,
    months: input.months,
    deadline,
    plan,
    months_at_current_net:
      remaining === 0 ? 0 : est !== null && est > 0 ? Math.ceil(remaining / est) : null,
    shortfall_minor:
      est === null ? null : Math.max(0, plan.monthly_required_minor - Math.max(0, est)),
    cuts,
    cuts_total_minor: cutsTotal,
    months_with_cuts: remaining === 0 ? 0 : withCuts > 0 ? Math.ceil(remaining / withCuts) : null,
    cuts_close_gap: est === null ? null : withCuts >= plan.monthly_required_minor,
    cut_pct,
    basis: 'estimated',
  };
}
