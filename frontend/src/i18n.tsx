import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AR } from './ar';
import { setFormatLang } from './format';

export type Lang = 'en' | 'ar';
type Vars = Record<string, string | number>;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** English text is the key. Missing Arabic entries fall back to English. `{name}` placeholders are filled from vars. */
  t: (en: string, vars?: Vars) => string;
  locale: string;
}

const KEY = 'finup.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    /* storage unavailable */
  }
  return 'ar';
}

const Ctx = createContext<I18n>({ lang: 'ar', setLang: () => {}, t: (s) => s, locale: 'ar' });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  setFormatLang(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
    setLangState(l);
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en',
      t: (en, vars) => {
        const s = (lang === 'ar' ? AR[en] : undefined) ?? en;
        return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s;
      },
    }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = (): I18n => useContext(Ctx);

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <button
      type="button"
      className={className ?? 'lang-switch'}
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
    >
      {lang === 'ar' ? 'English' : 'العربية'}
    </button>
  );
}
