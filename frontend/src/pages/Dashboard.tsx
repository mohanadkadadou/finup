import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Ctx } from '../App';
import { api, errMsg } from '../api';
import { Icon } from '../components/Icon';
import {
  Alert,
  CountUp,
  Donut,
  Empty,
  PageHeader,
  Ring,
  Skeleton,
  TrendChart,
} from '../components/ui';
import { fmt, monthLabel } from '../format';
import { tr } from '../serverText';
import { useT } from '../i18n';

export interface AnalyticsData {
  empty: boolean;
  currencies: string[];
  currency: string;
  month: string;
  months_available: string[];
  note: string | null;
  summary: {
    income_minor: number;
    expenses_minor: number;
    net_minor: number;
    savings_rate_bp: number | null;
    transaction_count: number;
    by_category: { category: string; total_minor: number; share_bp: number }[];
  };
  previous_summary: { expenses_minor: number; income_minor: number; transaction_count: number };
  trend: { month: string; income_minor: number; expenses_minor: number; net_minor: number }[];
  recurring: { label: string; typical_minor: number; months: number; currency: string }[];
  estimate: { net_minor: number; months_used: string[]; includes_latest_month: boolean } | null;
}

export function useAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [currency, setCurrency] = useState<string>('');
  const [month, setMonth] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (currency) qs.set('currency', currency);
      if (month) qs.set('month', month);
      setData(await api.get<AnalyticsData>(`/analytics?${qs}`));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [currency, month]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, err, currency, setCurrency, month, setMonth, reload: load };
}

export function Pickers({ a }: { a: ReturnType<typeof useAnalytics> }) {
  const { t } = useT();
  const d = a.data;
  if (!d || d.empty) return null;
  return (
    <>
      {d.currencies.length > 1 && (
        <label>
          {t('Currency')}
          <select
            value={d.currency}
            onChange={(e) => {
              a.setCurrency(e.target.value);
              a.setMonth('');
            }}
          >
            {d.currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t('Month')}
        <select value={d.month} onChange={(e) => a.setMonth(e.target.value)}>
          {[...d.months_available].reverse().map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function DashboardPage({ ctx }: { ctx: Ctx }) {
  const { t } = useT();
  const a = useAnalytics();
  const [busy, setBusy] = useState(false);
  const d = a.data;

  const loadDemo = async () => {
    setBusy(true);
    try {
      await api.send('POST', '/demo');
      await ctx.refreshMe();
      await a.reload();
    } finally {
      setBusy(false);
    }
  };

  if (a.err) return <Alert>{a.err}</Alert>;
  if (!d) return <Skeleton />;
  if (d.empty) {
    return (
      <>
        <PageHeader title={t('Dashboard')} />
        <Empty title={t('No transactions yet')}>
          <p>
            {t(
              'Upload a bank statement (PDF, CSV or XLSX), review the rows Finup extracts, and your dashboard fills in from the transactions you confirm.',
            )}
          </p>
          <div className="row-flex" style={{ justifyContent: 'center' }}>
            <Link className="btn primary" to="/import">
              {t('Upload a statement')}
            </Link>
            <button onClick={() => void loadDemo()} disabled={busy}>
              {t('Load sample demo data')}
            </button>
          </div>
        </Empty>
      </>
    );
  }
  const s = d.summary;
  const prevExp = d.previous_summary.expenses_minor;
  const delta =
    prevExp > 0 ? Math.round(((s.expenses_minor - prevExp) * 1000) / prevExp) / 10 : null;
  return (
    <>
      <PageHeader
        title={t('Dashboard')}
        sub={t('{month} · {currency} · actual, from confirmed transactions', {
          month: monthLabel(d.month),
          currency: d.currency,
        })}
      >
        <Pickers a={a} />
      </PageHeader>
      {d.note && <Alert kind="info">{tr(d.note)}</Alert>}
      <section className="hero">
        <div className="hero-main">
          <span className="hero-label">{t('Net cash flow')}</span>
          <div className="hero-value num">
            <CountUp minor={s.net_minor} currency={d.currency} /> <small>{d.currency}</small>
          </div>
          <span className="hero-sub">{t('{n} transactions', { n: s.transaction_count })}</span>
        </div>
        <div className="hero-pills">
          <div className="pill in">
            <Icon name="down" size={18} />
            <div>
              <span>{t('Income')}</span>
              <b className="num">
                <CountUp minor={s.income_minor} currency={d.currency} />
              </b>
            </div>
          </div>
          <div className="pill out">
            <Icon name="up" size={18} />
            <div>
              <span>{t('Expenses')}</span>
              <b className="num">
                <CountUp minor={s.expenses_minor} currency={d.currency} />
              </b>
              <em>
                {delta === null
                  ? t('No previous month to compare')
                  : t('{delta}% vs previous month', { delta: `${delta > 0 ? '+' : ''}${delta}` })}
              </em>
            </div>
          </div>
        </div>
        <Ring bp={s.savings_rate_bp} label={t('Savings rate')} />
      </section>
      <div className="grid g3 mt">
        <section className="card">
          <h2>{t('Income vs expenses')}</h2>
          <TrendChart data={d.trend} currency={d.currency} />
        </section>
        <section className="card">
          <h2>{t('Where the money went')}</h2>
          <Donut rows={s.by_category} currency={d.currency} total={s.expenses_minor} />
        </section>
      </div>
      <div className="grid g2 mt">
        <section className="card">
          <h2>{t('Recurring charges')}</h2>
          {d.recurring.length === 0 ? (
            <p className="muted">{t('None detected yet (needs the same charge in 3+ months).')}</p>
          ) : (
            <ul className="cat-list">
              {d.recurring.slice(0, 6).map((r) => (
                <li key={r.label} className="cat-row">
                  <span>{r.label}</span>
                  <span className="num">
                    ≈ {fmt(r.typical_minor, r.currency)} {t('/ mo')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>{t('Estimated monthly cash flow')}</h2>
          {d.estimate ? (
            <>
              <div className="stat-value num">
                {fmt(d.estimate.net_minor, d.currency)}{' '}
                <span className="small muted">
                  {t('{currency} / month · estimate', { currency: d.currency })}
                </span>
              </div>
              <p className="muted small">
                {d.estimate.includes_latest_month
                  ? t(
                      'Based on the only month of data available ({month}), which may be incomplete.',
                      { month: monthLabel(d.estimate.months_used[0] ?? d.month) },
                    )
                  : t(
                      'Average net of {months}; the latest month is excluded because it may be incomplete.',
                      { months: d.estimate.months_used.map(monthLabel).join(', ') },
                    )}{' '}
                {t('This is an estimate, not a guarantee.')}
              </p>
            </>
          ) : (
            <p className="muted">{t('Not enough data yet.')}</p>
          )}
        </section>
      </div>
    </>
  );
}
