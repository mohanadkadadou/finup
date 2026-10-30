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
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'forgot') {
        const r = await api.send<{ dev_link?: string }>('POST', '/auth/forgot', { email });
        setSent({ devLink: r.dev_link });
      } else if (challenge) {
        await api.send('POST', '/auth/login/verify', { challenge_id: challenge, code });
        await onDone();
      } else {
        const r = await api.send<{ step?: string; challenge_id?: string }>(
          'POST',
          `/auth/${mode}`,
          { email, password },
        );
        if (r?.step === 'code' && r.challenge_id) {
          setChallenge(r.challenge_id);
          setCode('');
        } else await onDone();
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
        {challenge && (
          <>
            <Alert kind="ok">
              {t('We emailed you a 6-digit sign-in code. It is valid for 10 minutes.')}
            </Alert>
            <label>
              {t('Sign-in code')}
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
          </>
        )}
        <label hidden={Boolean(challenge)}>
          {t('Email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== 'forgot' && !challenge && (
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
