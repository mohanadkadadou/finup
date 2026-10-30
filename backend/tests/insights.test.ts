import { describe, expect, it } from 'vitest';
import type { Tx } from '../src/analytics.js';
import {
  categoryByMonth,
  planPurchase,
  spendByWeekday,
  spendingFacts,
  topPayees,
  topSpendDays,
  wasteTips,
} from '../src/insights.js';
import { estimateMonthlyNet } from '../src/analytics.js';

const tx = (booked_on: string, description: string, tl: number, category = 'Shopping'): Tx => ({
  booked_on,
  description,
  amount_minor: Math.round(tl * 100),
  currency: 'TRY',
  category,
});

const data: Tx[] = [
  tx('2026-09-01', 'Salary', 10000, 'Salary'),
  tx('2026-09-02', 'Rent', -4000, 'Housing'),
  tx('2026-09-05', 'Cafe Nero', -50, 'Dining'),
  tx('2026-10-01', 'Salary', 10000, 'Salary'),
  tx('2026-10-02', 'Rent', -4000, 'Housing'),
  tx('2026-10-03', 'Cafe Nero', -80, 'Dining'),
  tx('2026-10-10', 'CAFE NERO', -40, 'Dining'),
  tx('2026-10-10', 'Zara', -1500, 'Shopping'),
  { ...tx('2026-10-11', 'Zara', -9), currency: 'USD' },
];

describe('topPayees', () => {
  it('groups by normalized description, ranks by total and ignores other currencies', () => {
    const p = topPayees(data, 'TRY', { from: '2026-10-01', to: '2026-10-31' });
    expect(p.map((x) => x.label)).toEqual(['Rent', 'Zara', 'Cafe Nero']);
    const cafe = p[2]!;
    expect(cafe.total_minor).toBe(12000);
    expect(cafe.count).toBe(2);
    expect(cafe.avg_minor).toBe(6000);
    expect(p[0]!.share_bp + p[1]!.share_bp + cafe.share_bp).toBeGreaterThanOrEqual(9999);
  });
  it('all-time covers every month', () => {
    expect(topPayees(data, 'TRY', null).find((x) => x.label === 'Rent')!.total_minor).toBe(800000);
  });
});

describe('weekday and days', () => {
  it('2026-10-10 is a Saturday and holds the biggest day', () => {
    const days = topSpendDays(data, 'TRY', { from: '2026-10-01', to: '2026-10-31' });
    expect(days[0]).toMatchObject({ date: '2026-10-02', total_minor: 400000, weekday: 5 });
    const wd = spendByWeekday(data, 'TRY', { from: '2026-10-01', to: '2026-10-31' });
    expect(wd[6]!.total_minor).toBe(162000);
    expect(wd.reduce((a, s) => a + s.total_minor, 0)).toBe(400000 + 8000 + 4000 + 150000);
  });
  it('is all zero without expenses', () => {
    expect(spendByWeekday([], 'TRY', null).every((s) => s.total_minor === 0)).toBe(true);
  });
});

describe('wasteTips', () => {
  it('flags a heavy discretionary category with an explicit illustrative cut', () => {
    const tips = wasteTips(data, 'TRY', '2026-10');
    const heavy = tips.find((t) => t.kind === 'category_heavy');
    expect(heavy?.params.category).toBe('Shopping');
    expect(heavy?.saving_minor).toBe(30000);
  });
  it('flags overspending when expenses exceed income', () => {
    const tips = wasteTips(
      [tx('2026-10-01', 'Pay', 1000, 'Salary'), tx('2026-10-02', 'Big', -1500)],
      'TRY',
      '2026-10',
    );
    expect(tips[0]).toMatchObject({ kind: 'overspend', saving_minor: 50000 });
  });
  it('returns nothing without expenses', () => {
    expect(wasteTips([], 'TRY', '2026-10')).toEqual([]);
  });
});

describe('planPurchase', () => {
  const est = estimateMonthlyNet(data, 'TRY');
  it('uses goal maths and reports the shortfall and the effect of cuts', () => {
    const p = planPurchase(
      { price_minor: 3_000_000, saved_minor: 0, months: 6, currency: 'TRY', today: '2026-10-30' },
      data,
      est,
    );
    expect(p.plan.monthly_required_minor).toBe(500000);
    expect(p.months_at_current_net).not.toBeNull();
    expect(p.cuts.every((c) => c.cut_minor > 0)).toBe(true);
    expect(p.basis).toBe('estimated');
  });
  it('is trivially done when already saved', () => {
    const p = planPurchase(
      { price_minor: 1000, saved_minor: 1000, months: 3, currency: 'TRY', today: '2026-10-30' },
      data,
      est,
    );
    expect(p.months_at_current_net).toBe(0);
    expect(p.plan.state).toBe('achieved');
  });
  it('handles no data', () => {
    const p = planPurchase(
      { price_minor: 1000, saved_minor: 0, months: 2, currency: 'TRY', today: '2026-10-30' },
      [],
      null,
    );
    expect(p.shortfall_minor).toBeNull();
    expect(p.months_at_current_net).toBeNull();
  });
});

describe('categoryByMonth', () => {
  it('finds the top category of each month and the one that led most often', () => {
    const r = categoryByMonth(data, 'TRY');
    expect(r.months.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(r.months.map((m) => m.top!.category)).toEqual(['Housing', 'Housing']);
    expect(r.months[1]!.categories.map((c) => c.category)).toEqual([
      'Housing',
      'Shopping',
      'Dining',
    ]);
    expect(r.leader).toEqual({ category: 'Housing', months_led: 2, total_minor: 800000 });
    expect(r.overall[0]!.share_bp).toBeGreaterThan(5000);
  });
  it('keeps only the latest months and ignores income and other currencies', () => {
    const r = categoryByMonth(data, 'TRY', 1);
    expect(r.months).toHaveLength(1);
    expect(r.months[0]!.total_minor).toBe(400000 + 12000 + 150000);
  });
  it('is empty without expenses', () => {
    expect(categoryByMonth([], 'TRY')).toEqual({ months: [], leader: null, overall: [] });
  });
});

describe('spendingFacts', () => {
  const facts = spendingFacts(data, 'TRY', '2026-10');
  const get = (k: string) => facts.find((f) => f.kind === k)?.params;

  it('finds the biggest purchase and the most frequent payee from real rows', () => {
    expect(get('biggest_purchase')).toMatchObject({ label: 'Rent', amount_minor: 400000 });
    expect(get('most_frequent')).toMatchObject({
      label: 'Cafe Nero',
      count: 2,
      total_minor: 12000,
    });
  });
  it('averages per calendar day up to the last spending day and counts quiet days', () => {
    // Expenses 4000 + 80 + 40 + 1500 = 5620 TL over Oct 1..10 (10 days), spending on 3 distinct days.
    expect(get('avg_daily')).toEqual({ amount_minor: 56200, days: 10 });
    expect(get('no_spend_days')).toEqual({ count: 7, days: 10 });
  });
  it('shares add up from counted amounts and exclude other currencies', () => {
    expect(get('avg_purchase')).toEqual({ amount_minor: Math.round(562000 / 4), count: 4 });
    expect(get('distinct_payees')).toEqual({ count: 3, tx_count: 4 });
  });
  it('compares a category with last month only when both months have it', () => {
    expect(get('biggest_rise')).toMatchObject({ category: 'Dining', delta_minor: 7000 });
  });
  it('is empty for a month without expenses', () => {
    expect(spendingFacts(data, 'TRY', '2025-01')).toEqual([]);
  });
});
