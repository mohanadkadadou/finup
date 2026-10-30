import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { ApiError } from '../errors.js';
import { toYmd } from '../dates.js';

export type Cell = string | number | null;
export type Grid = Cell[][];
export type FileKind = 'csv' | 'xlsx' | 'pdf';

export function detectKind(filename: string, bytes: Buffer): FileKind | null {
  const lower = filename.toLowerCase();
  const head = bytes.subarray(0, 5).toString('latin1');
  if (head.startsWith('%PDF')) return 'pdf';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return lower.endsWith('.xlsx') ? 'xlsx' : null; // zip container
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
  return null;
}

const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

function decodeText(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(BOM, '');
  } catch {
    // Turkish banks often export Windows-1254.
    return new TextDecoder('windows-1254').decode(bytes);
  }
}

export function readCsv(bytes: Buffer): Grid {
  const text = decodeText(bytes);
  const res = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t', '|'],
  });
  if (res.errors.some((e) => e.type === 'Quotes')) {
    throw new ApiError(
      422,
      'CSV_MALFORMED',
      'The CSV has unbalanced quotes and could not be read.',
    );
  }
  return res.data.map((row) => row.map((c) => (c === '' ? null : c.trim())));
}

export async function readXlsx(bytes: Buffer): Promise<Grid> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new ApiError(
      422,
      'XLSX_MALFORMED',
      'The spreadsheet could not be opened. Is it a valid .xlsx file?',
    );
  }
  const sheet = wb.worksheets.find((s) => s.actualRowCount > 0);
  if (!sheet) throw new ApiError(422, 'XLSX_EMPTY', 'The spreadsheet has no data.');
  const grid: Grid = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: Cell[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const v = row.getCell(c).value;
      if (v === null || v === undefined) cells.push(null);
      else if (v instanceof Date)
        cells.push(toYmd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()));
      else if (typeof v === 'number') cells.push(v);
      else if (typeof v === 'object') {
        const o = v as unknown as Record<string, unknown>;
        // Formula result / rich text: take the inert text/result, never evaluate anything.
        const inner = (o.result ??
          o.text ??
          (Array.isArray(o.richText)
            ? o.richText.map((r: { text: string }) => r.text).join('')
            : null)) as unknown;
        cells.push(typeof inner === 'number' ? inner : inner == null ? null : String(inner).trim());
      } else cells.push(String(v).trim() || null);
    }
    grid.push(cells);
  });
  return grid;
}
