import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errMsg } from '../api';
import { Alert, Empty, PageHeader } from '../components/ui';
import { fmt, monthLabel, toMinor } from '../format';
import { useT } from '../i18n';
import { CATEGORIES } from './Transactions';

interface Budget {
  id: string;
  category: string;
  limit_minor: number;
  currency: string;
  spent_minor: number;
  remaining_minor: number;
  over: boolean;
}

export function BudgetsPage() {
  const { t } = useT();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [limit, setLimit] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ budgets: Budget[]; month: string }>('/budgets');
      setBudgets(r.budgets);
      setMonth(r.month);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const minor = toMinor(limit, currency);
    if (!minor) {
      setErr(t('Enter a valid positive limit, for example 5000 or 5.000,50.'));
      return;
    }
    try {
      await api.send('PUT', '/budgets', {
        category,
        limit_minor: minor,
        currency: currency.toUpperCase(),
      });
      setLimit('');
      setErr(null);
      await load();
    } catch (x) {
      setErr(errMsg(x));
    }
  };
  const remove = async (id: string) => {
    try {
      await api.send('DELETE', `/budgets/${id}`);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
  };

  return (
    <>
      <PageHeader
        title={t('Budgets')}
        sub={
          month
            ? t('Spending against limits for {month} (actual)', { month: monthLabel(month) })
            : undefined
        }
      />
      {err && <Alert>{err}</Alert>}
      <form className="card form" onSubmit={(e) => void save(e)}>
        <label>
          {t('Category')}
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.filter((c) => !['Salary', 'Income'].includes(c)).map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Monthly limit')}
          <input
            inputMode="decimal"
            required
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="5000.00"
          />
        </label>
        <label>
          {t('Currency')}
          <input
            value={currency}
            maxLength={3}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </label>
        <button className="primary" type="submit">
          {t('Save budget')}
        </button>
      </form>
      <div className="mt">
        {budgets.length === 0 ? (
          <Empty title={t('No budgets yet')}>
            <p>{t('Set a monthly limit for a category to track it against your real spending.')}</p>
          </Empty>
        ) : (
          <div className="grid g2">
            {budgets.map((b) => {
              const pctUsed = Math.min(100, Math.round((b.spent_minor * 100) / b.limit_minor));
              return (
                <div key={b.id} className="card">
                  <div className="cat-row">
                    <strong>{t(b.category)}</strong>
                    <button className="linkish" onClick={() => void remove(b.id)}>
                      {t('Remove')}
                    </button>
                  </div>
                  <div className={`meter ${b.over ? 'over' : ''}`}>
                    <div style={{ width: `${pctUsed}%` }} />
                  </div>
                  <p className="small mt">
                    {t('{spent} of {limit} {currency}', {
                      spent: fmt(b.spent_minor, b.currency),
                      limit: fmt(b.limit_minor, b.currency),
                      currency: b.currency,
                    })}{' '}
                    ·{' '}
                    {b.over ? (
                      <span className="neg">
                        {t('over by {amount}', { amount: fmt(-b.remaining_minor, b.currency) })}
                      </span>
                    ) : (
                      <>{t('{amount} left', { amount: fmt(b.remaining_minor, b.currency) })}</>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
