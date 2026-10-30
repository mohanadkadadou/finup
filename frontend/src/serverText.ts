import { AR } from './ar';
import { getFormatLang } from './format';

/**
 * The API always answers in English (tests and logs rely on that). In Arabic mode the UI maps known server
 * sentences to Arabic here. Anything that does not match is shown as-is, never guessed.
 */
type Rule = [RegExp, string];

const exact = (s: string): RegExp => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

const RULES: Rule[] = [
  // ---- errors
  [exact('Route not found.'), 'المسار غير موجود.'],
  [exact('Please sign in.'), 'الرجاء تسجيل الدخول.'],
  [
    exact('Your session has expired. Please sign in again.'),
    'انتهت جلستك. الرجاء تسجيل الدخول من جديد.',
  ],
  [exact('Email or password is incorrect.'), 'البريد الإلكتروني أو كلمة السر غير صحيحة.'],
  [exact('An account with this email already exists.'), 'يوجد حساب بهذا البريد الإلكتروني مسبقاً.'],
  [exact('Request validation failed.'), 'بيانات الطلب غير صالحة. تحقق من الحقول وأعد المحاولة.'],
  [exact('Not found.'), 'غير موجود.'],
  [
    exact('This reset link is invalid or has expired.'),
    'رابط إعادة التعيين غير صالح أو انتهت صلاحيته.',
  ],
  [
    exact('This verification link is invalid or has expired.'),
    'رابط التأكيد غير صالح أو انتهت صلاحيته.',
  ],
  [exact('Your current password is incorrect.'), 'كلمة السر الحالية غير صحيحة.'],
  [exact('Import not found.'), 'عملية الاستيراد غير موجودة.'],
  [exact('Account not found.'), 'الحساب غير موجود.'],
  [exact('Row not found.'), 'الصف غير موجود.'],
  [exact('Transaction not found.'), 'المعاملة غير موجودة.'],
  [exact('Goal not found.'), 'الهدف غير موجود.'],
  [exact('Budget not found.'), 'الميزانية غير موجودة.'],
  [exact('Connection not found.'), 'الاتصال غير موجود.'],
  [exact('Attach a file in the "file" field.'), 'أرفق ملفاً في حقل «file».'],
  [
    exact('Unsupported file type. Upload a .pdf, .csv or .xlsx file.'),
    'نوع الملف غير مدعوم. ارفع ملف .pdf أو .csv أو .xlsx.',
  ],
  [exact('The file contains no rows.'), 'الملف لا يحتوي على أي صفوف.'],
  [exact('The spreadsheet has no data.'), 'ملف الجدول لا يحتوي على بيانات.'],
  [
    exact('The CSV has unbalanced quotes and could not be read.'),
    'ملف CSV يحتوي على علامات اقتباس غير متوازنة وتعذّرت قراءته.',
  ],
  [
    exact('The spreadsheet could not be opened. Is it a valid .xlsx file?'),
    'تعذّر فتح الجدول. هل هو ملف .xlsx صالح؟',
  ],
  [
    exact('The PDF could not be opened (corrupt or password protected).'),
    'تعذّر فتح ملف PDF (تالف أو محمي بكلمة سر).',
  ],
  [
    exact(
      'This PDF has no selectable text (it looks scanned). OCR is not implemented yet. Please upload a text-based PDF, CSV or XLSX instead.',
    ),
    'هذا الـ PDF لا يحتوي على نص قابل للتحديد (يبدو ممسوحاً ضوئياً) والتعرّف الضوئي OCR غير متاح بعد. ارفع PDF نصياً أو CSV أو XLSX بدلاً منه.',
  ],
  [
    exact(
      'No transaction rows were recognised in this PDF. Try exporting the statement as CSV or XLSX from your bank.',
    ),
    'لم يُتعرَّف على أي صفوف معاملات في هذا الـ PDF. جرّب تصدير الكشف بصيغة CSV أو XLSX من بنكك.',
  ],
  [
    /^The file has more than (\d+) rows\. Split it and upload in parts\.$/,
    'الملف يحتوي على أكثر من $1 صف. قسّمه وارفعه على دفعات.',
  ],
  [exact('This import is already closed.'), 'عملية الاستيراد هذه مغلقة مسبقاً.'],
  [exact('This import is not in review.'), 'عملية الاستيراد هذه ليست في مرحلة المراجعة.'],
  [
    exact('A committed import cannot be discarded; delete its transactions instead.'),
    'لا يمكن إلغاء استيراد تم تأكيده؛ احذف معاملاته بدلاً من ذلك.',
  ],
  [exact('That is not a valid date.'), 'هذا ليس تاريخاً صحيحاً.'],
  [exact('That is not a valid non-zero amount.'), 'هذا ليس مبلغاً صحيحاً غير صفري.'],
  [
    exact(
      'Map at least the date, description and either an amount column or debit/credit columns.',
    ),
    'اربط على الأقل عمود التاريخ والوصف مع عمود المبلغ أو عمودَي المدين والدائن.',
  ],
  [
    exact('A mapped column does not exist in the file.'),
    'أحد الأعمدة المربوطة غير موجود في الملف.',
  ],
  [
    /^(\d+) flagged row\(s\) have not been reviewed\. Edit or confirm them, or choose to import them as they are\.$/,
    '$1 صف مُعلَّم لم تتم مراجعته. عدّله أو أكّده، أو اختر استيراده كما هو.',
  ],
  [exact('The email you typed does not match your account.'), 'البريد الذي كتبته لا يطابق حسابك.'],
  [exact('Provider consent flow is not implemented.'), 'مسار موافقة المزوّد غير مُنفَّذ.'],
  [
    exact(
      'No bank data provider is configured. Live bank sync needs an approved Open Banking provider that covers your country and bank, plus credentials.',
    ),
    AR[
      'No bank data provider is configured. Live bank sync needs an approved Open Banking provider that covers your country and bank, plus credentials.'
    ]!,
  ],
  [
    exact('Upload a PDF, CSV or XLSX statement on the Import page.'),
    'ارفع كشف حساب PDF أو CSV أو XLSX من صفحة الاستيراد.',
  ],
  [/^Request failed \((\d+)\)$/, 'فشل الطلب (الرمز $1).'],
  [exact('Something went wrong.'), 'حدث خطأ ما.'],
  [exact('Failed to fetch'), 'تعذّر الاتصال بالخادم.'],

  // ---- import issues and notes
  [exact('Description is empty.'), 'الوصف فارغ.'],
  [/^Unrecognised currency "(.*)"; using (\w+)\.$/, 'العملة «$1» غير معروفة؛ سيُستخدم $2.'],
  [/^Date "(.*)" is missing or not recognised\.$/, 'التاريخ «$1» مفقود أو غير معروف.'],
  [exact('Date could be day/month swapped.'), 'قد يكون اليوم والشهر مقلوبَين في هذا التاريخ.'],
  [/^Amount "(.*)" is missing or not a number\.$/, 'المبلغ «$1» مفقود أو ليس رقماً.'],
  [
    exact('Amount uses an ambiguous separator (e.g. "1,234"); check the value.'),
    'المبلغ يستخدم فاصلاً ملتبساً (مثل «1,234»)؛ تحقق من القيمة.',
  ],
  [
    exact('Amount uses an ambiguous separator; check the value.'),
    'المبلغ يستخدم فاصلاً ملتبساً؛ تحقق من القيمة.',
  ],
  [/^Unrecognised debit\/credit indicator "(.*)"\.$/, 'مؤشر المدين/الدائن «$1» غير معروف.'],
  [
    exact('Direction (money in/out) is unknown: amount has no sign. Set it manually.'),
    'اتجاه المبلغ (دخول/خروج) غير معروف لأنه بلا إشارة. حدّده يدوياً.',
  ],
  [exact('Both debit and credit columns have values.'), 'عمودا المدين والدائن كلاهما فيه قيمة.'],
  [exact('Neither debit nor credit has a value.'), 'لا قيمة في المدين ولا في الدائن.'],
  [exact('Amount is zero.'), 'المبلغ صفر.'],
  [exact('Already imported earlier.'), 'سبق استيراده.'],
  [
    exact(
      'Date order (day/month) could not be determined from the data; day-first was assumed. Check flagged dates.',
    ),
    'تعذّر تحديد ترتيب التاريخ (يوم/شهر) من البيانات؛ افتُرض أن اليوم أولاً. راجع التواريخ المُعلَّمة.',
  ],
  [
    /^PDF text was parsed heuristically; (\d+) non-transaction line\(s\) were ignored\. Review every row\.$/,
    'حُلِّل نص الـ PDF بالتخمين؛ تم تجاهل $1 سطر ليست معاملات. راجع كل صف.',
  ],

  // ---- goal and planner assumptions
  [
    /^Remaining = target − current savings, in (\w+)\.$/,
    'المتبقي = المستهدف − المدّخر الحالي، بعملة $1.',
  ],
  [
    /^Contributions are equal, one per calendar month through the deadline month \((\d+) periods?\), rounded up to the next minor unit\.$/,
    'الدفعات متساوية، واحدة كل شهر ميلادي حتى شهر الموعد النهائي ($1 دفعة)، مقرّبة للأعلى لأقرب وحدة صغرى.',
  ],
  [
    exact('No interest, inflation, price changes or exchange-rate movement is modelled.'),
    'لا تُحتسب فوائد ولا تضخم ولا تغيّر أسعار ولا تقلب أسعار صرف.',
  ],
  [
    exact('The deadline has passed, so the full remainder is shown as due now.'),
    'انتهى الموعد النهائي، لذلك يظهر كامل المتبقي كمستحق الآن.',
  ],
  [
    /^Estimated monthly net cash flow is the average of (\d+) past month\(s\) \((.*)\) of your confirmed (\w+) transactions\. This is an estimate, not a guarantee\.$/,
    'صافي التدفق النقدي الشهري المقدّر هو متوسط $1 شهر سابق ($2) من معاملاتك المؤكدة بعملة $3. هذا تقدير وليس ضماناً.',
  ],
  [
    exact(
      'Only one month of data exists and it may be incomplete, so this estimate is especially rough.',
    ),
    'توجد بيانات شهر واحد فقط وقد تكون ناقصة، لذلك هذا التقدير تقريبي جداً.',
  ],
  [
    /^No confirmed (\w+) transactions yet, so affordability cannot be estimated\.$/,
    'لا معاملات مؤكدة بعملة $1 بعد، لذلك لا يمكن تقدير القدرة على التحمّل.',
  ],
  [
    exact(
      'You have transactions in several currencies. Totals are shown per currency and never combined.',
    ),
    'لديك معاملات بعدة عملات. تُعرض المجاميع لكل عملة على حدة ولا تُجمع أبداً.',
  ],

  // ---- assistant
  [
    exact(
      "I don't have any confirmed transactions for you yet, so I can't answer from your data. Upload a statement on the Import page (or load the sample data) and ask again.",
    ),
    'لا توجد لديّ معاملات مؤكدة لك بعد، فلا أستطيع الإجابة من بياناتك. ارفع كشف حساب من صفحة الاستيراد (أو حمّل البيانات التجريبية) ثم اسأل من جديد.',
  ],
  [
    exact(
      'You have no savings goals yet. Create one on the Goals page with a target, current savings and deadline, and I can explain the monthly plan.',
    ),
    'ليس لديك أهداف ادخار بعد. أنشئ هدفاً في صفحة الأهداف بمبلغ مستهدف ومدّخر حالي وموعد نهائي، وسأشرح لك الخطة الشهرية.',
  ],
  [
    exact('Affordability is an estimate from past cash flow, not a guarantee.'),
    'القدرة على التحمّل تقدير من التدفق النقدي السابق وليست ضماناً.',
  ],
  [
    /^No month was specified, so I used the latest month with data \((.*)\)\.$/,
    'لم تُحدَّد أي شهر، فاستخدمتُ آخر شهر فيه بيانات ($1).',
  ],
  [
    /^I found no charges in (\w+) that repeat for at least 3 different months with a similar amount\.$/,
    'لم أجد أي دفعات بعملة $1 تتكرر في 3 أشهر مختلفة على الأقل بمبلغ متقارب.',
  ],
  [
    /^Repeating (\w+) charges \(same description, similar amount, ≥3 months\):$/,
    'دفعات متكررة بعملة $1 (نفس الوصف ومبلغ متقارب، 3 أشهر أو أكثر):',
  ],
  [/^• (.*): about (.*) per month, seen in (\d+) months$/, '• $1: نحو $2 شهرياً، ظهرت في $3 أشهر'],
  [
    /^I have no confirmed (\w+) transactions for (.*)\. Months with data: (.*)\.$/,
    'لا توجد لديّ معاملات مؤكدة بعملة $1 لشهر $2. الأشهر التي فيها بيانات: $3.',
  ],
  [
    /^In (\S+) \((\w+), actual\): income (.*), expenses (.*), net (.*) across (\d+) transactions\. Where it went: (.*)\.$/,
    'في $1 ($2، فعلي): الدخل $3، المصروفات $4، الصافي $5 عبر $6 معاملة. أين ذهب المال: $7.',
  ],
  [
    /^"(.*)": target (.*) (\w+), saved (.*), so (.*) remains over (\d+) month\(s\) → (.*) (\w+) per month \((.*)\)\.$/,
    '«$1»: المستهدف $2 $3، المدّخر $4، فيتبقى $5 خلال $6 شهر ← $7 $8 شهرياً ($9).',
  ],
  [/^Monthly needed for "(.*)"$/, 'المطلوب شهرياً لـ «$1»'],
  [exact('Estimated monthly net cash flow'), 'صافي التدفق النقدي الشهري المقدّر'],
  [
    exact(
      'AI is not configured (no API key): this answer was generated by deterministic rules from your data.',
    ),
    'الذكاء الاصطناعي غير مُعدّ (لا يوجد مفتاح API): أُنتجت هذه الإجابة بقواعد ثابتة من بياناتك.',
  ],
  [
    exact(
      'The AI service did not return a valid grounded answer, so deterministic rules were used.',
    ),
    'لم تُرجع خدمة الذكاء الاصطناعي إجابة صالحة ومدعومة ببياناتك، لذلك استُخدمت القواعد الثابتة.',
  ],
];

const WORDS: Record<string, string> = {
  comfortable: 'مريح',
  tight: 'ضيّق',
  'exceeds cash flow': 'يتجاوز التدفق النقدي',
  'no data': 'لا بيانات',
  'no expenses recorded': 'لا مصروفات مسجلة',
};

/** "Dining 450.00 (20%), Groceries 300.00 (13%)" -> Arabic category names. */
const translateList = (s: string): string =>
  s
    .split(', ')
    .map((part) => {
      const m = part.match(/^(.+?) ([\d.,-]+) \((.*)%\)$/);
      return m ? `${AR[m[1]!] ?? m[1]} ${m[2]} (${m[3]}%)` : (WORDS[part] ?? part);
    })
    .join('، ');

function translateLine(line: string): string {
  for (const [re, ar] of RULES) {
    const m = line.match(re);
    if (!m) continue;
    let out = ar;
    for (let i = m.length - 1; i >= 1; i--) out = out.split(`$${i}`).join(m[i] ?? '');
    return out;
  }
  return line;
}

/** Translates one server sentence (or a multi-line answer) when the UI is in Arabic. */
export function tr(text: string | null | undefined): string {
  if (!text) return '';
  if (getFormatLang() !== 'ar') return text;
  // Server notes join several sentences with a space; translate each known one on its own.
  const whole = translateLine(text);
  if (whole === text && !text.includes('\n')) {
    const parts = text.split(/(?<=\.) (?=[A-Z])/);
    if (parts.length > 1) return parts.map((p) => tr(p)).join(' ');
  }
  return text
    .split('\n')
    .map((line) => {
      const out = translateLine(line);
      if (out !== line) return out;
      // Pieces that embed a list of categories or an affordability word.
      return line
        .replace(/(Where it went: )(.*)\.$/, '$1$2.')
        .replace(
          /(\()(comfortable|tight|exceeds cash flow|no data)(\))/,
          (_m, a, w, c) => `${a}${WORDS[w] ?? w}${c}`,
        );
    })
    .map((line) =>
      line.replace(
        /أين ذهب المال: (.*)\.$/,
        (_m, list: string) => `أين ذهب المال: ${translateList(list)}.`,
      ),
    )
    .map((line) =>
      line.replace(
        /\((comfortable|tight|exceeds cash flow|no data)\)/,
        (_m, w: string) => `(${WORDS[w] ?? w})`,
      ),
    )
    .join('\n');
}
