import { describe, expect, it } from 'vitest';
import { inferDateOrder, parseDate } from '../src/dates.js';

describe('parseDate', () => {
  it('parses common formats', () => {
    expect(parseDate('2026-03-05')?.ymd).toBe('2026-03-05');
    expect(parseDate('05.03.2026')?.ymd).toBe('2026-03-05');
    expect(parseDate('05/03/2026', 'mdy')?.ymd).toBe('2026-05-03');
    expect(parseDate('5 Mar 2026')?.ymd).toBe('2026-03-05');
    expect(parseDate('05.03.2026 14:22:10')?.ymd).toBe('2026-03-05');
    expect(parseDate('05/03/26')?.ymd).toBe('2026-03-05');
  });
  it('rejects impossible dates', () => {
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
    expect(parseDate('hello')).toBeNull();
  });
  it('marks ambiguous day/month dates', () => {
    expect(parseDate('05/03/2026')?.ambiguous).toBe(true);
    expect(parseDate('25/03/2026')?.ambiguous).toBe(false);
    expect(parseDate('05/05/2026')?.ambiguous).toBe(false);
  });
});

describe('inferDateOrder', () => {
  it('uses unambiguous evidence', () => {
    expect(inferDateOrder(['25/03/2026', '01/04/2026'])).toEqual({ order: 'dmy', confident: true });
    expect(inferDateOrder(['03/25/2026', '04/01/2026'])).toEqual({ order: 'mdy', confident: true });
    expect(inferDateOrder(['01/02/2026', '03/04/2026']).confident).toBe(false);
  });
});
