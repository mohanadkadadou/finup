import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api';
import { Alert, Empty, PageHeader, Stat, Skeleton } from '../components/ui';
import { dayLabel, fmt, monthLabel, weekdayLabel } from '../format';
import { useT } from '../i18n';

interface Payee {
  label: string;
  category: string;
  total_minor: number;
  count: number;
  avg_minor: number;
  share_bp: number;
  last_seen: string;
}
interface Tip {
  id: string;
  kind: string;
  saving_minor: number | null;
  params: Record<string, string | number>;
}
interface InsightsData {
  empty: boolean;
  currency: string;
  month: string;
  months_available: string[];
  summary: {
    expenses_minor: number;
    by_category: { category: string; total_minor: number; share_bp: number; count: number }[];
  };
  payees_month: Payee[];
  payees_all: Payee[];
  weekday: { weekday: number; total_minor: number; count: number; avg_per_day_minor: number }[];
  top_days: { date: string; weekday: number; total_minor: number; count: number }[];
  tips: Tip[];
  category_months: {
    months: {
      month: string;
      total_minor: number;
      top: { category: string; total_minor: number; share_bp: number } | null;
      categories: { category: string; total_minor: number }[];
    }[];
    leader: { category: string; months_led: number; total_minor: number } | null;
    overall: { category: string; total_minor: number; share_bp: number }[];
  };
}

const PALETTE = ['#00c26a', '#0f4d3e', '#2f80ed', '#f2994a', '#9b51e0', '#eb5757'];
const OTHER = '#9aa5ad';

function CategoryMonths({
  data,
  money,
}: {
  data: InsightsData['category_months'];
  money: (n: number) => string;
}) {
  const { t } = useT();
  if (data.months.length === 0) return null;
  const colorOf = (cat: string) => {
    const i = data.overall.findIndex((c) => c.category === cat);
    return i >= 0 && i < PALETTE.length ? PALETTE[i]! : OTHER;
  };
  const legend = data.overall.slice(0, PALETTE.length);
  const maxTotal = Math.max(1, ...data.months.map((m) => m.total_minor));
  return (
    <section className="card mt cm">
      <div className="row-between">
        <h2>{t('Where most of your money went, month by month')}</h2>
      </div>
      {data.leader && (
        <p className="cm-lead">
          <span className="cm-dot" style={{ background: colorOf(data.leader.category) }} />
          {t('{category} was your biggest expense in {n} of {total} months ({amount} in total).', {
            category: t(data.leader.category),
            n: data.leader.months_led,
            total: data.months.length,
            amount: money(data.leader.total_minor),
          })}
        </p>
      )}
      <ul className="cm-legend">
        {legend.map((c) => (
          <li key={c.category}>
            <span className="cm-dot" style={{ background: colorOf(c.category) }} />
            {t(c.category)}
          </li>
        ))}
      </ul>
      <ol className="cm-rows">
        {[...data.months].reverse().map((m, idx) => (
          <li key={m.month} style={{ ['--i' as string]: idx }}>
            <span className="cm-month small">{monthLabel(m.month)}</span>
            <div className="cm-track">
              <div className="cm-bar" style={{ width: `${(m.total_minor / maxTotal) * 100}%` }}>
                {m.categories.map((c) => (
                  <span
                    key={c.category}
                    title={`${t(c.category)}: ${money(c.total_minor)}`}
                    style={{
                      flexGrow: c.total_minor,
                      background: colorOf(c.category),
                    }}
                  />
                ))}
              </div>
            </div>
            <span className="cm-top small">
              {m.top ? (
                <>
                  <strong>{t(m.top.category)}</strong> · {(m.top.share_bp / 100).toFixed(0)}%
                  <span className="muted"> · {money(m.top.total_minor)}</span>
                </>
              ) : (
                '—'
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted small">
        {t(
          'Each bar is a month of spending, split by category. The label shows that month’s biggest category.',
        )}
      </p>
    </section>
  );
}

/** Keeps digits and currency in one left-to-right run inside Arabic sentences. */
const isolate = (s: string) => `⁦${s}⁩`;

export function InsightsPage() {
  const { t } = useT();
  const [data, setData] = useState<InsightsData | null>(null);
  const [month, setMonth] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<'month' | 'all'>('month');

  const load = useCallback(async () => {
    try {
      setData(await api.get<InsightsData>(`/insights${month ? `?month=${month}` : ''}`));
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [month]);
  useEffect(() => {
    void load();
  }, [load]);

  if (err) return <Alert>{err}</Alert>;
  if (!data) return <Skeleton />;
  if (data.empty)
    return (
      <>
        <PageHeader title={t('Insights')} />
        <Empty title={t('No data to analyse')}>
          <p>{t('Import and confirm a statement first.')}</p>
          <Link className="btn primary" to="/import">
            {t('Upload a statement')}
          </Link>
        </Empty>
      </>
    );

  const cur = data.currency;
  const money = (n: number) => isolate(`${fmt(n, cur)} ${cur}`);
  const payees = scope === 'month' ? data.payees_month : data.payees_all;
  const topPayee = data.payees_month[0];
  const topCat = data.summary.by_category[0];
  const topDay = data.top_days[0];
  const maxAvg = Math.max(1, ...data.weekday.map((w) => w.avg_per_day_minor));
  const peakWd = data.weekday.reduce((a, w) => (w.avg_per_day_minor > a.avg_per_day_minor ? w : a));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const maxPayee = Math.max(1, ...payees.map((p) => p.total_minor));

  const tipText = (tip: Tip): string => {
    const p = tip.params;
    const v: Record<string, string | number> = {};
    for (const [k, val] of Object.entries(p)) {
      if (k.endsWith('_minor')) v[k.slice(0, -6)] = money(Number(val));
      else if (k === 'category') v[k] = t(String(val));
      else v[k] = val;
    }
    if (tip.saving_minor !== null) v.saving = money(tip.saving_minor);
    if (tip.kind === 'weekend_spike') v.ratio = (Number(p.ratio_x10) / 10).toFixed(1);
    const msg: Record<string, string> = {
      overspend:
        'You spent {gap} more than you earned this month. Start with the flexible categories below.',
      low_savings:
        'You kept {rate_pct}% of your income. A common target is 20% (about {target}): move it to savings right after payday.',
      category_heavy:
        '{category} takes {share_pct}% of your spending ({total}). Cutting it by {cut_pct}% would free about {saving} a month.',
      category_growth:
        '{category} rose {change_pct}% versus last month (+{delta}). Check whether that was a one-off.',
      frequent_small:
        '{count} small purchases added up to {total}. Cutting {cut_pct}% would save about {saving} a month.',
      weekend_spike:
        'You spend about {ratio}× more per day on weekends than on weekdays. Set a weekend budget in advance.',
      subscriptions:
        '{count} subscription charges cost {total} this month (about {yearly} a year). Cancel anything you did not use.',
      recurring:
        '{count} recurring charges total about {monthly} a month, led by {top_label}. Review them every quarter.',
      fees: 'Bank fees and commissions cost {total}. Ask your bank about waivers or a fee-free account.',
    };
    return t(msg[tip.kind] ?? tip.kind, v);
  };

  return (
    <>
      <PageHeader
        title={t('Insights')}
        sub={t('{month} · {currency} · actual, from confirmed transactions', {
          month: monthLabel(data.month),
          currency: cur,
        })}
      >
        <label>
          {t('Month')}
          <select value={data.month} onChange={(e) => setMonth(e.target.value)}>
            {[...data.months_available].reverse().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>

      <div className="grid g4">
        <Stat
          label={t('Most paid to')}
          value={topPayee ? topPayee.label : '—'}
          sub={topPayee ? money(topPayee.total_minor) : undefined}
        />
        <Stat
          label={t('Biggest category')}
          value={topCat ? t(topCat.category) : '—'}
          sub={
            topCat
              ? `${money(topCat.total_minor)} · ${(topCat.share_bp / 100).toFixed(1)}%`
              : undefined
          }
        />
        <Stat
          label={t('Costliest day')}
          value={topDay ? dayLabel(topDay.date) : '—'}
          sub={
            topDay ? `${weekdayLabel(topDay.weekday)} · ${money(topDay.total_minor)}` : undefined
          }
        />
        <Stat
          label={t('Priciest weekday')}
          value={weekdayLabel(peakWd.weekday)}
          sub={t('avg {amount} per day', { amount: money(peakWd.avg_per_day_minor) })}
        />
      </div>

      <CategoryMonths data={data.category_months} money={money} />

      <div className="grid g3 mt">
        <section className="card">
          <div className="row-between">
            <h2>{t('Who got most of your money')}</h2>
            <div className="seg" role="group" aria-label={t('Period')}>
              <button
                type="button"
                className={scope === 'month' ? 'on' : ''}
                onClick={() => setScope('month')}
              >
                {t('This month')}
              </button>
              <button
                type="button"
                className={scope === 'all' ? 'on' : ''}
                onClick={() => setScope('all')}
              >
                {t('All time')}
              </button>
            </div>
          </div>
          {payees.length === 0 ? (
            <p className="muted">{t('No expenses in this period.')}</p>
          ) : (
            <ol className="rank">
              {payees.map((p, i) => (
                <li key={p.label}>
                  <span className="rank-n">{i + 1}</span>
                  <div className="rank-body">
                    <div className="cat-row">
                      <strong>{p.label}</strong>
                      <span className="num">{money(p.total_minor)}</span>
                    </div>
                    <div className="meter" role="presentation">
                      <div style={{ width: `${Math.max(3, (p.total_minor / maxPayee) * 100)}%` }} />
                    </div>
                    <div className="muted small">
                      {t(p.category)} · {t('{n} payments', { n: p.count })} ·{' '}
                      {t('avg {amount}', { amount: money(p.avg_minor) })} ·{' '}
                      {(p.share_bp / 100).toFixed(1)}%
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card">
          <h2>{t('Where your money went')}</h2>
          {data.summary.by_category.length === 0 ? (
            <p className="muted">{t('No expenses in this period.')}</p>
          ) : (
            <ul className="cat-list">
              {data.summary.by_category.map((c) => (
                <li key={c.category}>
                  <div className="cat-row">
                    <span>{t(c.category)}</span>
                    <span className="num">
                      {money(c.total_minor)}{' '}
                      <span className="muted small">{(c.share_bp / 100).toFixed(1)}%</span>
                    </span>
                  </div>
                  <div className="meter" role="presentation">
                    <div style={{ width: `${Math.max(2, c.share_bp / 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid g2 mt">
        <section className="card">
          <h2>{t('Spending by day of the week')}</h2>
          <div className="wd" role="img" aria-label={t('Average spending per weekday')}>
            {order.map((i) => {
              const w = data.weekday[i]!;
              return (
                <div
                  key={i}
                  className={`wd-col${w.weekday === peakWd.weekday && w.avg_per_day_minor > 0 ? ' peak' : ''}`}
                >
                  <span className="wd-val num small">
                    {w.avg_per_day_minor > 0 ? fmt(w.avg_per_day_minor, cur) : ''}
                  </span>
                  <div className="wd-bar">
                    <div style={{ height: `${(w.avg_per_day_minor / maxAvg) * 100}%` }} />
                  </div>
                  <span className="small">{weekdayLabel(i, 'short')}</span>
                </div>
              );
            })}
          </div>
          <p className="muted small">
            {t('Average spent on each day, in {currency}.', { currency: cur })}
          </p>
        </section>
        <section className="card">
          <h2>{t('Your most expensive days')}</h2>
          {data.top_days.length === 0 ? (
            <p className="muted">{t('No expenses in this period.')}</p>
          ) : (
            <ul className="cat-list">
              {data.top_days.map((d) => (
                <li key={d.date} className="cat-row">
                  <span>
                    {dayLabel(d.date)} · {weekdayLabel(d.weekday)}{' '}
                    <span className="muted small">{t('{n} payments', { n: d.count })}</span>
                  </span>
                  <span className="num">{money(d.total_minor)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt">
        <h2>{t('Tips to waste less')}</h2>
        {data.tips.length === 0 ? (
          <p className="muted">
            {t('Nothing stands out this month. Your spending looks balanced.')}
          </p>
        ) : (
          <ul className="tips">
            {data.tips.map((tip) => (
              <li key={tip.id}>
                <span className="tip-dot" aria-hidden="true" />
                <span>{tipText(tip)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small mt">
          {t(
            'Tips come from your own transactions with fixed rules. Savings figures are simple what-if cuts, not predictions.',
          )}
        </p>
        <Link className="btn" to="/planner">
          {t('Plan a purchase')}
        </Link>
      </section>
    </>
  );
}
