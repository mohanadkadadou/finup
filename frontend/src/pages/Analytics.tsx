import { Alert, CategoryBars, Empty, PageHeader, TrendChart, Skeleton } from '../components/ui';
import { fmt, monthLabel } from '../format';
import { tr } from '../serverText';
import { useT } from '../i18n';
import { Pickers, useAnalytics } from './Dashboard';

export function AnalyticsPage() {
  const { t } = useT();
  const a = useAnalytics();
  const d = a.data;
  if (a.err) return <Alert>{a.err}</Alert>;
  if (!d) return <Skeleton />;
  if (d.empty)
    return (
      <>
        <PageHeader title={t('Analytics')} />
        <Empty title={t('No data to analyse')}>
          <p>{t('Import and confirm a statement first.')}</p>
        </Empty>
      </>
    );
  const s = d.summary;
  return (
    <>
      <PageHeader
        title={t('Analytics')}
        sub={t('{month} · {currency} · actual', {
          month: monthLabel(d.month),
          currency: d.currency,
        })}
      >
        <Pickers a={a} />
      </PageHeader>
      {d.note && <Alert kind="info">{tr(d.note)}</Alert>}
      <div className="grid g3">
        <section className="card">
          <h2>{t('Monthly trend')}</h2>
          <TrendChart data={d.trend} currency={d.currency} />
        </section>
        <section className="card">
          <h2>{t('Expenses by category')}</h2>
          <CategoryBars rows={s.by_category} currency={d.currency} />
        </section>
      </div>
      <section className="card mt">
        <h2>{t('Month by month ({currency})', { currency: d.currency })}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Month')}</th>
                <th className="right">{t('Income')}</th>
                <th className="right">{t('Expenses')}</th>
                <th className="right">{t('Net')}</th>
              </tr>
            </thead>
            <tbody>
              {[...d.trend].reverse().map((p) => (
                <tr key={p.month}>
                  <td>{monthLabel(p.month)}</td>
                  <td className="right num">{fmt(p.income_minor, d.currency)}</td>
                  <td className="right num">{fmt(p.expenses_minor, d.currency)}</td>
                  <td className={`right num ${p.net_minor < 0 ? 'neg' : 'pos'}`}>
                    {fmt(p.net_minor, d.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small mt">
          {t(
            'All figures are sums of your confirmed transactions in {currency}. Other currencies are never converted or combined.',
            { currency: d.currency },
          )}
        </p>
      </section>
    </>
  );
}
