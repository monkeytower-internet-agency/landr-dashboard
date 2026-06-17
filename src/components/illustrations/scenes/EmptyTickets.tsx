/**
 * EmptyTickets — no support tickets / messages.
 * Comic scene: two blank speech-bubble tickets floating, a tiny inbox tray,
 * star in the sky.
 */

export function EmptyTickets({ className }: { className?: string }) {
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
        <linearGradient id="et-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--comic-sky, #B8D4F0)" />
          <stop offset="100%" stopColor="var(--comic-gold, #FFE9B8)" />
        </linearGradient>
      </defs>
      <rect width="240" height="200" rx="16" fill="url(#et-sky)" />

      {/* meadow strip */}
      <path d="M0 168 Q60 158 120 168 Q180 178 240 168 L240 200 L0 200 Z"
        fill="var(--comic-ground, #5DA53C)" stroke="none" />
      <path d="M0 180 Q60 170 120 180 Q180 190 240 180 L240 200 L0 200 Z"
        fill="var(--comic-ground-dark, #2E6B3E)" stroke="none" />

      {/* inbox tray */}
      <path d="M65 148 L65 125 Q65 120 70 120 L170 120 Q175 120 175 125 L175 148 Z"
        fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
      {/* tray divider */}
      <line x1="65" y1="135" x2="175" y2="135" stroke={outline} strokeWidth="1.5" opacity="0.3" />
      {/* tray label */}
      <rect x="90" y="125" width="60" height="8" rx="3" fill={outline} opacity="0.08" />
      {/* tray rim */}
      <rect x="65" y="145" width="110" height="6" rx="3"
        fill="var(--comic-wood, #C87A4A)" stroke={outline} strokeWidth="2" />

      {/* speech bubble ticket — left, slightly tilted */}
      <g transform="rotate(-8,95,90)">
        <path d="M54 55 Q54 45 64 45 L126 45 Q136 45 136 55 L136 95 Q136 105 126 105 L90 105 L82 118 L78 105 L64 105 Q54 105 54 95 Z"
          fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
        {/* empty lines inside bubble */}
        <line x1="64" y1="65" x2="126" y2="65" stroke={outline} strokeWidth="1.5" opacity="0.2" />
        <line x1="64" y1="78" x2="116" y2="78" stroke={outline} strokeWidth="1.5" opacity="0.2" />
        <line x1="64" y1="91" x2="100" y2="91" stroke={outline} strokeWidth="1.5" opacity="0.2" />
        {/* ticket number stub */}
        <rect x="110" y="88" width="20" height="12" rx="3"
          fill="var(--comic-accent, #C4502A)" opacity="0.25" stroke={outline} strokeWidth="1" />
      </g>

      {/* speech bubble ticket — right, tilted other way */}
      <g transform="rotate(6,158,78)">
        <path d="M118 42 Q118 32 128 32 L178 32 Q188 32 188 42 L188 78 Q188 88 178 88 L158 88 L150 100 L146 88 L128 88 Q118 88 118 78 Z"
          fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
        <line x1="128" y1="50" x2="178" y2="50" stroke={outline} strokeWidth="1.5" opacity="0.2" />
        <line x1="128" y1="62" x2="170" y2="62" stroke={outline} strokeWidth="1.5" opacity="0.2" />
        <line x1="128" y1="74" x2="155" y2="74" stroke={outline} strokeWidth="1.5" opacity="0.2" />
        <rect x="160" y="70" width="16" height="10" rx="3"
          fill="var(--comic-sky, #4A7BD0)" opacity="0.25" stroke={outline} strokeWidth="1" />
      </g>

      {/* star */}
      <g transform="translate(28,55)">
        <polygon points="0,-11 2.6,-4 9.5,-4 4.2,1.5 6.3,9 0,4.8 -6.3,9 -4.2,1.5 -9.5,-4 -2.6,-4"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
        <circle cx="-2.5" cy="0" r="1.2" fill={outline} />
        <circle cx="2.5" cy="0" r="1.2" fill={outline} />
        <path d="M-2.5,3 Q0,5.5 2.5,3" fill="none" stroke={outline} strokeWidth="1" strokeLinecap="round" />
      </g>
      <g transform="translate(210,105) scale(0.7)">
        <polygon points="0,-11 2.6,-4 9.5,-4 4.2,1.5 6.3,9 0,4.8 -6.3,9 -4.2,1.5 -9.5,-4 -2.6,-4"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
      </g>
    </svg>
  );
}
