export type BankKind = 'state' | 'private' | 'participation' | 'digital';

export interface Institution {
  id: string;
  name: string;
  kind: BankKind;
  /** Live sync is never offered until a licensed provider adapter exists (see provider.ts). */
  live: false;
}

const b = (id: string, name: string, kind: BankKind): Institution => ({
  id,
  name,
  kind,
  live: false,
});

/** Banks operating in Türkiye that a user may hold an account with. A selection list, not a coverage claim. */
export const TURKISH_BANKS: Institution[] = [
  b('ziraat', 'Ziraat Bankası', 'state'),
  b('halkbank', 'Halkbank', 'state'),
  b('vakifbank', 'VakıfBank', 'state'),
  b('isbank', 'İş Bankası', 'private'),
  b('garanti', 'Garanti BBVA', 'private'),
  b('akbank', 'Akbank', 'private'),
  b('yapikredi', 'Yapı Kredi', 'private'),
  b('qnb', 'QNB', 'private'),
  b('denizbank', 'DenizBank', 'private'),
  b('teb', 'TEB', 'private'),
  b('ing', 'ING Türkiye', 'private'),
  b('hsbc', 'HSBC Türkiye', 'private'),
  b('sekerbank', 'Şekerbank', 'private'),
  b('odeabank', 'Odeabank', 'private'),
  b('fibabanka', 'Fibabanka', 'private'),
  b('anadolubank', 'Anadolubank', 'private'),
  b('alternatif', 'Alternatif Bank', 'private'),
  b('burgan', 'Burgan Bank', 'private'),
  b('kuveytturk', 'Kuveyt Türk', 'participation'),
  b('albaraka', 'Albaraka Türk', 'participation'),
  b('turkiyefinans', 'Türkiye Finans', 'participation'),
  b('vakifkatilim', 'Vakıf Katılım', 'participation'),
  b('ziraatkatilim', 'Ziraat Katılım', 'participation'),
  b('emlakkatilim', 'Emlak Katılım', 'participation'),
  b('enpara', 'Enpara.com', 'digital'),
];
