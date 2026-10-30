import { useEffect, useState, type FormEvent } from 'react';
import { api, errMsg } from '../api';
import { Alert, Badge, PageHeader } from '../components/ui';
import { tr } from '../serverText';
import { useT } from '../i18n';

interface Reply {
  mode: 'llm' | 'fallback';
  answer: string;
  note: string | null;
  evidence: { label: string; value: string; period: string; currency: string; basis: string }[];
}
const SUGGESTIONS = [
  'Where did my money go last month?',
  'Which subscriptions repeat every month?',
  'Can I afford my savings goal?',
];

export function AssistantPage() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  useEffect(() => {
    api
      .get<{ configured: boolean }>('/assistant/status')
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    setErr(null);
    setAsked(question);
    try {
      setReply(await api.send<Reply>('POST', '/assistant', { question }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(q);
  };

  return (
    <>
      <PageHeader
        title={t('Assistant')}
        sub={t(
          'Answers come from your own confirmed transactions. Numbers are computed by Finup, never by the AI.',
        )}
      >
        {status && (
          <Badge kind={status.configured ? 'info' : 'neutral'}>
            {status.configured
              ? t('AI key set (unverified)')
              : t('AI not configured: rules-based answers')}
          </Badge>
        )}
      </PageHeader>
      <form className="card grid" onSubmit={submit}>
        <label>
          {t('Ask about your money')}
          <input
            value={q}
            maxLength={500}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Where did my money go last month?')}
          />
        </label>
        <div className="row-flex">
          <button className="primary" type="submit" disabled={busy || !q.trim()}>
            {busy ? t('Thinking…') : t('Ask')}
          </button>
          {SUGGESTIONS.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => {
                setQ(t(s));
                void ask(t(s));
              }}
            >
              {t(s)}
            </button>
          ))}
        </div>
      </form>
      {err && (
        <div className="mt">
          <Alert>{err}</Alert>
        </div>
      )}
      {reply && (
        <section className="card mt" aria-live="polite">
          <p className="muted small">{t('You asked: {q}', { q: asked })}</p>
          <p className="chat-answer">{tr(reply.answer)}</p>
          <div className="row-flex">
            <Badge kind={reply.mode === 'llm' ? 'info' : 'neutral'}>
              {reply.mode === 'llm'
                ? t('AI-written, figures checked against your data')
                : t('Rules-based answer')}
            </Badge>
          </div>
          {reply.note && <p className="muted small mt">{tr(reply.note)}</p>}
          {reply.evidence.length > 0 && (
            <details open>
              <summary>{t('Evidence')}</summary>
              <div className="table-wrap mt">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Item')}</th>
                      <th className="right">{t('Value')}</th>
                      <th>{t('Period')}</th>
                      <th>{t('Basis')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reply.evidence.map((e, i) => (
                      <tr key={i}>
                        <td>{tr(t(e.label))}</td>
                        <td className="right num">
                          {e.value} {e.currency}
                        </td>
                        <td className="small">{e.period.replace(' to ', ' – ')}</td>
                        <td>
                          <Badge kind={e.basis === 'estimated' ? 'warn' : 'ok'}>{t(e.basis)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>
      )}
      <p className="muted small mt">
        {t(
          'The assistant only reads your data. It cannot make payments, transfers or change bank settings.',
        )}
      </p>
    </>
  );
}
