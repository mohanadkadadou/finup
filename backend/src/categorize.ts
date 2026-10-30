export const CATEGORIES = [
  'Groceries',
  'Dining',
  'Transport',
  'Housing',
  'Utilities',
  'Subscriptions',
  'Shopping',
  'Health',
  'Entertainment',
  'Travel',
  'Education',
  'Fees',
  'Transfers',
  'Salary',
  'Income',
  'Uncategorized',
] as const;
export type Category = (typeof CATEGORIES)[number];

const RULE_SOURCES: [Category, string][] = [
  ['Salary', 'salary|payroll|maaş|maas|wage'],
  ['Groceries', 'migros|bim|a101|şok|sok|carrefour|market|grocery|supermarket|tesco|aldi|lidl'],
  [
    'Dining',
    'restaurant|cafe|café|coffee|starbucks|kahve|yemek|yemeksepeti|getir ?yemek|mcdonald|burger|pizza|lokanta',
  ],
  [
    'Transport',
    'uber|bolt|taksi|taxi|metro|ulaşım|ulasim|istanbulkart|akaryakıt|petrol|shell|opet|bp|fuel|parking|otopark',
  ],
  ['Housing', 'rent|kira|mortgage|konut|aidat'],
  [
    'Utilities',
    'electric|elektrik|enerjisa|igdas|iski|su faturası|water|gas|doğalgaz|internet|turkcell|vodafone|türk telekom|turk telekom|fatura|bill',
  ],
  [
    'Subscriptions',
    'netflix|spotify|youtube|apple\\.com|icloud|google ?one|disney|amazon prime|exxen|blutv|adobe|chatgpt|openai|anthropic|subscription|abonelik',
  ],
  ['Shopping', 'amazon|trendyol|hepsiburada|n11|zara|h&m|ikea|mediamarkt|teknosa|shopping'],
  ['Health', 'pharmacy|eczane|hospital|hastane|clinic|klinik|doctor|dental|diş'],
  ['Entertainment', 'cinema|sinema|biletix|steam|playstation|xbox|concert'],
  ['Travel', 'airline|thy|pegasus|booking\\.com|airbnb|hotel|otel|flight'],
  ['Education', 'tuition|university|üniversite|udemy|coursera|okul|school|course'],
  ['Fees', 'fee|komisyon|masraf|interest|faiz|commission|annual card|kart ücreti'],
  ['Transfers', 'transfer|havale|eft|fast|wire|atm|cash withdrawal|nakit'],
  ['Income', 'refund|iade|cashback|deposit|interest earned'],
];

// JS `\b` is ASCII-only and breaks on Turkish letters (ş, ı, ö...), so use Unicode-aware boundaries.
const RULES: [Category, RegExp][] = RULE_SOURCES.map(([cat, src]) => [
  cat,
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, 'iu'),
]);

/** Rule-based categorization. Pure function; descriptions are treated as inert data. */
export function categorize(description: string, amountMinor: number): Category {
  for (const [cat, re] of RULES) {
    if (re.test(description)) {
      if (cat === 'Income' && amountMinor < 0) continue;
      if (cat === 'Salary' && amountMinor < 0) continue;
      return cat;
    }
  }
  return amountMinor > 0 ? 'Income' : 'Uncategorized';
}

export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d{2,}/g, '#')
    .replace(/[^\p{L}\p{N}# ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
