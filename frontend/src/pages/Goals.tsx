import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errMsg } from '../api';
import { Alert, Badge, Empty, PageHeader } from '../components/ui';
import { fmt, toMinor } from '../format';
import { tr } from '../serverText';
import { useT } from '../i18n';

interface Plan {
  remaining_minor: number;
  periods: number;
  monthly_required_minor: number;
  state: 'achieved' | 'on_schedule' | 'expired';
  affordability: 'no_data' | 'comfortable' | 'tight' | 'exceeds_cash_flow';
  estimated_monthly_net_minor: number | null;
  assumptions: string[];
}
interface Goal {
  id: string;
  name: string;
  target_minor: number;
  current_minor: number;
  currency: string;
  deadline: string;
  plan: Plan;
}

const AFFORD: Record<Plan['affordability'], [string, 'ok' | 'warn' | 'bad' | 'neutral']> = {
  comfortable: ['Looks comfortable (estimate)', 'ok'],
  tight: ['Tight (estimate)', 'warn'],
  exceeds_cash_flow: ['Exceeds estimated cash flow', 'bad'],
  no_data: ['No cash-flow data to compare', 'neutral'],
};

export function GoalsPage() {
  const { t } = useT();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', target: '', current: '0', currency: 'TRY', deadline: '' });
  const load = useCallback(async () => {
    try {
      setGoals((await api.get<{ goals: Goal[] }>('/goals')).goals);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const target = toMinor(f.target, f.currency);
    const current = toMinor(f.current || '0', f.currency);
    if (!target || target <= 0) return setErr(t('Enter a target amount greater than zero.'));
    if (current === null) return setErr(t('Current savings must be a valid amount.'));
    try {
      await api.send('POST', '/goals', {
        name: f.name,
        target_minor: target,
        current_minor: current,
        currency: f.currency,
        deadline: f.deadline,
      });
      setErr(null);
      setF({ ...f, name: '', target: '', current: '0' });
      await load();
    } catch (x) {
      setErr(errMsg(x));
    }
  };
  const updateSaved = async (g: Goal) => {
    const v = window.prompt(
      t('Current savings for "{name}" ({currency})', { name: g.name, currency: g.currency }),
      fmt(g.current_minor, g.currency).replace(/,/g, ''),
    );
    if (v === null) return;
    const minor = toMinor(v, g.currency);
    if (minor === null) return setErr(t('That is not a valid amount.'));
    try {
      await api.send('PATCH', `/goals/${g.id}`, { current_minor: minor });
      await load();
    } catch (x) {
      setErr(errMsg(x));
    }
  };
  const remove = async (g: Goal) => {
    if (window.confirm(t('Delete goal "{name}"?', { name: g.name }))) {
      await api.send('DELETE', `/goals/${g.id}`);
      await load();
    }
  };

  return (
    <>
      <PageHeader
        title={t('Savings goals')}
        sub={t(
          'Monthly amount = remaining ÷ months left, rounded up. Affordability is an estimate from your past cash flow.',
        )}
      />
      {err && <Alert>{err}</Alert>}
      <form className="card form" onSubmit={(e) => void create(e)}>
        <label>
          {t('Goal')}
          <input
            required
            maxLength={100}
            placeholder={t('Buy a camera')}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </label>
        <label>
          {t('Target amount')}
          <input
            required
            inputMode="decimal"
            placeholder="60000"
            value={f.target}
            onChange={(e) => setF({ ...f, target: e.target.value })}
          />
        </label>
        <label>
          {t('Saved so far')}
          <input
            inputMode="decimal"
            value={f.current}
            onChange={(e) => setF({ ...f, current: e.target.value })}
          />
        </label>
        <label>
          {t('Currency')}
          <input
            required
            maxLength={3}
            value={f.currency}
            onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })}
          />
        </label>
        <label>
          {t('Deadline')}
          <input
            required
            type="date"
            value={f.deadline}
            onChange={(e) => setF({ ...f, deadline: e.target.value })}
          />
        </label>
        <button className="primary" type="submit">
          {t('Create goal')}
        </button>
      </form>
      <div className="mt">
        {goals.length === 0 ? (
          <Empty title={t('No goals yet')}>
            <p>{t('Try “Buy a camera”, 60,000 TRY, due in 12 months.')}</p>
          </Empty>
        ) : (
          <div className="grid g2">
            {goals.map((g) => {
              const [label, kind] = AFFORD[g.plan.affordability];
              return (
                <section key={g.id} className="card">
                  <div className="cat-row">
                    <h3>{g.name}</h3>
                    <Badge
                      kind={
                        g.plan.state === 'achieved'
                          ? 'ok'
                          : g.plan.state === 'expired'
                            ? 'bad'
                            : 'neutral'
                      }
                    >
                      {t(g.plan.state.replace('_', ' '))}
                    </Badge>
                  </div>
                  <p className="muted small">
                    {t('Target {target} {currency} by {deadline} · saved {saved}', {
                      target: fmt(g.target_minor, g.currency),
                      currency: g.currency,
                      deadline: g.deadline,
                      saved: fmt(g.current_minor, g.currency),
                    })}
                  </p>
                  <div className="stat-value num">
                    {fmt(g.plan.monthly_required_minor, g.currency)}{' '}
                    <span className="small muted">
                      {g.currency} {t('/ month')}
                    </span>
                  </div>
                  <p className="small">
                    {g.plan.state === 'achieved'
                      ? t('Goal reached.')
                      : t('{amount} remaining over {n} month(s).', {
                          amount: fmt(g.plan.remaining_minor, g.currency),
                          n: g.plan.periods,
                        })}
                  </p>
                  <Badge kind={kind}>{t(label)}</Badge>
                  {g.plan.estimated_monthly_net_minor !== null && (
                    <p className="small muted" style={{ marginTop: 8 }}>
                      {t('Estimated monthly net cash flow:')}{' '}
                      {fmt(g.plan.estimated_monthly_net_minor, g.currency)} {g.currency}
                    </p>
                  )}
                  <details>
                    <summary>{t('How this is calculated')}</summary>
                    <ul>
                      {g.plan.assumptions.map((a) => (
                        <li key={a}>{tr(a)}</li>
                      ))}
                    </ul>
                  </details>
                  <div className="row-flex mt">
                    <button onClick={() => void updateSaved(g)}>{t('Update savings')}</button>
                    <button className="danger" onClick={() => void remove(g)}>
                      {t('Delete')}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
