import { createHash } from 'node:crypto';
import { categorize, normalizeDescription } from '../categorize.js';
import { inferDateOrder, parseDate, type DateOrder } from '../dates.js';
import { detectCurrency, parseAmount, type DecimalSeparator } from '../money.js';
import type { Cell, Grid } from './readers.js';

export interface Mapping {
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
  decimalSeparator: DecimalSeparator;
  dateOrder?: DateOrder;
}

export type RowStatus = 'ok' | 'flagged' | 'duplicate' | 'invalid';

export interface StagedRowDraft {
  rowRef: number;
  raw: Cell[];
  bookedOn: string | null;
  description: string;
  amountMinor: number | null;
  currency: string | null;
  category: string;
  status: RowStatus;
  issues: string[];
  include: boolean;
  dedupeKey: string | null;
}

const HEADERS: [
  keyof Omit<Mapping, 'headerRow' | 'defaultCurrency' | 'decimalSeparator' | 'dateOrder'>,
  RegExp,
][] = [
  ['date', /(^|\b)(date|tarih|booking|posted|value date|تاريخ)/i],
  ['balance', /(balance|bakiye|الرصيد)/i],
  ['debit', /(debit|borç|borc|withdraw|paid out|money out|çıkış|cikis|مدين)/i],
  ['credit', /(credit|alacak|deposit|paid in|money in|giriş|giris|دائن)/i],
  ['amount', /(amount|tutar|المبلغ|^value$)/i],
  ['currency', /^(currency|ccy|para birimi|döviz|doviz|العملة)$/i],
  ['type', /^(type|dr\/cr|cr\/dr|borç\/alacak|direction|işlem tipi|islem tipi)$/i],
  [
    'description',
    /(description|açıklama|aciklama|details|narrative|memo|payee|merchant|reference|işlem|islem|الوصف|البيان)/i,
  ],
];

export interface MappingGuess {
  mapping: Mapping | null;
  partial: Partial<Mapping> & { headerRow: number };
  complete: boolean;
}

export function guessMapping(grid: Grid, defaultCurrency: string): MappingGuess {
  let best = { score: 0, row: -1 };
  const limit = Math.min(grid.length, 40);
  for (let r = 0; r < limit; r++) {
    const score = (grid[r] ?? []).filter(
      (c) => typeof c === 'string' && HEADERS.some(([, re]) => re.test(c)),
    ).length;
    if (score > best.score) best = { score, row: r };
  }
  const headerRow = best.score >= 2 ? best.row : -1;
  const partial: Mapping = {
    headerRow,
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    balance: null,
    currency: null,
    type: null,
    defaultCurrency,
    decimalSeparator: 'auto',
  };
  if (best.score >= 2) {
    const used = new Set<number>();
    for (const [field, re] of HEADERS) {
      const idx = (grid[headerRow] ?? []).findIndex(
        (c, i) => !used.has(i) && typeof c === 'string' && re.test(c),
      );
      if (idx >= 0) {
        (partial[field] as number | null) = idx;
        used.add(idx);
      }
    }
  }
  const complete =
    partial.date !== null &&
    partial.description !== null &&
    (partial.amount !== null || partial.debit !== null || partial.credit !== null);
  return { mapping: complete ? partial : null, partial, complete };
}

const str = (c: Cell | undefined): string =>
  c === null || c === undefined ? '' : String(c).trim();

function skey(
  accountId: string,
  date: string,
  amount: number,
  currency: string,
  desc: string,
  occurrence: number,
): string {
  return createHash('sha1')
    .update([accountId, date, amount, currency, normalizeDescription(desc), occurrence].join('|'))
    .digest('hex');
}

/** Uses running balances to infer direction of unsigned amounts. Returns signed amounts by row index. */
function directionFromBalance(abs: (number | null)[], bal: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = abs.map(() => null);
  let asc = 0;
  let desc = 0;
  for (let i = 1; i < abs.length; i++) {
    const a = abs[i],
      b = bal[i],
      pa = abs[i - 1],
      pb = bal[i - 1];
    if (a == null || b == null || pb == null) continue;
    const d = Math.abs(b - pb);
    if (d === a) asc++;
    if (pa != null && d === pa) desc++;
  }
  if (asc === 0 && desc === 0) return out;
  for (let i = 1; i < abs.length; i++) {
    const a = abs[i],
      b = bal[i],
      pa = abs[i - 1],
      pb = bal[i - 1];
    if (b == null || pb == null) continue;
    if (asc >= desc) {
      if (a != null && Math.abs(b - pb) === a) out[i] = b - pb;
    } else if (pa != null && Math.abs(b - pb) === pa) {
      out[i - 1] = pb - b; // previous row is chronologically later
    }
  }
  return out;
}

export interface StageOptions {
  accountId: string;
  existingKeys: Set<string>;
}

export function stageRows(
  grid: Grid,
  m: Mapping,
  opts: StageOptions,
): { rows: StagedRowDraft[]; notes: string[] } {
  const notes: string[] = [];
  const body: { idx: number; cells: Cell[] }[] = [];
  for (let i = m.headerRow + 1; i < grid.length; i++) {
    const cells = grid[i] ?? [];
    if (cells.every((c) => str(c) === '')) continue;
    body.push({ idx: i, cells });
  }

  // Column-level inference.
  const dateStrings = m.date === null ? [] : body.map((b) => str(b.cells[m.date!])).filter(Boolean);
  const inferred = inferDateOrder(dateStrings);
  const order: DateOrder = m.dateOrder ?? inferred.order;
  const orderConfident = m.dateOrder !== undefined || inferred.confident;
  if (!orderConfident && dateStrings.some((d) => /^\d{1,2}[-/.]\d{1,2}[-/.]/.test(d))) {
    notes.push(
      'Date order (day/month) could not be determined from the data; day-first was assumed. Check flagged dates.',
    );
  }

  const hasSignedAmounts =
    m.amount !== null &&
    body.some((b) => /^[\s(]*[-−–]|-\s*$|\)\s*$/.test(str(b.cells[m.amount!])));
  const unsigned = m.amount !== null && m.type === null && !hasSignedAmounts;
  const absAmounts: (number | null)[] = [];
  const balances: (number | null)[] = [];
  if (unsigned) {
    for (const b of body) {
      const cur =
        (m.currency !== null ? detectCurrency(str(b.cells[m.currency])) : null) ??
        m.defaultCurrency;
      const a = parseAmount(b.cells[m.amount!], cur, m.decimalSeparator);
      const bal =
        m.balance !== null ? parseAmount(b.cells[m.balance], cur, m.decimalSeparator) : null;
      absAmounts.push(a ? Math.abs(a.minor) : null);
      balances.push(bal ? bal.minor : null);
    }
  }
  const fromBalance = unsigned ? directionFromBalance(absAmounts, balances) : [];

  const seen = new Map<string, number>();
  const rows: StagedRowDraft[] = [];

  body.forEach((b, i) => {
    const issues: string[] = [];
    let status = 'ok' as RowStatus;
    const flag = (msg: string) => {
      issues.push(msg);
      if (status === 'ok') status = 'flagged';
    };
    const invalid = (msg: string) => {
      issues.push(msg);
      status = 'invalid';
    };

    const description = m.description !== null ? str(b.cells[m.description]) : '';
    if (!description) flag('Description is empty.');

    // Currency
    let currency = m.defaultCurrency;
    if (m.currency !== null && str(b.cells[m.currency])) {
      const c = detectCurrency(str(b.cells[m.currency]));
      if (c) currency = c;
      else flag(`Unrecognised currency "${str(b.cells[m.currency])}"; using ${m.defaultCurrency}.`);
    }

    // Date
    let bookedOn: string | null = null;
    const dateRaw = m.date !== null ? b.cells[m.date] : null;
    const pd = parseDate(typeof dateRaw === 'number' ? null : str(dateRaw), order);
    if (!pd) invalid(`Date "${str(dateRaw)}" is missing or not recognised.`);
    else {
      bookedOn = pd.ymd;
      if (pd.ambiguous && !orderConfident) flag('Date could be day/month swapped.');
    }

    // Amount
    let amountMinor: number | null = null;
    const typeText = m.type !== null ? str(b.cells[m.type]).toUpperCase() : '';
    if (m.amount !== null) {
      const pa = parseAmount(b.cells[m.amount], currency, m.decimalSeparator);
      if (!pa) invalid(`Amount "${str(b.cells[m.amount])}" is missing or not a number.`);
      else {
        amountMinor = pa.minor;
        if (pa.ambiguous)
          flag('Amount uses an ambiguous separator (e.g. "1,234"); check the value.');
        if (typeText) {
          const out = /^(DR|DEBIT|BORÇ|BORC|D)$/.test(typeText);
          const inn = /^(CR|CREDIT|ALACAK|C)$/.test(typeText);
          if (out) amountMinor = -Math.abs(amountMinor);
          else if (inn) amountMinor = Math.abs(amountMinor);
          else flag(`Unrecognised debit/credit indicator "${typeText}".`);
        } else if (unsigned) {
          const inferredSigned = fromBalance[i];
          if (inferredSigned != null) amountMinor = inferredSigned;
          else flag('Direction (money in/out) is unknown: amount has no sign. Set it manually.');
        }
      }
    } else {
      const d =
        m.debit !== null ? parseAmount(b.cells[m.debit], currency, m.decimalSeparator) : null;
      const c =
        m.credit !== null ? parseAmount(b.cells[m.credit], currency, m.decimalSeparator) : null;
      const dv = d && d.minor !== 0 ? Math.abs(d.minor) : null;
      const cv = c && c.minor !== 0 ? Math.abs(c.minor) : null;
      if (dv && cv) invalid('Both debit and credit columns have values.');
      else if (dv) amountMinor = -dv;
      else if (cv) amountMinor = cv;
      else invalid('Neither debit nor credit has a value.');
      if ((d?.ambiguous || c?.ambiguous) && status !== 'invalid')
        flag('Amount uses an ambiguous separator; check the value.');
    }
    if (amountMinor === 0) {
      amountMinor = null;
      invalid('Amount is zero.');
    }

    // Duplicate detection (identical rows inside one file get distinct occurrence indexes).
    let dedupeKey: string | null = null;
    if (bookedOn && amountMinor !== null) {
      const base = [bookedOn, amountMinor, currency, normalizeDescription(description)].join('|');
      const occ = (seen.get(base) ?? 0) + 1;
      seen.set(base, occ);
      dedupeKey = skey(opts.accountId, bookedOn, amountMinor, currency, description, occ);
      if (opts.existingKeys.has(dedupeKey)) {
        issues.push('Already imported earlier.');
        status = 'duplicate';
      }
    }

    rows.push({
      rowRef: b.idx + 1,
      raw: b.cells,
      bookedOn,
      description: description || '(no description)',
      amountMinor,
      currency,
      category: amountMinor === null ? 'Uncategorized' : categorize(description, amountMinor),
      status,
      issues,
      include: status === 'ok' || status === 'flagged',
      dedupeKey,
    });
  });

  return { rows, notes };
}

export function computeKey(
  accountId: string,
  date: string,
  amountMinor: number,
  currency: string,
  description: string,
  occurrence = 1,
): string {
  return skey(accountId, date, amountMinor, currency, description, occurrence);
}
