import type { ReactNode } from 'react';
import { fmt, monthLabel } from '../format';
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
        <line x1={pad} x2={W - pad} y1={H} y2={H} className="axis" />
        {data.map((d, i) => {
          const x = pad + i * step + step / 2;
          const hi = (d.income_minor / max) * (H - 14);
          const he = (d.expenses_minor / max) * (H - 14);
          return (
            <g key={d.month}>
              <rect x={x - bw - 1} y={H - hi} width={bw} height={hi} rx={2} className="bar-in">
                <title>{`${monthLabel(d.month)} ${t('Income')} ${fmt(d.income_minor, currency)}`}</title>
              </rect>
              <rect x={x + 1} y={H - he} width={bw} height={he} rx={2} className="bar-out">
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
