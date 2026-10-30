import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ApiErr, api, errMsg } from './api';
import { Icon } from './components/Icon';
import { LogoMark, Wordmark } from './components/Logo';
import { LangSwitch, useT } from './i18n';
import { AccountsPage } from './pages/Accounts';
import { ResetPage, VerifyPage } from './pages/AccountLinks';
import { AnalyticsPage } from './pages/Analytics';
import { AssistantPage } from './pages/Assistant';
import { AuthPage } from './pages/Auth';
import { BudgetsPage } from './pages/Budgets';
import { DashboardPage } from './pages/Dashboard';
import { GoalsPage } from './pages/Goals';
import { ImportPage } from './pages/Import';
import { InsightsPage } from './pages/Insights';
import { PlannerPage } from './pages/Planner';
import { SettingsPage } from './pages/Settings';
import { TransactionsPage } from './pages/Transactions';

export interface Me {
  user: { id: string; email: string; email_verified: boolean };
  has_demo_data: boolean;
}
export interface Ctx {
  me: Me;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const NAV: [string, string, string][] = [
  ['/', 'Dashboard', 'home'],
  ['/transactions', 'Transactions', 'list'],
  ['/import', 'Import', 'upload'],
  ['/insights', 'Insights', 'insights'],
  ['/analytics', 'Analytics', 'analytics'],
  ['/planner', 'Purchase planner', 'planner'],
  ['/budgets', 'Budgets', 'budgets'],
  ['/goals', 'Savings goals', 'goals'],
  ['/assistant', 'Assistant', 'assistant'],
  ['/accounts', 'Connected accounts', 'accounts'],
  ['/settings', 'Settings & privacy', 'settings'],
];

const TABS: [string, string, string][] = [
  ['/', 'Home', 'home'],
  ['/insights', 'Insights', 'insights'],
  ['/import', 'Import', 'upload'],
  ['/transactions', 'Transactions', 'list'],
  ['/more', 'More', 'menu'],
];

function MorePage({ ctx }: { ctx: Ctx }) {
  const { t } = useT();
  return (
    <>
      <header className="page-head">
        <h1>{t('More')}</h1>
      </header>
      <div className="card more-list">
        {NAV.filter(([to]) => !TABS.some(([x]) => x === to)).map(([to, label, icon]) => (
          <NavLink key={to} to={to}>
            <Icon name={icon} size={20} />
            <span>{t(label)}</span>
          </NavLink>
        ))}
        <LangSwitch className="lang-switch wide" />
        <button onClick={() => void ctx.signOut()}>{t('Sign out')}</button>
      </div>
      <p className="muted small">{ctx.me.user.email}</p>
    </>
  );
}

export function App() {
  const { t } = useT();
  const location = useLocation();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [bootError, setBootError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/auth/me'));
      setBootError(null);
    } catch (e) {
      if (e instanceof ApiErr && e.status === 401) setMe(null);
      else {
        setBootError(errMsg(e));
        setMe(null);
      }
    }
  }, []);
  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const signOut = async () => {
    await api.send('POST', '/auth/logout');
    setMe(null);
  };

  if (location.pathname === '/reset') return <ResetPage />;
  if (location.pathname === '/verify') return <VerifyPage />;
  if (me === undefined)
    return (
      <div className="auth">
        <p style={{ color: '#fff' }}>{t('Loading…')}</p>
      </div>
    );
  if (me === null) return <AuthPage onDone={refreshMe} error={bootError} />;
  const ctx: Ctx = { me, refreshMe, signOut };

  const clearDemo = async () => {
    await api.send('DELETE', '/demo');
    await refreshMe();
  };

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand">
          <LogoMark />
          <Wordmark />
        </div>
        <div className="brand-tag">
          {t('Smarter money')}
          <br />
          {t('Brighter tomorrow')}
        </div>
        {NAV.map(([to, label, icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <Icon name={icon} size={18} />
            <span>{t(label)}</span>
          </NavLink>
        ))}
        <div className="spacer" />
        <LangSwitch className="lang-switch side-lang" />
        <div className="who">{me.user.email}</div>
      </nav>
      <nav className="tabbar" aria-label={t('Main')}>
        {TABS.map(([to, label, icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <Icon name={icon} />
            <span>{t(label)}</span>
          </NavLink>
        ))}
      </nav>
      <main>
        {me.has_demo_data && (
          <div className="banner" role="status">
            <span>
              <strong>{t('Demo data.')}</strong>{' '}
              {t('You are looking at fictional sample transactions, not real bank data.')}
            </span>
            <button onClick={() => void clearDemo()}>{t('Clear demo data')}</button>
          </div>
        )}
        <div className="page" key={location.pathname}>
          <Routes>
            <Route path="/" element={<DashboardPage ctx={ctx} />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/planner" element={<PlannerPage />} />
            <Route path="/more" element={<MorePage ctx={ctx} />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/settings" element={<SettingsPage ctx={ctx} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
