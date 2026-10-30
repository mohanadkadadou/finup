import { useState, type FormEvent } from 'react';
import type { Ctx } from '../App';
import { api, errMsg } from '../api';
import { Alert, Badge, PageHeader } from '../components/ui';
import { LangSwitch, useT } from '../i18n';

export function SettingsPage({ ctx }: { ctx: Ctx }) {
  const { t } = useT();
  const [confirm, setConfirm] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [devLink, setDevLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const demo = async (load: boolean) => {
    try {
      await api.send(load ? 'POST' : 'DELETE', '/demo');
      await ctx.refreshMe();
      setMsg({ kind: 'ok', text: load ? t('Demo data loaded.') : t('Demo data cleared.') });
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  };
  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.again)
      return setMsg({ kind: 'error', text: t('The two passwords do not match.') });
    try {
      await api.send('POST', '/auth/change-password', { current: pw.current, password: pw.next });
      setPw({ current: '', next: '', again: '' });
      setMsg({ kind: 'ok', text: t('Password changed. Other devices were signed out.') });
    } catch (x) {
      setMsg({ kind: 'error', text: errMsg(x) });
    }
  };
  const resend = async () => {
    try {
      const r = await api.send<{ already_verified?: boolean; dev_link?: string }>(
        'POST',
        '/auth/verify/request',
      );
      if (r.already_verified) await ctx.refreshMe();
      setDevLink(r.dev_link ?? null);
      setMsg({ kind: 'ok', text: t('Verification email sent.') });
    } catch (x) {
      setMsg({ kind: 'error', text: errMsg(x) });
    }
  };
  const del = async () => {
    if (!window.confirm(t('This permanently deletes your account and all data. Continue?'))) return;
    try {
      await api.send('POST', '/delete-account', { confirmEmail: confirm });
      await ctx.refreshMe();
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  };

  return (
    <>
      <PageHeader title={t('Settings & privacy')} sub={ctx.me.user.email} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid g2">
        <section className="card">
          <h2>{t('Language')}</h2>
          <LangSwitch className="lang-switch wide" />
        </section>
        <section className="card">
          <h2>{t('Email')}</h2>
          <p>
            {ctx.me.user.email}{' '}
            <Badge kind={ctx.me.user.email_verified ? 'ok' : 'warn'}>
              {ctx.me.user.email_verified ? t('Verified') : t('Not verified')}
            </Badge>
          </p>
          {!ctx.me.user.email_verified && (
            <>
              <p className="muted small">
                {t('Verifying lets you recover your account if you forget the password.')}
              </p>
              <button onClick={() => void resend()}>{t('Send verification email')}</button>
              {devLink && (
                <p className="small">
                  <a href={devLink}>{t('Development mode: open the verification link')}</a>
                </p>
              )}
            </>
          )}
        </section>
        <section className="card">
          <h2>{t('Change password')}</h2>
          <form className="grid" onSubmit={(e) => void changePassword(e)}>
            <label>
              {t('Current password')}
              <input
                type="password"
                required
                autoComplete="current-password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
              />
            </label>
            <label>
              {t('New password')} <span className="small">{t('(at least 10 characters)')}</span>
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </label>
            <label>
              {t('Repeat the new password')}
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={pw.again}
                onChange={(e) => setPw({ ...pw, again: e.target.value })}
              />
            </label>
            <button type="submit">{t('Change password')}</button>
          </form>
        </section>
        <section className="card">
          <h2>{t('Your data')}</h2>
          <p className="muted">
            {t(
              'Download everything Finup stores about you as JSON. Amounts are integer minor units (kuruş/cents).',
            )}
          </p>
          <a className="btn" href="/api/export" download>
            {t('Export my data')}
          </a>
        </section>
        <section className="card">
          <h2>{t('Demo data')}</h2>
          <p className="muted">
            {t(
              'Fictional sample transactions to explore the app. They are always labelled “demo”.',
            )}
          </p>
          <div className="row-flex">
            <button onClick={() => void demo(true)} disabled={ctx.me.has_demo_data}>
              {t('Load demo data')}
            </button>
            <button onClick={() => void demo(false)} disabled={!ctx.me.has_demo_data}>
              {t('Clear demo data')}
            </button>
          </div>
        </section>
        <section className="card">
          <h2>{t('Privacy')}</h2>
          <ul className="muted small">
            <li>{t('Statement text is stored as data only; it is never executed.')}</li>
            <li>
              {t(
                'The assistant receives aggregated summaries of your own data, not whole statements. Without an AI key it sends nothing anywhere.',
              )}
            </li>
            <li>
              {t('Bank tokens (when a provider exists) stay server-side and can be revoked.')}
            </li>
          </ul>
        </section>
        <section className="card">
          <h2>{t('Session')}</h2>
          <button onClick={() => void ctx.signOut()}>{t('Sign out')}</button>
        </section>
      </div>
      <section className="card mt-lg">
        <h2>{t('Delete account')}</h2>
        <p className="muted">
          {t(
            'Removes your account, accounts, transactions, goals, budgets and imports. This cannot be undone.',
          )}
        </p>
        <div className="row-flex">
          <input
            aria-label={t('Type your email to confirm')}
            placeholder={ctx.me.user.email}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button className="danger" disabled={!confirm} onClick={() => void del()}>
            {t('Delete everything')}
          </button>
        </div>
      </section>
    </>
  );
}
