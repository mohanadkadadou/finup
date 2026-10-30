export type DateOrder = 'dmy' | 'mdy';

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  oca: 1,
  şub: 2,
  sub: 2,
  nis: 4,
  haz: 6,
  tem: 7,
  ağu: 8,
  agu: 8,
  eyl: 9,
  eki: 10,
  kas: 11,
  ara: 12,
};

export function isValidYmd(y: number, m: number, d: number): boolean {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

export const toYmd = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export interface ParsedDate {
  ymd: string;
  /** Both day-first and month-first readings are valid calendar dates and differ. */
  ambiguous: boolean;
}

/** Parses one date string. `order` only matters for numeric a/b/yyyy dates. */
export function parseDate(
  input: string | Date | null | undefined,
  order: DateOrder = 'dmy',
): ParsedDate | null {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return {
      ymd: toYmd(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate()),
      ambiguous: false,
    };
  }
  const s = input.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '');
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidYmd(y, mo, d) ? { ymd: toYmd(y, mo, d), ambiguous: false } : null;
  }

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let y = Number(m[3]);
    if (m[3]!.length === 2) y += 2000;
    const [day, month] = order === 'dmy' ? [a, b] : [b, a];
    if (!isValidYmd(y, month, day)) return null;
    const swappedValid = isValidYmd(y, order === 'dmy' ? a : b, order === 'dmy' ? b : a);
    return { ymd: toYmd(y, month, day), ambiguous: swappedValid && a !== b };
  }

  m = s.match(/^(\d{1,2})[\s-]([A-Za-zÇĞİÖŞÜçğıöşü]{3})[A-Za-zçğıöşü]*\.?[\s,-]+(\d{2}|\d{4})$/);
  if (m) {
    const mo = MONTHS[m[2]!.toLowerCase()];
    let y = Number(m[3]);
    if (m[3]!.length === 2) y += 2000;
    const d = Number(m[1]);
    return mo && isValidYmd(y, mo, d) ? { ymd: toYmd(y, mo, d), ambiguous: false } : null;
  }
  return null;
}

/**
 * Decides day-first vs month-first for a whole column. Any value whose first part exceeds 12
 * proves day-first; whose second part exceeds 12 proves month-first. Otherwise defaults to
 * day-first and reports low confidence.
 */
export function inferDateOrder(values: string[]): { order: DateOrder; confident: boolean } {
  let dmy = false;
  let mdy = false;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return { order: 'dmy', confident: true };
  if (mdy && !dmy) return { order: 'mdy', confident: true };
  if (dmy && mdy) return { order: 'dmy', confident: false };
  return { order: 'dmy', confident: false };
}
