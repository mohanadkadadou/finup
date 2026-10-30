import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiErr, api, errMsg } from '../api';
import { Alert, Badge, PageHeader } from '../components/ui';
import { tr } from '../serverText';
import { useT } from '../i18n';

interface Status {
  configured: boolean;
  provider: string | null;
  reason: string;
  alternatives: string[];
}
interface Account {
  id: string;
  name: string;
  institution: string;
  currency: string;
  source: string;
}

export function AccountsPage() {
  const { t } = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [f, setF] = useState({ name: '', institution: '', currency: 'TRY' });

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<Status>('/banks/status'));
      setAccounts((await api.get<{ accounts: Account[] }>('/accounts')).accounts);
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    try {
      await api.send('POST', '/banks/connect', {});
    } catch (e) {
      setMsg({ kind: e instanceof ApiErr && e.status === 409 ? 'info' : 'error', text: errMsg(e) });
    }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.send('POST', '/accounts', f);
      setF({ ...f, name: '', institution: '' });
      await load();
    } catch (x) {
      setMsg({ kind: 'error', text: errMsg(x) });
    }
  };

  return (
    <>
      <PageHeader
        title={t('Connected accounts')}
        sub={t('Live bank sync and statement-based accounts')}
      />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <section className="card">
        <div className="cat-row">
          <h2>{t('Bank connection (Open Banking)')}</h2>
          {status && (
            <Badge kind={status.configured ? 'ok' : 'warn'}>
              {status.configured ? t('Configured') : t('Not configured')}
            </Badge>
          )}
        </div>
        <p>{status ? tr(status.reason) : null}</p>
        <p className="muted small">
          {t(
            'There is no universal bank API. Live sync needs an approved provider that covers your country and bank, plus credentials. Finup never scrapes bank sites or asks for bank passwords.',
          )}
        </p>
        <div className="row-flex">
          <button onClick={() => void connect()}>{t('Connect a bank')}</button>
          <Link className="btn primary" to="/import">
            {t('Upload a statement instead')}
          </Link>
        </div>
      </section>
      <section className="card mt">
        <h2>{t('Statement accounts')}</h2>
        {accounts.length === 0 ? (
          <p className="muted">
            {t('No accounts yet. One is created automatically on your first import.')}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Institution')}</th>
                  <th>{t('Currency')}</th>
                  <th>{t('Source')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.institution || '—'}</td>
                    <td>{a.currency}</td>
                    <td>
                      <Badge kind={a.source === 'demo' ? 'warn' : 'neutral'}>{t(a.source)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form className="form mt" onSubmit={(e) => void add(e)}>
          <label>
            {t('Account name')}
            <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <label>
            {t('Institution')}
            <input
              value={f.institution}
              onChange={(e) => setF({ ...f, institution: e.target.value })}
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
          <button type="submit">{t('Add statement account')}</button>
        </form>
      </section>
    </>
  );
}
