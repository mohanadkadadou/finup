/** Approximation of the FinUp "F" mark. Replace with the official SVG asset when available. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="fu-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#00e676" />
          <stop offset="1" stopColor="#8dffbd" />
        </linearGradient>
      </defs>
      <path
        d="M5 28 L10.5 9.5 Q12 5 17 5 H30 L28.4 10.6 H18 Q16.5 10.6 16 12 L15.5 13.8 H26 L24.4 19.2 H14 L11.2 28 Z"
        fill="url(#fu-g)"
      />
    </svg>
  );
}

export const Wordmark = () => (
  <span>
    Fin<span style={{ color: '#00e676' }}>Up</span>
  </span>
);
