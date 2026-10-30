import { useT } from '../i18n';

/** One emoji and one colour per category so any transaction shows where the money went at a glance. */
export const CAT_STYLE: Record<string, { icon: string; color: string }> = {
  Groceries: { icon: '🛒', color: '#1f9d55' },
  Dining: { icon: '🍽️', color: '#e8590c' },
  Transport: { icon: '🚌', color: '#2f80ed' },
  Housing: { icon: '🏠', color: '#0f4d3e' },
  Utilities: { icon: '💡', color: '#c99700' },
  Subscriptions: { icon: '🔁', color: '#7b3fe4' },
  Shopping: { icon: '🛍️', color: '#d6336c' },
  Health: { icon: '❤️', color: '#e03131' },
  Entertainment: { icon: '🎬', color: '#9c36b5' },
  Travel: { icon: '✈️', color: '#1098ad' },
  Education: { icon: '🎓', color: '#3b5bdb' },
  Fees: { icon: '🏦', color: '#868e96' },
  Transfers: { icon: '↔️', color: '#5c7cfa' },
  Salary: { icon: '💼', color: '#099268' },
  Income: { icon: '💰', color: '#2b8a3e' },
  Uncategorized: { icon: '❔', color: '#868e96' },
};

export function CategoryChip({ category }: { category: string }) {
  const { t } = useT();
  const s = CAT_STYLE[category] ?? CAT_STYLE.Uncategorized!;
  return (
    <span className="cat-chip" style={{ ['--c' as string]: s.color }} title={t(category)}>
      <span aria-hidden="true">{s.icon}</span>
      {t(category)}
    </span>
  );
}
