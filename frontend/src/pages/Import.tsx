import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiErr, api, errMsg } from '../api';
import { Alert, Badge, PageHeader } from '../components/ui';
import { tr } from '../serverText';
import { useT } from '../i18n';
import { fmt } from '../format';
import { CATEGORIES } from './Transactions';

type Cell = string | number | null;
interface Row {
  id: string;
  row_ref: number;
  raw: Cell[];
  booked_on: string | null;
  description: string;
  amount_minor: number | null;
  currency: string | null;
  category: string;
  status: 'ok' | 'flagged' | 'duplicate' | 'invalid';
  issues: string[];
  include: boolean;
  confirmed: boolean;
}
interface Counts {
  total: number;
  ok: number;
  flagged: number;
  flagged_unconfirmed: number;
  duplicate: number;
  invalid: number;
  included: number;
}
interface Mapping {
  headerRow: number;
  date: number | null;
  description: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  currency: number | null;
  type: number | null;
  defaultCurrency: string;
  decimalSeparator: 'auto' | 'comma' | 'dot';
  dateOrder?: 'dmy' | 'mdy';
}
interface Batch {
  id: string;
  filename: string;
  status: 'needs_mapping' | 'review';
  notes: string[];
  rows: Row[];
  counts: Counts | null;
  columns?: Cell[][];
  suggested_mapping?: Mapping;
  offset?: number;
  limit?: number;
}
interface Result {
  imported: number;
  skipped_duplicates: number;
  skipped_invalid: number;
  skipped_excluded: number;
  flagged_imported: number;
}

export function ImportPage() {
  const { t } = useT();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const reset = () => {
    setBatch(null);
    setResult(null);
  };
  return (
    <>
      <PageHeader
        title={t('Import a statement')}
        sub={t('PDF, CSV or XLSX. Nothing affects your dashboard until you confirm the rows.')}
      />
      {result ? (
        <Done r={result} onAgain={reset} />
      ) : !batch ? (
        <Upload onBatch={setBatch} />
      ) : batch.status === 'needs_mapping' ? (
        <MapColumns batch={batch} onBatch={setBatch} onCancel={reset} />
      ) : (
        <Review batch={batch} onDone={setResult} onCancel={reset} />
      )}
    </>
  );
}

function Upload({ onBatch }: { onBatch: (b: Batch) => void }) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [currency, setCurrency] = useState('TRY');
  const [name, setName] = useState('');
  const [err, setErr] = useState<ApiErr | Error | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.append('currency', currency);
    if (name.trim()) form.append('accountName', name.trim());
    form.append('file', file);
    try {
      onBatch(await api.upload<Batch>('/imports', form));
    } catch (x) {
      setErr(x instanceof Error ? x : new Error(t('Upload failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card grid" onSubmit={(e) => void submit(e)}>
      {err && (
        <Alert>
          {err.message}
          {err instanceof ApiErr && err.code === 'OCR_REQUIRED' && (
            <>
              {' '}
              {t(
                "You can usually download a CSV or XLSX version from your bank's online statement page.",
              )}
            </>
          )}
        </Alert>
      )}
      <div className="form">
        <label>
          {t('Statement file')}
          <input
            type="file"
            required
            accept=".pdf,.csv,.xlsx,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          {t('Account currency')}
          <input
            value={currency}
            maxLength={3}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            required
          />
        </label>
        <label>
          {t('Account name')} <span className="small">{t('(optional)')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('Imported statements')}
          />
        </label>
        <button className="primary" type="submit" disabled={!file || busy}>
          {busy ? t('Reading file…') : t('Upload and review')}
        </button>
      </div>
      <p className="muted small">
        {t(
          'Max 10 MB. Scanned (image-only) PDFs need OCR, which is not available yet. Text in the file is treated as data and never executed. Rows with a currency column keep their own currency; totals are never mixed across currencies.',
        )}
      </p>
    </form>
  );
}

function MapColumns({
  batch,
  onBatch,
  onCancel,
}: {
  batch: Batch;
  onBatch: (b: Batch) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const preview = batch.columns ?? [];
  const width = Math.max(1, ...preview.map((r) => r.length));
  const [m, setM] = useState<Mapping>({
    ...(batch.suggested_mapping as Mapping),
    defaultCurrency: 'TRY',
    decimalSeparator: 'auto',
  });
  const [amountMode, setAmountMode] = useState<'single' | 'split'>(
    m.debit !== null || m.credit !== null ? 'split' : 'single',
  );
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Mapping, v: unknown) => setM({ ...m, [k]: v });
  const colSel = (k: keyof Mapping, label: string) => (
    <label>
      {label}
      <select
        value={(m[k] as number | null) ?? ''}
        onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">{t('— none —')}</option>
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={i}>
            {t('Column {n}', { n: i + 1 })}
            {typeof preview[m.headerRow]?.[i] === 'string'
              ? ` (${String(preview[m.headerRow]?.[i])})`
              : ''}
          </option>
        ))}
      </select>
    </label>
  );
  const submit = async () => {
    try {
      const body = {
        ...m,
        amount: amountMode === 'single' ? m.amount : null,
        debit: amountMode === 'split' ? m.debit : null,
        credit: amountMode === 'split' ? m.credit : null,
      };
      onBatch(await api.send<Batch>('POST', `/imports/${batch.id}/mapping`, body));
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <div className="grid">
      <Alert kind="warn">
        {t('Finup could not recognise the columns in')} <strong>{batch.filename}</strong>.{' '}
        {t('Tell it which column is which.')}
      </Alert>
      {err && <Alert>{err}</Alert>}
      <div className="table-wrap">
        <table>
          <tbody>
            {preview.map((r, i) => (
              <tr key={i} className={i === m.headerRow ? 'flag' : ''}>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className="small">
                    {r[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card form">
        <label>
          {t('Header row')}
          <select value={m.headerRow} onChange={(e) => set('headerRow', Number(e.target.value))}>
            <option value={-1}>{t('No header row')}</option>
            {preview.map((_, i) => (
              <option key={i} value={i}>
                {t('Row {n}', { n: i + 1 })}
              </option>
            ))}
          </select>
        </label>
        {colSel('date', t('Date column'))}
        {colSel('description', t('Description column'))}
        <label>
          {t('Amounts are')}
          <select
            value={amountMode}
            onChange={(e) => setAmountMode(e.target.value as 'single' | 'split')}
          >
            <option value="single">{t('One column (signed, or with a Dr/Cr column)')}</option>
            <option value="split">{t('Separate debit and credit columns')}</option>
          </select>
        </label>
        {amountMode === 'single' ? (
          <>
            {colSel('amount', t('Amount column'))}
            {colSel('type', t('Debit/Credit indicator (optional)'))}
            {colSel('balance', t('Balance column (optional, helps infer direction)'))}
          </>
        ) : (
          <>
            {colSel('debit', t('Debit (money out)'))}
            {colSel('credit', t('Credit (money in)'))}
          </>
        )}
        {colSel('currency', t('Currency column (optional)'))}
        <label>
          {t('Default currency')}
          <input
            value={m.defaultCurrency}
            maxLength={3}
            onChange={(e) => set('defaultCurrency', e.target.value.toUpperCase())}
          />
        </label>
        <label>
          {t('Number format')}
          <select
            value={m.decimalSeparator}
            onChange={(e) => set('decimalSeparator', e.target.value)}
          >
            <option value="auto">{t('Detect automatically')}</option>
            <option value="comma">{t('1.234,56 (comma decimals)')}</option>
            <option value="dot">{t('1,234.56 (dot decimals)')}</option>
          </select>
        </label>
        <label>
          {t('Date order')}
          <select
            value={m.dateOrder ?? ''}
            onChange={(e) => set('dateOrder', e.target.value || undefined)}
          >
            <option value="">{t('Detect automatically')}</option>
            <option value="dmy">{t('Day / Month / Year')}</option>
            <option value="mdy">{t('Month / Day / Year')}</option>
          </select>
        </label>
      </div>
      <div className="row-flex">
        <button className="primary" onClick={() => void submit()}>
          {t('Apply mapping')}
        </button>
        <button onClick={onCancel}>{t('Cancel')}</button>
      </div>
    </div>
  );
}

function Review({
  batch,
  onDone,
  onCancel,
}: {
  batch: Batch;
  onDone: (r: Result) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<Row[]>(batch.rows);
  const [counts, setCounts] = useState<Counts>(batch.counts!);
  const [tab, setTab] = useState<'all' | 'flagged' | 'duplicate' | 'invalid'>('all');
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const limit = 100;

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ offset: String(offset), limit: String(limit) });
      if (tab !== 'all') qs.set('status', tab === 'flagged' ? 'flagged' : tab);
      const r = await api.get<{ rows: Row[]; counts: Counts }>(`/imports/${batch.id}?${qs}`);
      setRows(r.rows);
      setCounts(r.counts);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [batch.id, offset, tab]);
  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (row: Row, body: Record<string, unknown>) => {
    try {
      const r = await api.send<{ row: Row; counts: Counts }>(
        'PATCH',
        `/imports/${batch.id}/rows/${row.id}`,
        body,
      );
      setRows((rs) => rs.map((x) => (x.id === row.id ? r.row : x)));
      setCounts(r.counts);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const commit = async (confirmFlagged: boolean) => {
    try {
      onDone(await api.send<Result>('POST', `/imports/${batch.id}/commit`, { confirmFlagged }));
    } catch (e) {
      if (e instanceof ApiErr && e.code === 'UNRESOLVED_FLAGGED') setNeedsConfirm(true);
      else setErr(errMsg(e));
    }
  };
  const discard = async () => {
    if (window.confirm(t('Discard this import? Nothing will be saved.'))) {
      await api.send('DELETE', `/imports/${batch.id}`);
      onCancel();
    }
  };
  const confirmAll = async () => {
    await api.send('POST', `/imports/${batch.id}/confirm-flagged`);
    setNeedsConfirm(false);
    await load();
  };
  const tabs: [typeof tab, string, number][] = [
    ['all', t('All'), counts.total],
    ['flagged', t('Needs review'), counts.flagged],
    ['duplicate', t('Duplicates'), counts.duplicate],
    ['invalid', t('Invalid'), counts.invalid],
  ];

  return (
    <div className="grid">
      <div className="card">
        <div className="row-flex">
          <strong>{batch.filename}</strong>
          <Badge kind="ok">{t('{n} ready', { n: counts.ok })}</Badge>
          <Badge kind="warn">{t('{n} flagged', { n: counts.flagged })}</Badge>
          <Badge>{t('{n} duplicates', { n: counts.duplicate })}</Badge>
          <Badge kind="bad">{t('{n} invalid', { n: counts.invalid })}</Badge>
        </div>
        {batch.notes.map((n) => (
          <p key={n} className="muted small" style={{ marginTop: 8 }}>
            {tr(n)}
          </p>
        ))}
        <p className="muted small" style={{ marginTop: 8 }}>
          {t(
            'Invalid rows are never imported. Duplicates are skipped unless you include them. Change any value below; edited rows count as reviewed.',
          )}
        </p>
      </div>
      {err && <Alert>{err}</Alert>}
      {needsConfirm && (
        <Alert kind="warn">
          {t('{n} flagged row(s) have not been reviewed.', { n: counts.flagged_unconfirmed })}{' '}
          <button className="linkish" onClick={() => void confirmAll().then(() => commit(true))}>
            {t('Import them as they are')}
          </button>{' '}
          {t('or keep reviewing.')}
        </Alert>
      )}
      <div className="tabs" role="group" aria-label={t('Filter rows')}>
        {tabs.map(([k, label, n]) => (
          <button
            key={k}
            aria-pressed={tab === k}
            onClick={() => {
              setTab(k);
              setOffset(0);
            }}
          >
            {label} ({n})
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="review">
          <thead>
            <tr>
              <th>{t('Use')}</th>
              <th>{t('Date')}</th>
              <th>{t('Description')}</th>
              <th>{t('Direction')}</th>
              <th>{t('Amount')}</th>
              <th>{t('Cur.')}</th>
              <th>{t('Category')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={
                  r.status === 'invalid'
                    ? 'bad'
                    : r.status === 'flagged' && !r.confirmed
                      ? 'flag'
                      : !r.include
                        ? 'dim'
                        : ''
                }
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('Include row {n}', { n: r.row_ref })}
                    checked={r.include}
                    disabled={r.status === 'invalid'}
                    onChange={(e) => void patch(r, { include: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    aria-label={t('Date row {n}', { n: r.row_ref })}
                    defaultValue={r.booked_on ?? ''}
                    key={`${r.id}-${r.booked_on}`}
                    onBlur={(e) =>
                      e.target.value &&
                      e.target.value !== r.booked_on &&
                      void patch(r, { bookedOn: e.target.value })
                    }
                  />
                </td>
                <td className="desc">
                  <input
                    aria-label={t('Description row {n}', { n: r.row_ref })}
                    defaultValue={r.description}
                    key={`${r.id}-${r.description}`}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== r.description &&
                      void patch(r, { description: e.target.value })
                    }
                  />
                  {r.issues.map((i) => (
                    <div key={i} className="issues">
                      {tr(i)}
                    </div>
                  ))}
                  <div className="muted small">{t('source: row {n}', { n: r.row_ref })}</div>
                </td>
                <td>
                  <select
                    aria-label={t('Direction row {n}', { n: r.row_ref })}
                    value={r.amount_minor === null ? '' : r.amount_minor < 0 ? 'out' : 'in'}
                    onChange={(e) => e.target.value && void patch(r, { direction: e.target.value })}
                  >
                    {r.amount_minor === null && <option value="">?</option>}
                    <option value="out">{t('Money out')}</option>
                    <option value="in">{t('Money in')}</option>
                  </select>
                </td>
                <td>
                  <input
                    inputMode="decimal"
                    aria-label={t('Amount row {n}', { n: r.row_ref })}
                    defaultValue={
                      r.amount_minor === null
                        ? ''
                        : fmt(Math.abs(r.amount_minor), r.currency ?? 'TRY').replace(/,/g, '')
                    }
                    key={`${r.id}-${r.amount_minor}`}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      void patch(r, {
                        amount: e.target.value,
                        direction: r.amount_minor === null || r.amount_minor < 0 ? 'out' : 'in',
                      })
                    }
                  />
                </td>
                <td style={{ width: 70 }}>
                  <input
                    aria-label={t('Currency row {n}', { n: r.row_ref })}
                    defaultValue={r.currency ?? ''}
                    maxLength={3}
                    key={`${r.id}-${r.currency}`}
                    onBlur={(e) =>
                      e.target.value.length === 3 &&
                      e.target.value.toUpperCase() !== r.currency &&
                      void patch(r, { currency: e.target.value })
                    }
                  />
                </td>
                <td>
                  <select
                    aria-label={t('Category row {n}', { n: r.row_ref })}
                    value={r.category}
                    onChange={(e) => void patch(r, { category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(c)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <Badge
                    kind={
                      r.status === 'ok'
                        ? 'ok'
                        : r.status === 'flagged'
                          ? r.confirmed
                            ? 'info'
                            : 'warn'
                          : r.status === 'invalid'
                            ? 'bad'
                            : 'neutral'
                    }
                  >
                    {t(r.status === 'flagged' && r.confirmed ? 'reviewed' : r.status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tab === 'all' && counts.total > limit && (
        <div className="pager">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            {t('Previous')}
          </button>
          <span className="muted small">
            {t('Rows {from}–{to} of {total}', {
              from: offset + 1,
              to: Math.min(offset + limit, counts.total),
              total: counts.total,
            })}
          </span>
          <button
            disabled={offset + limit >= counts.total}
            onClick={() => setOffset(offset + limit)}
          >
            {t('Next')}
          </button>
        </div>
      )}
      <div className="row-flex">
        <button
          className="primary"
          disabled={counts.included === 0}
          onClick={() => void commit(false)}
        >
          {t('Confirm and import {n} row(s)', { n: counts.included })}
        </button>
        {counts.flagged_unconfirmed > 0 && (
          <button onClick={() => void confirmAll()}>
            {t('Mark {n} flagged as reviewed', { n: counts.flagged_unconfirmed })}
          </button>
        )}
        <button className="danger" onClick={() => void discard()}>
          {t('Discard import')}
        </button>
      </div>
    </div>
  );
}

function Done({ r, onAgain }: { r: Result; onAgain: () => void }) {
  const { t } = useT();
  return (
    <div className="card grid">
      <Alert kind="ok">
        <strong>{t('{n} transaction(s) imported.', { n: r.imported })}</strong>
      </Alert>
      <ul className="muted">
        <li>{t('{n} skipped as duplicates', { n: r.skipped_duplicates })}</li>
        <li>{t('{n} skipped as invalid', { n: r.skipped_invalid })}</li>
        <li>{t('{n} left out by you', { n: r.skipped_excluded })}</li>
        <li>{t('{n} flagged rows imported', { n: r.flagged_imported })}</li>
      </ul>
      <div className="row-flex">
        <Link className="btn primary" to="/">
          {t('View dashboard')}
        </Link>
        <button onClick={onAgain}>{t('Import another file')}</button>
      </div>
    </div>
  );
}
