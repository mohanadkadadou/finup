import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../api';
import { Alert, Badge, Empty, Money, PageHeader } from '../components/ui';
import { useT } from '../i18n';

export const CATEGORIES = [
  'Groceries',
  'Dining',
  'Transport',
  'Housing',
  'Utilities',
  'Subscriptions',
  'Shopping',
  'Health',
  'Entertainment',
  'Travel',
  'Education',
  'Fees',
  'Transfers',
  'Salary',
  'Income',
  'Uncategorized',
];

interface Tx {
  id: string;
  booked_on: string;
  description: string;
  amount_minor: number;
  currency: string;
  category: string;
  is_demo: boolean;
  account_name: string;
}

export function TransactionsPage() {
  const { t } = useT();
  const [rows, setRows] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const pageSize = 25;

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) qs.set('q', q.trim());
      if (category) qs.set('category', category);
      const r = await api.get<{ transactions: Tx[]; total: number }>(`/transactions?${qs}`);
      setRows(r.transactions);
      setTotal(r.total);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [page, q, category]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const setCat = async (id: string, cat: string) => {
    try {
      await api.send('PATCH', `/transactions/${id}`, { category: cat });
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm(t('Delete this transaction? This changes your totals.'))) return;
    try {
      await api.send('DELETE', `/transactions/${id}`);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader title={t('Transactions')} sub={t('{n} confirmed transaction(s)', { n: total })}>
        <input
          aria-label={t('Search descriptions')}
          placeholder={t('Search description…')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label={t('Filter by category')}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t('All categories')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(c)}
            </option>
          ))}
        </select>
      </PageHeader>
      {err && <Alert>{err}</Alert>}
      {rows.length === 0 && !err ? (
        <Empty title={t('Nothing to show')}>
          <p>{t('No transactions match. Import a statement to add some.')}</p>
        </Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Description')}</th>
                  <th>{t('Category')}</th>
                  <th className="right">{t('Amount')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => (
                  <tr key={tx.id}>
                    <td className="num">{tx.booked_on}</td>
                    <td className="desc">
                      {tx.description} {tx.is_demo && <Badge kind="warn">{t('demo')}</Badge>}
                      <div className="muted small">{tx.account_name}</div>
                    </td>
                    <td>
                      <select
                        aria-label={t('Category for {name}', { name: tx.description })}
                        value={tx.category}
                        onChange={(e) => void setCat(tx.id, e.target.value)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {t(c)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="right">
                      <Money minor={tx.amount_minor} currency={tx.currency} signed />{' '}
                      <span className="muted small">{tx.currency}</span>
                    </td>
                    <td className="right">
                      <button
                        className="danger"
                        onClick={() => void remove(tx.id)}
                        aria-label={t('Delete {name}', { name: tx.description })}
                      >
                        {t('Delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('Previous')}
            </button>
            <span className="muted small">{t('Page {page} of {pages}', { page, pages })}</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {t('Next')}
            </button>
          </div>
        </>
      )}
    </>
  );
}
