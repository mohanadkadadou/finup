import { useState, type FormEvent } from 'react';
import { api, errMsg } from '../api';
import { LogoMark, Wordmark } from '../components/Logo';
import { Alert } from '../components/ui';
import { LangSwitch, useT } from '../i18n';

export function AuthPage({ onDone, error }: { onDone: () => Promise<void>; error: string | null }) {
  const { t } = useT();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(error);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'forgot') {
        const r = await api.send<{ dev_link?: string }>('POST', '/auth/forgot', { email });
        setSent({ devLink: r.dev_link });
      } else {
        await api.send('POST', `/auth/${mode}`, { email, password });
        await onDone();
      }
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card grid" onSubmit={(e) => void submit(e)}>
        <div>
          <h1>
            <LogoMark size={26} /> <Wordmark />
          </h1>
          <p className="muted">{t('Smarter money, Brighter tomorrow')}</p>
        </div>
        {err && <Alert>{err}</Alert>}
        <label>
          {t('Email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== 'forgot' && (
          <label>
            {t('Password')}{' '}
            {mode === 'register' && <span className="small">{t('(at least 10 characters)')}</span>}
            <input
              type="password"
              required
              minLength={mode === 'register' ? 10 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {sent && (
          <Alert kind="ok">
            {t('If an account exists for this email, we sent a link to reset the password.')}
            {sent.devLink && (
              <>
                {' '}
                <a href={sent.devLink}>{t('Development mode: open the reset link')}</a>
              </>
            )}
          </Alert>
        )}
        <button className="primary" disabled={busy} type="submit">
          {mode === 'login'
            ? t('Sign in')
            : mode === 'register'
              ? t('Create account')
              : t('Send reset link')}
        </button>
        {mode === 'login' && (
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setMode('forgot');
              setErr(null);
              setSent(null);
            }}
          >
            {t('Forgot your password?')}
          </button>
        )}
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setMode(mode === 'register' ? 'login' : mode === 'forgot' ? 'login' : 'register');
            setErr(null);
            setSent(null);
          }}
        >
          {mode === 'login'
            ? t('New here? Create an account')
            : mode === 'forgot'
              ? t('Back to sign in')
              : t('Have an account? Sign in')}
        </button>
        <p className="muted small">
          {t('Finup never asks for your bank password. You upload statements you already have.')}
        </p>
        <LangSwitch />
      </form>
    </div>
  );
}
