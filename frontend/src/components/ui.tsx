import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CategoryChip } from './category';
import { dayLabel, fmt, monthLabel } from '../format';
import { useT } from '../i18n';

export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="head-actions">{children}</div>}
    </header>
  );
}

export const Alert = ({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'info' | 'warn' | 'ok';
  children: ReactNode;
}) => (
  <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    {children}
  </div>
);

export const Badge = ({
  kind = 'neutral',
  children,
}: {
  kind?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
  children: ReactNode;
}) => <span className={`badge ${kind}`}>{children}</span>;

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'pos' | 'neg';
}) {
  return (
    <div className="card stat">
      <div className="muted small">{label}</div>
      <div className={`stat-value num ${tone ?? ''}`}>{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="empty">
    <h3>{title}</h3>
    {children}
  </div>
);

export const Money = ({
  minor,
  currency,
  signed,
}: {
  minor: number;
  currency: string;
  signed?: boolean;
}) => (
  <span className={`num ${signed ? (minor < 0 ? 'neg' : 'pos') : ''}`}>
    {signed && minor > 0 ? '+' : ''}
    {fmt(minor, currency)}
  </span>
);

interface Point {
  month: string;
  income_minor: number;
  expenses_minor: number;
}
/** Paired income/expense bars per month. Accessible: has a title and a text table fallback. */
export function TrendChart({ data, currency }: { data: Point[]; currency: string }) {
  const { t } = useT();
  const max = Math.max(1, ...data.flatMap((d) => [d.income_minor, d.expenses_minor]));
  const W = 560,
    H = 190,
    pad = 28;
  const bw = Math.min(26, (W - pad * 2) / Math.max(1, data.length) / 2.6);
  const step = (W - pad * 2) / Math.max(1, data.length);
  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${W} ${H + 24}`}
        role="img"
        aria-label={t('Monthly income and expenses in {currency}', { currency })}
      >
        <title>{t('Monthly income and expenses in {currency}', { currency })}</title>
        <defs>
          <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00e676" />
            <stop offset="100%" stopColor="#00b35c" />
          </linearGradient>
          <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b6b57" />
            <stop offset="100%" stopColor="#0f4d3e" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={W - pad}
            y1={H - f * (H - 14)}
            y2={H - f * (H - 14)}
            className="gridline"
          />
        ))}
        <line x1={pad} x2={W - pad} y1={H} y2={H} className="axis" />
        {data.map((d, i) => {
          const x = pad + i * step + step / 2;
          const hi = (d.income_minor / max) * (H - 14);
          const he = (d.expenses_minor / max) * (H - 14);
          return (
            <g key={d.month}>
              <rect
                x={x - bw - 1}
                y={H - hi}
                width={bw}
                height={hi}
                rx={5}
                className="bar-in"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <title>{`${monthLabel(d.month)} ${t('Income')} ${fmt(d.income_minor, currency)}`}</title>
              </rect>
              <rect
                x={x + 1}
                y={H - he}
                width={bw}
                height={he}
                rx={5}
                className="bar-out"
                style={{ animationDelay: `${i * 0.06 + 0.04}s` }}
              >
                <title>{`${monthLabel(d.month)} ${t('Expenses')} ${fmt(d.expenses_minor, currency)}`}</title>
              </rect>
              <text x={x} y={H + 16} textAnchor="middle" className="tick">
                {monthLabel(d.month).split(' ')[0]}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">
        <span>
          <i className="dot in" />
          {t('Income')}
        </span>
        <span>
          <i className="dot out" />
          {t('Expenses')}
        </span>
        <span className="muted">
          {t('Actual, confirmed transactions in {currency}', { currency })}
        </span>
      </figcaption>
    </figure>
  );
}

export function CategoryBars({
  rows,
  currency,
}: {
  rows: { category: string; total_minor: number; share_bp: number }[];
  currency: string;
}) {
  const { t } = useT();
  if (rows.length === 0) return <p className="muted">{t('No expenses in this period.')}</p>;
  return (
    <ul className="cat-list">
      {rows.map((r) => (
        <li key={r.category}>
          <div className="cat-row">
            <span>{t(r.category)}</span>
            <span className="num">
              {fmt(r.total_minor, currency)}{' '}
              <span className="muted small">{(r.share_bp / 100).toFixed(1)}%</span>
            </span>
          </div>
          <div className="meter" role="presentation">
            <div style={{ width: `${Math.max(2, r.share_bp / 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Placeholder shown while a page loads; keeps the layout stable instead of flashing text. */
export function Skeleton() {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      <div className="sk sk-title" />
      <div className="grid g4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sk sk-card" />
        ))}
      </div>
      <div className="sk sk-block" />
    </div>
  );
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts a money amount up from zero. The final frame is always the exact value. */
export function CountUp({ minor, currency }: { minor: number; currency: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reducedMotion()) {
      setV(minor);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setV(p >= 1 ? minor : Math.round(minor * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [minor]);
  return <>{fmt(v, currency)}</>;
}

export const CAT_COLORS = ['#00c26a', '#0f4d3e', '#2f80ed', '#f2994a', '#9b51e0', '#eb5757'];
export const CAT_OTHER = '#9aa5ad';

/** Spending split as a donut with a legend. Rows beyond the palette are grouped as "Other". */
export function Donut({
  rows,
  currency,
  total,
}: {
  rows: { category: string; total_minor: number; share_bp: number }[];
  currency: string;
  total: number;
}) {
  const { t } = useT();
  const [active, setActive] = useState<string | null>(null);
  if (rows.length === 0 || total <= 0)
    return <p className="muted">{t('No expenses in this period.')}</p>;
  const shown = rows.slice(0, CAT_COLORS.length);
  const rest = rows.slice(CAT_COLORS.length).reduce((a, r) => a + r.total_minor, 0);
  const parts = [
    ...shown.map((r, i) => ({
      key: r.category,
      cat: r.category as string | null,
      label: t(r.category),
      minor: r.total_minor,
      color: CAT_COLORS[i]!,
    })),
    ...(rest > 0
      ? [{ key: '_o', cat: null, label: t('Other'), minor: rest, color: CAT_OTHER }]
      : []),
  ];
  const cur = parts.find((p) => p.key === active) ?? null;
  const R = 44;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const toggle = (key: string) => setActive((a) => (a === key ? null : key));
  return (
    <div className="donut">
      <div className="donut-ring">
        <svg viewBox="0 0 120 120" role="img" aria-label={t('Where the money went')}>
          <circle cx="60" cy="60" r={R} className="donut-bg" />
          {parts.map((p, i) => {
            const len = (p.minor / total) * C;
            const off = -acc;
            acc += len;
            return (
              <circle
                key={p.key}
                cx="60"
                cy="60"
                r={R}
                className={`donut-seg${active && active !== p.key ? ' dim' : ''}${active === p.key ? ' sel' : ''}`}
                stroke={p.color}
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`}
                strokeDashoffset={off}
                style={{ animationDelay: `${0.15 + i * 0.1}s` }}
                onMouseEnter={() => setActive(p.key)}
                onMouseLeave={() => setActive(null)}
                onClick={() => toggle(p.key)}
              >
                <title>{`${p.label}: ${fmt(p.minor, currency)}`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="donut-center">
          <span className="small muted">{cur ? cur.label : t('Expenses')}</span>
          <strong className="num">
            {cur ? fmt(cur.minor, currency) : <CountUp minor={total} currency={currency} />}
          </strong>
          <span className="small muted">
            {cur ? `${((cur.minor / total) * 100).toFixed(0)}% · ${currency}` : currency}
          </span>
        </div>
      </div>
      <ul className="donut-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              className={`legend-btn${active === p.key ? ' on' : ''}`}
              onMouseEnter={() => setActive(p.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(p.key)}
              onBlur={() => setActive(null)}
              onClick={() => toggle(p.key)}
            >
              <i style={{ background: p.color }} />
              <span>{p.label}</span>
              <span className="num muted small">{((p.minor / total) * 100).toFixed(0)}%</span>
            </button>
          </li>
        ))}
      </ul>
      {cur?.cat && (
        <Link className="btn donut-go" to={`/transactions?category=${encodeURIComponent(cur.cat)}`}>
          {t('View {category} transactions', { category: cur.label })}
        </Link>
      )}
    </div>
  );
}

/** Ring showing a percentage (basis points), e.g. savings rate. */
export function Ring({ bp, label }: { bp: number | null; label: string }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const clamped = bp === null ? 0 : Math.max(0, Math.min(10000, bp));
  return (
    <div className="ring">
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r={R} className="ring-bg" />
        <circle
          cx="42"
          cy="42"
          r={R}
          className="ring-fg"
          strokeDasharray={`${(clamped / 10000) * C} ${C}`}
        />
      </svg>
      <div className="ring-txt">
        <strong className="num">{bp === null ? '—' : `${(bp / 100).toFixed(0)}%`}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export interface Fact {
  id: string;
  kind: string;
  params: Record<string, string | number>;
}

const FACT_TEXT: Record<string, string> = {
  biggest_purchase:
    'Your biggest single purchase was {label} for {amount} on {date}: {share_pct}% of everything you spent.',
  most_frequent: 'You paid {label} {count} times, {total} in total.',
  distinct_payees: 'Your money went to {count} different places across {tx_count} payments.',
  top3_share: 'Just 3 places took {pct}% of your spending.',
  avg_daily: 'You spent about {amount} per day over {days} days.',
  no_spend_days: '{count} of {days} days had no spending at all.',
  weekend_share: '{pct}% of your spending happened on weekends.',
  avg_purchase: 'The average payment was {amount} across {count} payments.',
  category_per_day: '{category} costs you about {amount} every day.',
  most_transactions_category: '{category} had the most payments: {count}.',
  biggest_rise: '{category} grew the most versus last month: +{delta}.',
};

/** Rotating "did you know" facts about where the money went. Facts are computed on the server from real rows. */
export function FactsCard({ facts, currency }: { facts: Fact[]; currency: string }) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = facts.length;
  useEffect(() => {
    if (paused || n < 2 || reducedMotion()) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 7000);
    return () => clearInterval(id);
  }, [paused, n]);
  if (n === 0) return null;
  const f = facts[i % n]!;
  const money = (v: number) => `\u2066${fmt(v, currency)} ${currency}\u2069`;
  const v: Record<string, string | number> = {};
  for (const [k, val] of Object.entries(f.params)) {
    if (k.endsWith('_minor')) v[k.slice(0, -6)] = money(Number(val));
    else if (k === 'category') v[k] = t(String(val));
    else if (k === 'date') v[k] = dayLabel(String(val));
    else v[k] = val;
  }
  const shuffle = () => {
    setPaused(true);
    setI((x) => {
      if (n < 2) return x;
      let r = x;
      while (r === x) r = Math.floor(Math.random() * n);
      return r;
    });
  };
  return (
    <section className="card facts" aria-live="polite">
      <div className="facts-head">
        <span className="facts-tag">{t('Did you know?')}</span>
        <button type="button" className="facts-next" onClick={shuffle}>
          {t('Another fact')}
        </button>
      </div>
      <p key={f.id} className="facts-text">
        {t(FACT_TEXT[f.kind] ?? f.kind, v)}
      </p>
      <div className="facts-dots" role="tablist" aria-label={t('Facts')}>
        {facts.map((x, idx) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={idx === i % n}
            aria-label={`${idx + 1}`}
            className={idx === i % n ? 'on' : ''}
            onClick={() => {
              setPaused(true);
              setI(idx);
            }}
          />
        ))}
      </div>
    </section>
  );
}

/** Fetches the month's facts for the dashboard. Silent when unavailable. */
export function DashboardFacts({ month, currency }: { month: string; currency: string }) {
  const [facts, setFacts] = useState<Fact[]>([]);
  useEffect(() => {
    let live = true;
    api
      .get<{ facts?: Fact[] }>(`/insights?month=${month}&currency=${currency}`)
      .then((r) => live && setFacts(r.facts ?? []))
      .catch(() => live && setFacts([]));
    return () => {
      live = false;
    };
  }, [month, currency]);
  return <FactsCard facts={facts} currency={currency} />;
}

interface LatestTx {
  id: string;
  booked_on: string;
  description: string;
  amount_minor: number;
  currency: string;
  category: string;
}

/** The most recent transactions, each tagged with the category it was spent on. */
export function LatestTransactions() {
  const { t } = useT();
  const [rows, setRows] = useState<LatestTx[]>([]);
  useEffect(() => {
    let live = true;
    api
      .get<{ transactions: LatestTx[] }>('/transactions?page=1&pageSize=8')
      .then((r) => live && setRows(r.transactions))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);
  if (rows.length === 0) return null;
  return (
    <section className="card">
      <h2>{t('Latest transactions')}</h2>
      <ul className="latest">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="latest-main">
              <strong>{r.description}</strong>
              <span className="muted small">{dayLabel(r.booked_on)}</span>
            </div>
            <CategoryChip category={r.category} />
            <Money minor={r.amount_minor} currency={r.currency} signed />
          </li>
        ))}
      </ul>
    </section>
  );
}
