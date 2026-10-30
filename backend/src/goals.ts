import { addMonths, monthOf, type MonthlyEstimate } from './analytics.js';

export interface GoalInput {
  target_minor: number;
  current_minor: number;
  currency: string;
  deadline: string; // YYYY-MM-DD
  today: string; // YYYY-MM-DD
}

export type GoalState = 'achieved' | 'on_schedule' | 'expired';
export type Affordability = 'no_data' | 'comfortable' | 'tight' | 'exceeds_cash_flow';

export interface GoalPlan {
  remaining_minor: number;
  /** Number of month-end contributions from the current month through the deadline month, minimum 1. */
  periods: number;
  monthly_required_minor: number;
  state: GoalState;
  affordability: Affordability;
  estimated_monthly_net_minor: number | null;
  assumptions: string[];
}

/** Whole calendar months from today's month to the deadline's month (0 when same month). */
export function monthsBetween(today: string, deadline: string): number {
  const [ty, tm] = monthOf(today).split('-').map(Number) as [number, number];
  const [dy, dm] = monthOf(deadline).split('-').map(Number) as [number, number];
  return dy * 12 + dm - (ty * 12 + tm);
}

/**
 * monthly = ceil(max(0, target - current) / periods), where periods = max(1, whole months to deadline).
 * - Already funded -> state 'achieved', monthly 0.
 * - Deadline in the past (and not funded) -> state 'expired', whole remainder is due now (periods = 1).
 * Rounding is always up to the next minor unit so the goal is never under-funded by rounding.
 */
export function planGoal(goal: GoalInput, estimate: MonthlyEstimate | null): GoalPlan {
  const remaining = Math.max(0, goal.target_minor - goal.current_minor);
  const months = monthsBetween(goal.today, goal.deadline);
  const expired = goal.deadline < goal.today;
  const periods = Math.max(1, months);
  const monthly = remaining === 0 ? 0 : Math.ceil(remaining / periods);
  const state: GoalState = remaining === 0 ? 'achieved' : expired ? 'expired' : 'on_schedule';

  const assumptions = [
    `Remaining = target − current savings, in ${goal.currency}.`,
    `Contributions are equal, one per calendar month through the deadline month (${periods} period${periods === 1 ? '' : 's'}), rounded up to the next minor unit.`,
    'No interest, inflation, price changes or exchange-rate movement is modelled.',
  ];
  if (expired && remaining > 0)
    assumptions.push('The deadline has passed, so the full remainder is shown as due now.');

  let affordability: Affordability = 'no_data';
  let est: number | null = null;
  if (estimate) {
    est = estimate.net_minor;
    assumptions.push(
      `Estimated monthly net cash flow is the average of ${estimate.months_used.length} past month(s) (${estimate.months_used.join(', ')}) of your confirmed ${goal.currency} transactions. This is an estimate, not a guarantee.`,
    );
    if (estimate.includes_latest_month)
      assumptions.push(
        'Only one month of data exists and it may be incomplete, so this estimate is especially rough.',
      );
    if (monthly === 0) affordability = 'comfortable';
    else if (est <= 0 || monthly > est) affordability = 'exceeds_cash_flow';
    else if (monthly * 5 > est * 4)
      affordability = 'tight'; // > 80% of estimated net
    else affordability = 'comfortable';
  } else {
    assumptions.push(
      `No confirmed ${goal.currency} transactions yet, so affordability cannot be estimated.`,
    );
  }

  return {
    remaining_minor: remaining,
    periods,
    monthly_required_minor: monthly,
    state,
    affordability,
    estimated_monthly_net_minor: est,
    assumptions,
  };
}

export { addMonths };
