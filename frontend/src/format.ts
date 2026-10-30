const ZERO = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF']);
const THREE = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND']);
export const exponent = (c: string): number => (ZERO.has(c) ? 0 : THREE.has(c) ? 3 : 2);

/** Integer minor units -> "1,234.56" (no float math). */
export function fmt(minor: number, currency: string): string {
  const exp = exponent(currency);
  const abs = Math.abs(minor);
  const scale = 10 ** exp;
  const whole = String(Math.floor(abs / scale)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = exp > 0 ? '.' + String(abs % scale).padStart(exp, '0') : '';
  return `${minor < 0 ? '-' : ''}${whole}${frac}`;
}

/** User-typed major units ("1234.5" or "1.234,50") -> minor units, or null if invalid. Integer-only. */
export function toMinor(text: string, currency: string): number | null {
  const exp = exponent(currency);
  let s = text.trim().replace(/\s/g, '');
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let whole = s;
  let frac = '';
  if (lastSep >= 0 && s.length - lastSep - 1 <= exp && s.length - lastSep - 1 > 0) {
    whole = s.slice(0, lastSep);
    frac = s.slice(lastSep + 1);
  }
  whole = whole.replace(/[.,]/g, '');
  s = whole + frac.padEnd(exp, '0');
  const n = Number(s);
  return /^\d+$/.test(s) && Number.isSafeInteger(n) ? n : null;
}

export const pct = (bp: number | null): string => (bp === null ? '—' : `${(bp / 100).toFixed(1)}%`);
let formatLocale = 'en';
export const getFormatLang = (): 'en' | 'ar' => (formatLocale.startsWith('ar') ? 'ar' : 'en');
export const setFormatLang = (lang: 'en' | 'ar'): void => {
  formatLocale = lang === 'ar' ? 'ar-u-nu-latn' : 'en';
};
export const weekdayLabel = (weekday: number, style: 'long' | 'short' = 'long'): string =>
  new Date(Date.UTC(2024, 0, 7 + weekday)).toLocaleDateString(formatLocale, {
    weekday: style,
    timeZone: 'UTC',
  });
export const dayLabel = (ymd: string): string =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString(formatLocale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
export const monthLabel = (m: string): string => {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString(formatLocale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};
