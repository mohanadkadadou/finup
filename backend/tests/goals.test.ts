import { describe, expect, it } from 'vitest';
import { planGoal } from '../src/goals.js';
import {
  detectRecurring,
  estimateMonthlyNet,
  summarize,
  monthlyTrend,
  type Tx,
} from '../src/analytics.js';

const base = { currency: 'TRY', today: '2026-10-30' };
const est = (net: number) => ({
  net_minor: net,
  months_used: ['2026-08', '2026-09'],
  includes_latest_month: false,
  basis: 'estimated' as const,
});

describe('planGoal', () => {
  it('splits the remainder over whole months and rounds UP', () => {
    // 60,000 TRY target, 10,000 saved, deadline 12 months out -> 50,000 / 12 = 4,166.666 -> 4,166.67
    const p = planGoal(
      { ...base, target_minor: 6000000, current_minor: 1000000, deadline: '2027-10-30' },
      null,
    );
    expect(p.remaining_minor).toBe(5000000);
    expect(p.periods).toBe(12);
    expect(p.monthly_required_minor).toBe(416667);
    expect(p.state).toBe('on_schedule');
    expect(p.affordability).toBe('no_data');
  });
  it('treats an already funded goal as achieved with zero contribution', () => {
    const p = planGoal(
      { ...base, target_minor: 100000, current_minor: 150000, deadline: '2027-01-01' },
      est(1),
    );
    expect(p.monthly_required_minor).toBe(0);
    expect(p.state).toBe('achieved');
    expect(p.affordability).toBe('comfortable');
  });
  it('uses one period when the deadline is within the current month', () => {
    const p = planGoal(
      { ...base, target_minor: 100000, current_minor: 0, deadline: '2026-10-31' },
      null,
    );
    expect(p.periods).toBe(1);
    expect(p.monthly_required_minor).toBe(100000);
  });
  it('marks expired goals and shows the full remainder as due now', () => {
    const p = planGoal(
      { ...base, target_minor: 100000, current_minor: 40000, deadline: '2026-09-01' },
      null,
    );
    expect(p.state).toBe('expired');
    expect(p.periods).toBe(1);
    expect(p.monthly_required_minor).toBe(60000);
    expect(p.assumptions.join(' ')).toMatch(/deadline has passed/);
  });
  it('grades affordability against estimated net cash flow', () => {
    const g = { ...base, target_minor: 120000, current_minor: 0, deadline: '2027-10-30' }; // 10,000/mo
    expect(planGoal(g, est(1000000)).affordability).toBe('comfortable'); // 100%? 10000 vs 1,000,000 minor
    expect(planGoal(g, est(11000)).affordability).toBe('tight'); // 10000 > 80% of 11000
    expect(planGoal(g, est(9000)).affordability).toBe('exceeds_cash_flow');
    expect(planGoal(g, est(-5)).affordability).toBe('exceeds_cash_flow');
  });
});

const tx = (
  booked_on: string,
  amount_minor: number,
  category = 'Groceries',
  description = 'X',
  currency = 'TRY',
): Tx => ({ booked_on, amount_minor, category, description, currency });

describe('analytics', () => {
  const txs = [
    tx('2026-08-01', 500000, 'Salary', 'Salary'),
    tx('2026-08-10', -100000),
    tx('2026-08-20', -50000, 'Dining'),
    tx('2026-09-01', 500000, 'Salary', 'Salary'),
    tx('2026-09-10', -200000),
    tx('2026-10-01', 500000, 'Salary', 'Salary'),
    tx('2026-09-15', -99999, 'Shopping', 'US store', 'USD'),
  ];
  it('summarizes one currency and never mixes others', () => {
    const s = summarize(txs, 'TRY', { from: '2026-08-01', to: '2026-08-31' });
    expect(s.income_minor).toBe(500000);
    expect(s.expenses_minor).toBe(150000);
    expect(s.net_minor).toBe(350000);
    expect(s.by_category[0]).toMatchObject({
      category: 'Groceries',
      total_minor: 100000,
      share_bp: 6667,
    });
    expect(s.savings_rate_bp).toBe(7000);
    expect(summarize(txs, 'USD', { from: '2026-09-01', to: '2026-09-30' }).expenses_minor).toBe(
      99999,
    );
  });
  it('includes period boundaries inclusively', () => {
    const s = summarize(
      [tx('2026-08-01', -100), tx('2026-08-31', -200), tx('2026-09-01', -400)],
      'TRY',
      { from: '2026-08-01', to: '2026-08-31' },
    );
    expect(s.expenses_minor).toBe(300);
  });
  it('estimates net from complete months only (excludes the latest, partial month)', () => {
    const e = estimateMonthlyNet(txs, 'TRY')!;
    expect(e.months_used).toEqual(['2026-08', '2026-09']);
    expect(e.net_minor).toBe(Math.trunc((350000 + 300000) / 2));
    expect(monthlyTrend(txs, 'TRY')).toHaveLength(3);
    expect(estimateMonthlyNet([], 'TRY')).toBeNull();
  });
  it('detects recurring charges across >=3 months with similar amounts', () => {
    const t = [
      tx('2026-06-08', -22999, 'Subscriptions', 'Netflix 1234'),
      tx('2026-07-08', -22999, 'Subscriptions', 'Netflix 5678'),
      tx('2026-08-08', -23100, 'Subscriptions', 'Netflix 9012'),
      tx('2026-06-09', -1000, 'Dining', 'Cafe'),
      tx('2026-07-09', -9000, 'Dining', 'Cafe'),
      tx('2026-08-09', -500, 'Dining', 'Cafe'),
    ];
    const r = detectRecurring(t, 'TRY');
    expect(r).toHaveLength(1);
    expect(r[0]!.label).toMatch(/Netflix/);
  });
});
