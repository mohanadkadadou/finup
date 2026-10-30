import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api';
import { LogoMark, Wordmark } from '../components/Logo';
import { Alert } from '../components/ui';
import { LangSwitch, useT } from '../i18n';

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('token') ?? '';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="card grid">
        <h1>
          <LogoMark size={26} /> <Wordmark />
        </h1>
        {children}
        <LangSwitch />
      </div>
    </div>
  );
}

/** Opened from the emailed link. Works whether or not the user is signed in. */
export function ResetPage() {
  const { t } = useT();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== again) return setErr(t('The two passwords do not match.'));
    setBusy(true);
    setErr(null);
    try {
      await api.send('POST', '/auth/reset', { token: tokenFromUrl(), password });
      setDone(true);
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      {done ? (
        <>
          <Alert kind="ok">{t('Your password was changed. Sign in with the new one.')}</Alert>
          <a className="btn primary" href="/">
            {t('Sign in')}
          </a>
        </>
      ) : (
        <form className="grid" onSubmit={(e) => void submit(e)}>
          <h2>{t('Choose a new password')}</h2>
          {err && <Alert>{err}</Alert>}
          <label>
            {t('New password')} <span className="small">{t('(at least 10 characters)')}</span>
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            {t('Repeat the new password')}
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy} type="submit">
            {t('Change password')}
          </button>
        </form>
      )}
    </Shell>
  );
}

export function VerifyPage() {
  const { t } = useT();
  const [state, setState] = useState<'working' | 'ok' | string>('working');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .send('POST', '/auth/verify', { token: tokenFromUrl() })
      .then(() => setState('ok'))
      .catch((e) => setState(errMsg(e)));
  }, []);

  return (
    <Shell>
      {state === 'working' && <p className="muted">{t('Loading…')}</p>}
      {state === 'ok' && <Alert kind="ok">{t('Your email is confirmed. Thank you.')}</Alert>}
      {state !== 'working' && state !== 'ok' && <Alert>{state}</Alert>}
      <Link className="btn primary" to="/">
        {t('Open FinUp')}
      </Link>
    </Shell>
  );
}
