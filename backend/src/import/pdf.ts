import { ApiError } from '../errors.js';
import type { Grid } from './readers.js';

interface TextItem {
  str: string;
  transform: number[];
  width: number;
}

/** Extracts visual text lines from a text-based PDF. Throws OCR_REQUIRED for image-only PDFs. */
export async function extractPdfLines(bytes: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false, // never evaluate embedded content
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
  } catch {
    throw new ApiError(
      422,
      'PDF_MALFORMED',
      'The PDF could not be opened (corrupt or password protected).',
    );
  }
  const lines: string[] = [];
  let itemCount = 0;
  for (let p = 1; p <= Math.min(doc.numPages, 200); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as unknown[]).filter(
      (i): i is TextItem =>
        typeof (i as TextItem).str === 'string' && (i as TextItem).str.trim() !== '',
    );
    itemCount += items.length;
    const rows = new Map<number, TextItem[]>();
    for (const it of items) {
      const y = Math.round((it.transform[5] ?? 0) / 3); // tolerate small baseline jitter
      (rows.get(y) ?? rows.set(y, []).get(y)!).push(it);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const parts = rows.get(y)!.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0));
      let line = '';
      let lastEnd = -Infinity;
      for (const it of parts) {
        const x = it.transform[4] ?? 0;
        line += (line ? (x - lastEnd > 8 ? '  ' : ' ') : '') + it.str.trim();
        lastEnd = x + it.width;
      }
      lines.push(line);
    }
  }
  if (itemCount === 0) {
    throw new ApiError(
      422,
      'OCR_REQUIRED',
      'This PDF has no selectable text (it looks scanned). OCR is not implemented yet. Please upload a text-based PDF, CSV or XLSX instead.',
    );
  }
  return lines;
}

const DATE = String.raw`(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})`;
const AMOUNT_TOKEN = /^[-+(−]?[₺$€£]?\d[\d.,]*[.,]\d{2}\)?-?(?:CR|DR)?$/i;

/**
 * Converts statement lines into a Date/Description/Amount/Balance/Type grid.
 * Only lines that start with a date and end with 1-2 amounts are treated as transactions.
 */
export function pdfLinesToGrid(lines: string[]): { grid: Grid; skippedLines: number } {
  const grid: Grid = [['Date', 'Description', 'Amount', 'Balance', 'Type']];
  let skipped = 0;
  const start = new RegExp(`^(${DATE})\\s+(.*)$`);
  for (const raw of lines) {
    const m = raw.trim().match(start);
    if (!m) {
      skipped++;
      continue;
    }
    const tokens = m[2]!.trim().split(/\s+/);
    const amounts: string[] = [];
    let type: string | null = null;
    while (tokens.length > 1 && amounts.length < 2) {
      const t = tokens[tokens.length - 1]!;
      if (/^(CR|DR|BORÇ|ALACAK)$/i.test(t) && amounts.length === 0) {
        type = t.toUpperCase();
        tokens.pop();
        continue;
      }
      if (!AMOUNT_TOKEN.test(t)) break;
      const suffix = t.match(/(CR|DR)$/i);
      if (suffix && amounts.length === 0) type = suffix[1]!.toUpperCase();
      amounts.unshift(t.replace(/(CR|DR)$/i, ''));
      tokens.pop();
    }
    if (amounts.length === 0) {
      skipped++;
      continue;
    }
    const [amount, balance] =
      amounts.length === 2 ? [amounts[0]!, amounts[1]!] : [amounts[0]!, null];
    grid.push([m[1]!, tokens.join(' '), amount, balance, type]);
  }
  return { grid, skippedLines: skipped };
}
