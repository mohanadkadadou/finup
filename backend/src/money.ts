/**
 * Money is always integer minor units (bigint-safe as JS numbers below 2^53) plus an ISO currency code.
 * No floating point is used for parsing, summing or formatting amounts.
 */

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF']);
const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND']);

export function minorExponent(currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

const SYMBOLS: Record<string, string> = {
  '₺': 'TRY',
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  TL: 'TRY',
};

/** Returns an ISO-4217-shaped code found in a cell/header ("TRY", "₺", "usd"), or null. */
export function detectCurrency(text: string | null | undefined): string | null {
  if (!text) return null;
  const upper = text.toUpperCase();
  const iso = upper.match(/\b(TRY|USD|EUR|GBP|AED|SAR|JPY|CHF|CAD|AUD|KWD|BHD|QAR|EGP|JOD)\b/);
  if (iso?.[1]) return iso[1];
  for (const [sym, code] of Object.entries(SYMBOLS)) {
    if (text.includes(sym)) return code;
  }
  return null;
}

// Built from code points so formatters cannot turn the escapes into literal irregular whitespace.
const SPACES_AND_APOSTROPHES = new RegExp(`[\\s${String.fromCharCode(0xa0, 0x202f)}']`, 'g');

export type DecimalSeparator = 'auto' | 'comma' | 'dot';

export interface ParsedAmount {
  minor: number;
  /** True when the separators were ambiguous and we had to guess ("1,234"). */
  ambiguous: boolean;
}

/**
 * Parses a human-formatted amount into signed minor units.
 * Handles: "1.234,56", "1,234.56", "1 234,56", "-12.50", "(12.50)", "12.50-", "₺1.234,56", "12,5".
 * Returns null when the text is not a number.
 */
export function parseAmount(
  input: string | number | null | undefined,
  currency = 'TRY',
  decimalSeparator: DecimalSeparator = 'auto',
): ParsedAmount | null {
  if (input === null || input === undefined) return null;
  const exp = minorExponent(currency);
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    // Spreadsheet numeric cells: round-trip through a fixed decimal string, never multiply floats.
    return parseAmount(input.toFixed(exp + 2), currency, 'dot');
  }
  let s = input.trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    negative = true;
    s = s.replace(/-\s*$/, '');
  }
  if (/^\s*[-−–]/.test(s)) {
    negative = true;
    s = s.replace(/^\s*[-−–]\s*/, '');
  }
  if (/^\s*\+/.test(s)) s = s.replace(/^\s*\+\s*/, '');

  // Strip currency symbols/codes, spaces, narrow no-break spaces and apostrophes used as thousands marks.
  s = s.replace(/[A-Za-z₺$€£]/g, '').replace(SPACES_AND_APOSTROPHES, '');
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalChar: '.' | ',' | null = null;
  let ambiguous = false;

  if (decimalSeparator === 'dot') decimalChar = '.';
  else if (decimalSeparator === 'comma') decimalChar = ',';
  else if (lastDot >= 0 && lastComma >= 0) {
    decimalChar = lastDot > lastComma ? '.' : ',';
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const count = s.split(sep).length - 1;
    const tail = s.slice(s.lastIndexOf(sep) + 1);
    if (count > 1)
      decimalChar = null; // "1.234.567" -> thousands separators
    else if (tail.length === 3 && (exp === 2 || exp === 0)) {
      decimalChar = null; // "1,234" -> thousands, but worth flagging
      ambiguous = true;
    } else decimalChar = sep;
  }

  if (decimalChar && s.split(decimalChar).length > 2) return null; // two decimal separators
  let intPart = s;
  let fracPart = '';
  if (decimalChar) {
    const idx = s.lastIndexOf(decimalChar);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  if (fracPart && /[.,]/.test(fracPart)) return null;
  if (!/^[0-9]*$/.test(intPart) || !/^[0-9]*$/.test(fracPart)) return null;

  // Excess precision beyond the currency exponent: round half away from zero on the digit string.
  let frac = fracPart;
  let carry = 0;
  if (frac.length > exp) {
    carry = Number(frac[exp]) >= 5 ? 1 : 0;
    frac = frac.slice(0, exp);
  }
  frac = frac.padEnd(exp, '0');
  const whole = Number(intPart || '0');
  const scale = 10 ** exp;
  const minor = whole * scale + Number(frac || '0') + carry;
  if (!Number.isSafeInteger(minor)) return null;
  return { minor: negative ? -minor : minor, ambiguous };
}

/** Formats signed minor units for display, e.g. (123456, 'TRY') -> "1,234.56". */
export function formatMinor(minor: number, currency: string): string {
  const exp = minorExponent(currency);
  const abs = Math.abs(minor);
  const scale = 10 ** exp;
  const whole = Math.floor(abs / scale);
  const frac = String(abs % scale).padStart(exp, '0');
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${minor < 0 ? '-' : ''}${grouped}${exp > 0 ? '.' + frac : ''}`;
}

/** Sums minor units for a single currency; throws if currencies are mixed. */
export function sumSameCurrency(items: { amount_minor: number; currency: string }[]): {
  total: number;
  currency: string | null;
} {
  let currency: string | null = null;
  let total = 0;
  for (const it of items) {
    if (currency && it.currency !== currency) {
      throw new Error(`Refusing to sum mixed currencies: ${currency} and ${it.currency}`);
    }
    currency = it.currency;
    total += it.amount_minor;
  }
  return { total, currency };
}
