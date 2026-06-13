/**
 * EmptyProducts — no products / flights listed yet.
 * Comic scene: an empty tag-price label with a paraglider wing icon,
 * sitting on a wooden shelf, alpine background.
 */

export function EmptyProducts({ className }: { className?: string }) {
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
        <linearGradient id="ep-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--comic-sky, #7FA8E8)" />
          <stop offset="80%" stopColor="var(--comic-sky2, #FFE9B8)" />
        </linearGradient>
      </defs>
      <rect width="240" height="200" rx="16" fill="url(#ep-sky)" />

      {/* mountains */}
      <path d="M0 145 L40 90 L80 145 Z" fill="var(--comic-mountain, #5DA53C)" stroke={outline} strokeWidth="2" />
      <path d="M60 145 L110 75 L160 145 Z" fill="var(--comic-mountain2, #2E6B3E)" stroke={outline} strokeWidth="2" />
      <path d="M140 145 L185 95 L230 145 Z" fill="var(--comic-mountain, #5DA53C)" stroke={outline} strokeWidth="2" />
      {/* mountain snow caps */}
      <path d="M40 90 L52 105 L28 105 Z" fill="var(--comic-snow, #FFF6E3)" stroke={outline} strokeWidth="1.5" />
      <path d="M110 75 L126 95 L94 95 Z" fill="var(--comic-snow, #FFF6E3)" stroke={outline} strokeWidth="1.5" />
      <path d="M185 95 L198 112 L172 112 Z" fill="var(--comic-snow, #FFF6E3)" stroke={outline} strokeWidth="1.5" />

      {/* wooden shelf */}
      <rect x="20" y="148" width="200" height="14" rx="4"
        fill="var(--comic-wood, #C87A4A)" stroke={outline} strokeWidth="2.5" />
      {/* wood grain */}
      <line x1="40" y1="149" x2="38" y2="161" stroke={outline} strokeWidth="0.8" opacity="0.3" />
      <line x1="80" y1="149" x2="78" y2="161" stroke={outline} strokeWidth="0.8" opacity="0.3" />
      <line x1="120" y1="149" x2="118" y2="161" stroke={outline} strokeWidth="0.8" opacity="0.3" />
      <line x1="160" y1="149" x2="158" y2="161" stroke={outline} strokeWidth="0.8" opacity="0.3" />
      <line x1="200" y1="149" x2="198" y2="161" stroke={outline} strokeWidth="0.8" opacity="0.3" />

      {/* big price tag (empty) hanging from shelf */}
      <line x1="120" y1="148" x2="120" y2="130" stroke={outline} strokeWidth="1.5" strokeDasharray="3 2" />
      <path d="M88 80 L88 130 Q88 136 94 136 L146 136 Q152 136 152 130 L152 80 L120 62 Z"
        fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
      {/* hole for string */}
      <circle cx="120" cy="74" r="5" fill="var(--comic-sky, #7FA8E8)" stroke={outline} strokeWidth="2" />
      {/* paraglider wing icon on tag */}
      <path d="M100 104 Q120 92 140 104 L137 110 Q120 98 103 110 Z"
        fill="var(--comic-accent, #C4502A)" stroke={outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M100 104 Q120 93 140 104 L138 107 Q120 96 102 107 Z"
        fill="var(--comic-accent-light, #E8702E)" opacity="0.5" />
      {/* empty price line */}
      <line x1="100" y1="122" x2="140" y2="122" stroke={outline} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.3" />

      {/* small star */}
      <g transform="translate(205,55) scale(0.9)">
        <polygon points="0,-11 2.6,-4 9.5,-4 4.2,1.5 6.3,9 0,4.8 -6.3,9 -4.2,1.5 -9.5,-4 -2.6,-4"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
        <circle cx="-2.5" cy="0" r="1.2" fill={outline} />
        <circle cx="2.5" cy="0" r="1.2" fill={outline} />
        <path d="M-2.5,3 Q0,5.5 2.5,3" fill="none" stroke={outline} strokeWidth="1" strokeLinecap="round" />
      </g>
    </svg>
  );
}
