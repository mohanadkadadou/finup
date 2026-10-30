import { describe, expect, it } from 'vitest';
import { guessMapping, stageRows } from '../src/import/normalize.js';
import { pdfLinesToGrid } from '../src/import/pdf.js';

// Turkish statement layout: date, description, unsigned amount, running balance. No DR/CR column.
const lines = [
  '26.06.2026 A003U Firma Adı: TEKEL BAYII ISTANBUL,Harcama - 370,00 93,11',
  '26.06.2026 A0260 Currency Sell, Currency Name: USD, Rate: 46.01169, Currency Amount: 100 4.601,17 4.694,28',
  '26.06.2026 A026C Money Transfer, Sender: A B, Recipient: C D 4.000,00 694,28',
  '27.06.2026 A0300 Market alışverişi 94,28 600,00',
];

describe('PDF statement without a debit/credit column', () => {
  const { grid } = pdfLinesToGrid(lines);
  const guess = guessMapping(grid, 'TRY');
  const { rows } = stageRows(grid, guess.mapping ?? guess.partial, {
    accountId: 'a',
    existingKeys: new Set(),
  });

  it('infers money in/out from the running balance instead of treating everything as income', () => {
    expect(rows[1]!.amountMinor).toBe(460117);
    expect(rows[2]!.amountMinor).toBe(-400000);
    expect(rows[3]!.amountMinor).toBe(-9428);
  });
  it('flags the first row, whose balance before it is unknown, instead of guessing', () => {
    expect(rows[0]!.status).toBe('flagged');
    expect(rows[0]!.issues.join(' ')).toMatch(/Direction/);
  });
});
