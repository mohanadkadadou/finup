import { useEffect, useState, type FormEvent } from 'react';
import { api, errMsg } from '../api';
import { Alert, Badge, PageHeader } from '../components/ui';
import { fmt, monthLabel, toMinor } from '../format';
import { tr } from '../serverText';
import { useT } from '../i18n';
import { useAnalytics } from './Dashboard';

interface Plan {
  currency: string;
  remaining_minor: number;
  months: number;
  deadline: string;
  plan: {
    monthly_required_minor: number;
    affordability: 'no_data' | 'comfortable' | 'tight' | 'exceeds_cash_flow';
    estimated_monthly_net_minor: number | null;
    assumptions: string[];
  };
  months_at_current_net: number | null;
  shortfall_minor: number | null;
  cuts: { category: string; monthly_minor: number; cut_minor: number }[];
  cuts_total_minor: number;
  months_with_cuts: number | null;
  cuts_close_gap: boolean | null;
  cut_pct: number;
}

const isolate = (s: string) => `⁦${s}⁩`;

export function PlannerPage() {
  const { t } = useT();
  const a = useAnalytics();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [saved, setSaved] = useState('0');
  const [months, setMonths] = useState(6);
  const [currency, setCurrency] = useState('');
  const [res, setRes] = useState<Plan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (a.data && !a.data.empty && !currency) setCurrency(a.data.currency);
  }, [a.data, currency]);
  const cur = currency || 'TRY';
  const currencies =
    a.data && !a.data.empty && a.data.currencies.length > 0 ? a.data.currencies : [cur];
  const money = (n: number) => isolate(`${fmt(n, cur)} ${cur}`);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const priceMinor = toMinor(price, cur);
    const savedMinor = toMinor(saved || '0', cur);
    if (!priceMinor || priceMinor <= 0) return setErr(t('Enter the price as a positive number.'));
    if (savedMinor === null) return setErr(t('Enter what you already saved as a number.'));
    setBusy(true);
    try {
      setRes(
        await api.send<Plan>('POST', '/purchase-plan', {
          price_minor: priceMinor,
          saved_minor: savedMinor,
          months,
          currency: cur,
        }),
      );
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  const saveGoal = async () => {
    const priceMinor = toMinor(price, cur);
    const savedMinor = toMinor(saved || '0', cur);
    if (!res || !priceMinor || savedMinor === null) return;
    setBusy(true);
    try {
      await api.send('POST', '/goals', {
        name: name.trim() || t('Planned purchase'),
        target_minor: priceMinor,
        current_minor: Math.min(savedMinor, priceMinor),
        currency: cur,
        deadline: res.deadline,
      });
      setOk(t('Saved to your savings goals.'));
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  const verdict = res
    ? (
        {
          comfortable: [t('Comfortable'), 'ok'],
          tight: [t('Tight'), 'warn'],
          exceeds_cash_flow: [t('Above your current cash flow'), 'bad'],
          no_data: [t('Not enough data to judge'), 'neutral'],
        } as const
      )[res.plan.affordability]
    : null;

  return (
    <>
      <PageHeader
        title={t('Purchase planner')}
        sub={t('Plan something you want to buy and see how to afford it.')}
      />
      <div className="grid g2">
        <form className="card grid" onSubmit={(e) => void submit(e)}>
          <label>
            {t('What are you saving for?')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={t('e.g. Laptop, car, trip')}
            />
          </label>
          <div className="row-flex">
            <label style={{ flex: 1 }}>
              {t('Price')}
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </label>
            <label>
              {t('Currency')}
              <select value={cur} onChange={(e) => setCurrency(e.target.value)}>
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {t('Already saved')}
            <input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} />
          </label>
          <label>
            {t('Buy it in {n} months', { n: months })}
            <input
              type="range"
              min={1}
              max={36}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            />
          </label>
          {err && <Alert>{err}</Alert>}
          <button className="primary" disabled={busy} type="submit">
            {t('Make my plan')}
          </button>
        </form>

        <section className="card">
          {!res ? (
            <p className="muted">
              {t(
                'Enter a price and a timeframe. FinUp compares the monthly amount you would need with your real cash flow.',
              )}
            </p>
          ) : (
            <>
              <div className="muted small">{t('Save each month')}</div>
              <div className="stat-value num">{money(res.plan.monthly_required_minor)}</div>
              <p className="muted small">
                {t('To reach {amount} by {month}.', {
                  amount: money(res.remaining_minor),
                  month: monthLabel(res.deadline.slice(0, 7)),
                })}
              </p>
              {verdict && (
                <p>
                  <Badge kind={verdict[1]}>{verdict[0]}</Badge>
                </p>
              )}
              {res.plan.estimated_monthly_net_minor !== null && (
                <p>
                  {t('Your estimated monthly surplus is {amount}.', {
                    amount: money(res.plan.estimated_monthly_net_minor),
                  })}
                  {res.shortfall_minor !== null && res.shortfall_minor > 0 && (
                    <>
                      {' '}
                      {t('You are short by about {amount} a month.', {
                        amount: money(res.shortfall_minor),
                      })}
                    </>
                  )}
                </p>
              )}
              {res.months_at_current_net !== null && res.months_at_current_net > 0 && (
                <p>
                  {t('At your current pace you would get there in {n} months.', {
                    n: res.months_at_current_net,
                  })}
                </p>
              )}
              {res.months_at_current_net === null &&
                res.plan.estimated_monthly_net_minor !== null && (
                  <p className="neg">
                    {t(
                      'Your monthly surplus is not positive, so you cannot save for this yet without cutting spending.',
                    )}
                  </p>
                )}
              {res.cuts.length > 0 && (
                <>
                  <h3 className="mt">
                    {t('Trim {pct}% from flexible spending', { pct: res.cut_pct })}
                  </h3>
                  <ul className="cat-list">
                    {res.cuts.map((c) => (
                      <li key={c.category} className="cat-row">
                        <span>{t(c.category)}</span>
                        <span className="num">
                          +{money(c.cut_minor)} {t('/ month')}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p>
                    {t('That adds {amount} a month', { amount: money(res.cuts_total_minor) })}
                    {res.months_with_cuts !== null && res.months_with_cuts > 0 && (
                      <> {t('and gets you there in {n} months.', { n: res.months_with_cuts })}</>
                    )}
                    {res.cuts_close_gap === true && (
                      <> {t('That closes the gap for your deadline.')}</>
                    )}
                    {res.cuts_close_gap === false && (
                      <> {t('That still does not fully close the gap.')}</>
                    )}
                  </p>
                </>
              )}
              <details>
                <summary className="small">{t('How this is calculated')}</summary>
                <ul className="small muted">
                  {res.plan.assumptions.map((s) => (
                    <li key={s}>{tr(s)}</li>
                  ))}
                </ul>
              </details>
              {ok && <Alert kind="ok">{ok}</Alert>}
              <button type="button" disabled={busy || !!ok} onClick={() => void saveGoal()}>
                {t('Save as a savings goal')}
              </button>
            </>
          )}
        </section>
      </div>
    </>
  );
}
