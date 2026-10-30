const PATHS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  insights: 'M4 19V9m6 10V5m6 14v-7m4 7H2',
  upload: 'M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v4.5h16V15',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  analytics: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  planner: 'M6 6h15l-1.5 9h-12zM6 6 5 3H2M9 20h.01M18 20h.01',
  budgets: 'M3 7h18v12H3zM3 7l2-3h12M16 13h2',
  goals: 'M5 21V4m0 0h12l-2 4 2 4H5',
  assistant: 'M4 5h16v11H9l-5 4z',
  accounts: 'M3 10 12 4l9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18',
  settings: 'M4 7h10m4 0h2M4 17h4m4 0h8M14 5v4m-6 6v4',
  up: 'M7 17 17 7M9 7h8v8',
  down: 'M7 7l10 10M17 9v8H9',
};

export function Icon({ name, size = 22 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.menu} />
    </svg>
  );
}
