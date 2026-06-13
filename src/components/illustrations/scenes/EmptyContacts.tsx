/**
 * EmptyContacts — no contacts yet.
 * Comic scene: an open address book with blank pages, a tiny ghost
 * floating out of it, meadow backdrop.
 */

export function EmptyContacts({ className }: { className?: string }) {
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
        <linearGradient id="ec-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--comic-sky, #B8D4F0)" />
          <stop offset="100%" stopColor="var(--comic-sky2, #FFE9B8)" />
        </linearGradient>
      </defs>
      <rect width="240" height="200" rx="16" fill="url(#ec-sky)" />
      {/* ground */}
      <ellipse cx="120" cy="185" rx="100" ry="20" fill="var(--comic-ground, #5DA53C)" />
      <ellipse cx="120" cy="190" rx="90" ry="16" fill="var(--comic-ground-dark, #2E6B3E)" />

      {/* open address book (two pages) */}
      {/* spine */}
      <rect x="110" y="48" width="20" height="120" rx="4"
        fill="var(--comic-spine, #C4502A)" stroke={outline} strokeWidth="2.5" />
      {/* left page */}
      <path d="M110 52 Q70 48 50 55 L50 162 Q70 168 110 162 Z"
        fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
      {/* right page */}
      <path d="M130 52 Q170 48 190 55 L190 162 Q170 168 130 162 Z"
        fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
      {/* page lines left */}
      {[80, 96, 112, 128, 144].map((y) => (
        <line key={y} x1="60" x2="105" y1={y} y2={y} stroke={outline} strokeWidth="1" opacity="0.2" />
      ))}
      {/* avatar circles (empty) left */}
      <circle cx="65" cy="75" r="10" fill="none" stroke={outline} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.3" />
      <circle cx="65" cy="107" r="10" fill="none" stroke={outline} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.3" />
      <circle cx="65" cy="139" r="10" fill="none" stroke={outline} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.3" />
      {/* page lines right */}
      {[80, 96, 112, 128, 144].map((y) => (
        <line key={y} x1="135" x2="180" y1={y} y2={y} stroke={outline} strokeWidth="1" opacity="0.2" />
      ))}
      <circle cx="145" cy="75" r="10" fill="none" stroke={outline} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.3" />
      <circle cx="145" cy="107" r="10" fill="none" stroke={outline} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.3" />
      <circle cx="145" cy="139" r="10" fill="none" stroke={outline} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.3" />

      {/* index tabs on spine */}
      {[65, 80, 95, 110, 125, 140].map((y) => (
        <rect key={y} x="108" y={y} width="6" height="10" rx="3"
          fill={`hsl(${y * 3} 70% 55%)`} stroke={outline} strokeWidth="1" />
      ))}

      {/* friendly ghost floating out */}
      <g transform="translate(120,30)">
        <path d="M-18,-20 Q-22,-38 0,-40 Q22,-38 18,-20 L18,8 Q14,14 10,8 Q6,14 0,8 Q-6,14 -10,8 Q-14,14 -18,8 Z"
          fill="white" stroke={outline} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="-7" cy="-26" r="3" fill={outline} />
        <circle cx="7" cy="-26" r="3" fill={outline} />
        <path d="M-6,-16 Q0,-12 6,-16" fill="none" stroke={outline} strokeWidth="1.5" strokeLinecap="round" />
        {/* ghost glow */}
        <ellipse cx="0" cy="-25" rx="12" ry="10" fill="white" opacity="0.2" />
      </g>

      {/* sparkle */}
      <g transform="translate(205,42) scale(0.8)">
        <polygon points="0,-11 2.6,-4 9.5,-4 4.2,1.5 6.3,9 0,4.8 -6.3,9 -4.2,1.5 -9.5,-4 -2.6,-4"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
      </g>
      <line x1="200" y1="55" x2="208" y2="50" stroke="#F7B32B" strokeWidth="2" strokeLinecap="round" />
      <line x1="198" y1="60" x2="207" y2="60" stroke="#F7B32B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
