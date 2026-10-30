import { addMonths, monthOf } from './analytics.js';
import { categorize } from './categorize.js';
import { computeKey } from './import/normalize.js';
import { query, tx } from './db.js';
import { todayYmd } from './clock.js';

export interface DemoTx {
  booked_on: string;
  description: string;
  amount_minor: number;
}

/** Deterministic pseudo-random so demo data is reproducible. */
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

const day = (month: string, d: number) => `${month}-${String(Math.min(d, 28)).padStart(2, '0')}`;

/** Six months of clearly fictional TRY activity ending in the current month (never future-dated). */
export function buildDemoTransactions(today: string): DemoTx[] {
  const rnd = lcg(42);
  const out: DemoTx[] = [];
  const cur = monthOf(today);
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(cur, -i);
    const push = (d: number, description: string, tl: number) => {
      const date = day(m, d);
      if (date <= today)
        out.push({ booked_on: date, description, amount_minor: Math.round(tl * 100) });
    };
    push(1, 'DEMO Employer Ltd Salary', 52000);
    push(3, 'DEMO Rent Payment', -16500);
    push(5, 'DEMO Enerjisa Electricity', -(480 + Math.floor(rnd() * 220)));
    push(6, 'DEMO Turkcell Internet', -349.9);
    push(8, 'DEMO Netflix Subscription', -229.99);
    push(9, 'DEMO Spotify Subscription', -59.99);
    for (const d of [4, 11, 17, 24])
      push(d, 'DEMO Migros Market', -(650 + Math.floor(rnd() * 900)));
    for (const d of [7, 13, 20, 26])
      push(d, 'DEMO Cafe Restaurant', -(180 + Math.floor(rnd() * 420)));
    for (const d of [10, 21])
      push(d, 'DEMO Istanbulkart Transport', -(300 + Math.floor(rnd() * 200)));
    push(15, 'DEMO Trendyol Shopping', -(700 + Math.floor(rnd() * 1800)));
    if (i % 2 === 0) push(18, 'DEMO Eczane Pharmacy', -(150 + Math.floor(rnd() * 250)));
    push(27, 'DEMO Freelance Design Income', 4500 + Math.floor(rnd() * 3000));
  }
  return out;
}

export async function loadDemo(userId: string): Promise<number> {
  const existing = await query("SELECT 1 FROM accounts WHERE user_id=$1 AND source='demo'", [
    userId,
  ]);
  if (existing.length) return 0;
  return tx(async (db) => {
    const acc = await query<{ id: string }>(
      "INSERT INTO accounts(user_id,name,institution,currency,source) VALUES ($1,'Demo account (sample data)','Demo Bank','TRY','demo') RETURNING id",
      [userId],
      db,
    );
    const accountId = acc[0]!.id;
    const seen = new Map<string, number>();
    let n = 0;
    for (const t of buildDemoTransactions(todayYmd())) {
      const base = `${t.booked_on}|${t.amount_minor}|${t.description}`;
      const occ = (seen.get(base) ?? 0) + 1;
      seen.set(base, occ);
      await query(
        "INSERT INTO transactions(user_id,account_id,booked_on,description,amount_minor,currency,category,source_ref,dedupe_key,is_demo) VALUES ($1,$2,$3,$4,$5,'TRY',$6,'demo',$7,true)",
        [
          userId,
          accountId,
          t.booked_on,
          t.description,
          t.amount_minor,
          categorize(t.description, t.amount_minor),
          computeKey(accountId, t.booked_on, t.amount_minor, 'TRY', t.description, occ),
        ],
        db,
      );
      n++;
    }
    return n;
  });
}

export async function clearDemo(userId: string): Promise<void> {
  await query("DELETE FROM accounts WHERE user_id=$1 AND source='demo'", [userId]);
}
