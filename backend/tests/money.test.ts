import { describe, expect, it } from 'vitest';
import { formatMinor, parseAmount, sumSameCurrency } from '../src/money.js';

const p = (s: string | number, cur = 'TRY', sep: 'auto' | 'comma' | 'dot' = 'auto') =>
  parseAmount(s, cur, sep)?.minor;

describe('parseAmount', () => {
  it('handles European and US formats', () => {
    expect(p('1.234,56')).toBe(123456);
    expect(p('1,234.56')).toBe(123456);
    expect(p('1 234,56')).toBe(123456);
    expect(p('12,5')).toBe(1250);
    expect(p('1.234.567,89')).toBe(123456789);
  });
  it('handles sign conventions', () => {
    expect(p('-12.50')).toBe(-1250);
    expect(p('(12.50)')).toBe(-1250);
    expect(p('12.50-')).toBe(-1250);
    expect(p('+12.50')).toBe(1250);
    expect(p('₺1.000,00')).toBe(100000);
  });
  it('never uses float math for classic float traps', () => {
    expect(p('0.1')).toBe(10);
    expect(p('0.29')).toBe(29);
    expect(p('1.005', 'TRY', 'dot')).toBe(101); // 1.005 * 100 is 100.49999 in floats; string rounding gives 101
  });
  it('flags a lone 3-digit tail as ambiguous and treats it as thousands', () => {
    const r = parseAmount('1,234', 'TRY');
    expect(r).toEqual({ minor: 123400, ambiguous: true });
  });
  it('respects an explicit decimal separator', () => {
    expect(p('1,234', 'TRY', 'comma')).toBe(123);
    expect(p('1.234', 'TRY', 'dot')).toBe(123);
  });
  it('rounds excess precision half away from zero and honours zero-decimal currencies', () => {
    expect(p('10.005', 'TRY', 'dot')).toBe(1001);
    expect(p('1.500', 'JPY')).toBe(1500);
    expect(p('1.234', 'KWD', 'dot')).toBe(1234);
  });
  it('converts numeric spreadsheet cells without float multiplication', () => {
    expect(p(1234.56)).toBe(123456);
    expect(p(0.07)).toBe(7);
    expect(p(19.99)).toBe(1999);
  });
  it('rejects non-numbers', () => {
    expect(p('abc')).toBeUndefined();
    expect(p('')).toBeUndefined();
    expect(p('1.2.3,4,5')).toBeUndefined();
    expect(parseAmount(null)).toBeNull();
  });
});

describe('formatMinor / sumSameCurrency', () => {
  it('formats with grouping and sign', () => {
    expect(formatMinor(123456, 'TRY')).toBe('1,234.56');
    expect(formatMinor(-5, 'TRY')).toBe('-0.05');
    expect(formatMinor(1500, 'JPY')).toBe('1,500');
  });
  it('sums one currency and refuses mixed ones', () => {
    expect(
      sumSameCurrency([
        { amount_minor: 10, currency: 'TRY' },
        { amount_minor: -3, currency: 'TRY' },
      ]).total,
    ).toBe(7);
    expect(() =>
      sumSameCurrency([
        { amount_minor: 1, currency: 'TRY' },
        { amount_minor: 1, currency: 'USD' },
      ]),
    ).toThrow(/mixed currencies/);
  });
  it('sums many cents exactly', () => {
    const items = Array.from({ length: 1000 }, () => ({ amount_minor: 10, currency: 'TRY' }));
    expect(sumSameCurrency(items).total).toBe(10000);
  });
});
