/**
 * ErrorScene — something went wrong.
 * Comic scene: a crumpled error note impaled on a fence post with a lightning
 * bolt, the mascot looking startled (shrug/empty pose flavor).
 */

export function ErrorScene({ className }: { className?: string }) {
  const outline = "#2B1A0F";

  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="err-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--comic-error-sky, #D9486E)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--comic-gold, #FFE9B8)" />
        </linearGradient>
      </defs>
      <rect width="240" height="200" rx="16" fill="url(#err-sky)" />

      {/* stormy cloud */}
      <g transform="translate(120,42)">
        <ellipse cx="0" cy="0" rx="48" ry="24" fill="var(--comic-cloud, #8898B0)" stroke={outline} strokeWidth="2.5" />
        <ellipse cx="-22" cy="-10" rx="26" ry="18" fill="var(--comic-cloud, #8898B0)" stroke={outline} strokeWidth="2" />
        <ellipse cx="22" cy="-10" rx="28" ry="20" fill="var(--comic-cloud, #8898B0)" stroke={outline} strokeWidth="2" />
        <ellipse cx="0" cy="-14" rx="20" ry="16" fill="var(--comic-cloud, #8898B0)" stroke={outline} strokeWidth="2" />
        {/* lightning bolt */}
        <path d="M8,-2 L-2,14 L6,14 L-6,30 L12,10 L4,10 Z"
          fill="#F7B32B" stroke={outline} strokeWidth="2" strokeLinejoin="round" />
      </g>

      {/* ground */}
      <path d="M0 170 Q120 160 240 170 L240 200 L0 200 Z"
        fill="var(--comic-ground, #5DA53C)" />
      <path d="M0 182 Q120 172 240 182 L240 200 L0 200 Z"
        fill="var(--comic-ground-dark, #2E6B3E)" />

      {/* crumpled paper */}
      <path d="M75 95 Q72 82 88 78 L158 82 Q170 84 168 97 L165 148 Q162 158 150 156 L88 152 Q76 150 78 140 Z"
        fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
      {/* crumple lines */}
      <path d="M88 95 Q100 88 115 96 Q128 104 142 92" fill="none" stroke={outline}
        strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
      <path d="M80 115 Q95 108 108 118" fill="none" stroke={outline}
        strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
      <path d="M145 118 Q158 112 162 125" fill="none" stroke={outline}
        strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
      {/* error X */}
      <line x1="102" y1="105" x2="138" y2="135" stroke="var(--comic-error, #D9486E)" strokeWidth="5" strokeLinecap="round" />
      <line x1="138" y1="105" x2="102" y2="135" stroke="var(--comic-error, #D9486E)" strokeWidth="5" strokeLinecap="round" />
      {/* exclamation */}
      <rect x="118" y="108" width="4" height="18" rx="2" fill="var(--comic-error, #D9486E)" />
      <circle cx="120" cy="131" r="2.5" fill="var(--comic-error, #D9486E)" />

      {/* alarm sparks around paper */}
      <line x1="70" y1="90" x2="62" y2="82" stroke="#D9486E" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="68" y1="100" x2="58" y2="98" stroke="#D9486E" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="172" y1="88" x2="180" y2="80" stroke="#D9486E" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="174" y1="100" x2="183" y2="98" stroke="#D9486E" strokeWidth="2.5" strokeLinecap="round" />

      {/* star (subdued in error) */}
      <g transform="translate(30,62) scale(0.75)">
        <polygon points="0,-11 2.6,-4 9.5,-4 4.2,1.5 6.3,9 0,4.8 -6.3,9 -4.2,1.5 -9.5,-4 -2.6,-4"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" opacity="0.7" />
      </g>
    </svg>
  );
}
