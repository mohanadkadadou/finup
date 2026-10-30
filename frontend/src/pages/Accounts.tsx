import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errMsg } from '../api';
import { Alert, Badge, PageHeader } from '../components/ui';
import { tr } from '../serverText';
import { useT } from '../i18n';

interface Status {
  configured: boolean;
  provider: string | null;
  reason: string;
  alternatives: string[];
}
type Kind = 'state' | 'private' | 'participation' | 'digital';
interface Institution {
  id: string;
  name: string;
  kind: Kind;
  live: boolean;
}
const KINDS: Kind[] = ['state', 'private', 'participation', 'digital'];
const KIND_LABEL: Record<Kind, string> = {
  state: 'State banks',
  private: 'Private banks',
  participation: 'Participation banks',
  digital: 'Digital banks',
};

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
  const nav = useNavigate();
  const [banks, setBanks] = useState<Institution[]>([]);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [chosen, setChosen] = useState<Institution | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<Status>('/banks/status'));
      setBanks(
        (await api.get<{ institutions: Institution[] }>('/banks/institutions')).institutions,
      );
      setAccounts((await api.get<{ accounts: Account[] }>('/accounts')).accounts);
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  /** Live sync is unavailable, so choosing a bank opens a statement account for it and goes to Import. */
  const openStatementAccount = async (bank: Institution) => {
    try {
      const exists = accounts.some((a) => a.institution === bank.name && a.currency === 'TRY');
      if (!exists)
        await api.send('POST', '/accounts', {
          name: `${bank.name} TRY`,
          institution: bank.name,
          currency: 'TRY',
        });
      nav('/import');
    } catch (x) {
      setMsg({ kind: 'error', text: errMsg(x) });
    }
  };
  const shown = banks.filter(
    (b) =>
      (kind === 'all' || b.kind === kind) && b.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
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
          <button className="primary" onClick={() => setPicker((v) => !v)}>
            {t('Connect a bank')}
          </button>
          <Link className="btn" to="/import">
            {t('Upload a statement instead')}
          </Link>
        </div>
      </section>
      {picker && (
        <section className="card mt bank-picker">
          <div className="row-between">
            <h2>{t('Choose your bank in Türkiye')}</h2>
            <span className="muted small">{t('{n} banks', { n: shown.length })}</span>
          </div>
          <input
            type="search"
            placeholder={t('Search for a bank')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('Search for a bank')}
          />
          <div className="seg" role="group" aria-label={t('Bank type')}>
            <button
              type="button"
              className={kind === 'all' ? 'on' : ''}
              onClick={() => setKind('all')}
            >
              {t('All')}
            </button>
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={kind === k ? 'on' : ''}
                onClick={() => setKind(k)}
              >
                {t(KIND_LABEL[k])}
              </button>
            ))}
          </div>
          <ul className="bank-grid">
            {shown.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={`bank-tile${chosen?.id === b.id ? ' on' : ''}`}
                  onClick={() => setChosen(b)}
                >
                  <span className="bank-ico" aria-hidden="true">
                    {b.name.charAt(0)}
                  </span>
                  <span className="bank-name">{b.name}</span>
                  <span className="muted small">{t(KIND_LABEL[b.kind])}</span>
                </button>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="muted">{t('No bank matches your search.')}</p>}
          {chosen && (
            <div className="bank-detail">
              <h3>{chosen.name}</h3>
              <p>
                <Badge kind="warn">{t('Live sync not available yet')}</Badge>
              </p>
              <p className="muted small">
                {t(
                  'Automatic sync with Turkish banks needs a licensed account-information provider, which is not connected. You can still add {bank} transactions by uploading its statement (PDF, CSV or XLSX).',
                  { bank: chosen.name },
                )}
              </p>
              <div className="row-flex">
                <button className="primary" onClick={() => void openStatementAccount(chosen)}>
                  {t('Use {bank} statements', { bank: chosen.name })}
                </button>
                <button onClick={() => setChosen(null)}>{t('Cancel')}</button>
              </div>
            </div>
          )}
        </section>
      )}
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
              list="tr-banks"
              value={f.institution}
              onChange={(e) => setF({ ...f, institution: e.target.value })}
            />
            <datalist id="tr-banks">
              {banks.map((b) => (
                <option key={b.id} value={b.name} />
              ))}
            </datalist>
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
