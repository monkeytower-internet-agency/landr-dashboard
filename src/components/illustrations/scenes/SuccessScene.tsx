/**
 * SuccessScene — action completed / booking confirmed.
 * Comic scene: a giant golden trophy cup with paraglider wings, confetti
 * explosion, sparkle stars everywhere. Sunny alpine backdrop.
 */

export function SuccessScene({ className }: { className?: string }) {
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
        <linearGradient id="ss-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--comic-success-sky, #7FA8E8)" />
          <stop offset="100%" stopColor="var(--comic-gold, #FFE9B8)" />
        </linearGradient>
        <linearGradient id="ss-trophy" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#E8A000" />
          <stop offset="50%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#E8A000" />
        </linearGradient>
      </defs>
      <rect width="240" height="200" rx="16" fill="url(#ss-sky)" />

      {/* ground */}
      <path d="M0 168 Q60 158 120 165 Q180 172 240 162 L240 200 L0 200 Z"
        fill="var(--comic-ground, #5DA53C)" />
      <path d="M0 182 Q60 172 120 179 Q180 186 240 176 L240 200 L0 200 Z"
        fill="var(--comic-ground-dark, #2E6B3E)" />

      {/* sun burst behind trophy */}
      {[0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340].map((deg, i) => (
        <line
          key={i}
          x1={120 + Math.cos((deg * Math.PI) / 180) * 40}
          y1={108 + Math.sin((deg * Math.PI) / 180) * 40}
          x2={120 + Math.cos((deg * Math.PI) / 180) * 90}
          y2={108 + Math.sin((deg * Math.PI) / 180) * 90}
          stroke="#F7B32B"
          strokeWidth={i % 2 === 0 ? 3 : 1.5}
          strokeLinecap="round"
          opacity={i % 2 === 0 ? 0.6 : 0.3}
        />
      ))}

      {/* trophy cup */}
      {/* base */}
      <rect x="98" y="153" width="44" height="8" rx="4"
        fill="url(#ss-trophy)" stroke={outline} strokeWidth="2.5" />
      <rect x="88" y="158" width="64" height="10" rx="5"
        fill="url(#ss-trophy)" stroke={outline} strokeWidth="2.5" />
      {/* stem */}
      <rect x="112" y="138" width="16" height="20" rx="4"
        fill="url(#ss-trophy)" stroke={outline} strokeWidth="2.5" />
      {/* cup body */}
      <path d="M72 72 Q68 115 88 135 Q100 145 120 145 Q140 145 152 135 Q172 115 168 72 Z"
        fill="url(#ss-trophy)" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
      {/* cup inner shadow */}
      <path d="M80 80 Q78 110 92 130 Q104 140 120 140"
        fill="none" stroke="#C87A00" strokeWidth="6" opacity="0.35" strokeLinecap="round" />
      {/* handles */}
      <path d="M72 80 Q52 80 52 100 Q52 120 72 118"
        fill="none" stroke="url(#ss-trophy)" strokeWidth="12" strokeLinecap="round" />
      <path d="M72 80 Q52 80 52 100 Q52 120 72 118"
        fill="none" stroke={outline} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M168 80 Q188 80 188 100 Q188 120 168 118"
        fill="none" stroke="url(#ss-trophy)" strokeWidth="12" strokeLinecap="round" />
      <path d="M168 80 Q188 80 188 100 Q188 120 168 118"
        fill="none" stroke={outline} strokeWidth="2.5" strokeLinecap="round" />
      {/* paraglider wing inside cup */}
      <path d="M95 108 Q120 94 145 108 L142 114 Q120 100 98 114 Z"
        fill="var(--comic-accent, #C4502A)" stroke={outline} strokeWidth="2" />
      {/* lines from wing */}
      <line x1="110" y1="114" x2="115" y2="125" stroke={outline} strokeWidth="1" />
      <line x1="120" y1="112" x2="120" y2="126" stroke={outline} strokeWidth="1" />
      <line x1="130" y1="114" x2="125" y2="125" stroke={outline} strokeWidth="1" />

      {/* confetti */}
      {[
        { x: 35, y: 50, color: "#D9486E", r: 5 },
        { x: 55, y: 35, color: "#4A7BD0", r: 4 },
        { x: 25, y: 75, color: "#F7B32B", r: 6 },
        { x: 205, y: 48, color: "#5DA53C", r: 5 },
        { x: 218, y: 70, color: "#D9486E", r: 4 },
        { x: 195, y: 30, color: "#F7B32B", r: 6 },
        { x: 45, y: 140, color: "#4A7BD0", r: 4 },
        { x: 210, y: 140, color: "#5DA53C", r: 4 },
      ].map(({ x, y, color, r }, i) => (
        <g key={i} transform={`rotate(${i * 37},${x},${y})`}>
          <rect x={x - r} y={y - r / 2} width={r * 2} height={r}
            rx={r / 4} fill={color} stroke={outline} strokeWidth="1" />
        </g>
      ))}

      {/* sparkle stars */}
      <g transform="translate(42,58)">
        <polygon points="0,-12 2.8,-4.5 10,-4.5 4.5,1.6 6.8,9.5 0,5.2 -6.8,9.5 -4.5,1.6 -10,-4.5 -2.8,-4.5"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
        <circle cx="-2.5" cy="0" r="1.2" fill={outline} />
        <circle cx="2.5" cy="0" r="1.2" fill={outline} />
        <path d="M-2.5,3 Q0,5.5 2.5,3" fill="none" stroke={outline} strokeWidth="1" strokeLinecap="round" />
      </g>
      <g transform="translate(198,58) scale(0.8)">
        <polygon points="0,-12 2.8,-4.5 10,-4.5 4.5,1.6 6.8,9.5 0,5.2 -6.8,9.5 -4.5,1.6 -10,-4.5 -2.8,-4.5"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
      </g>
      <g transform="translate(35,108) scale(0.6)">
        <polygon points="0,-12 2.8,-4.5 10,-4.5 4.5,1.6 6.8,9.5 0,5.2 -6.8,9.5 -4.5,1.6 -10,-4.5 -2.8,-4.5"
          fill="#C4502A" stroke={outline} strokeWidth="1.5" />
      </g>
      <g transform="translate(210,108) scale(0.6)">
        <polygon points="0,-12 2.8,-4.5 10,-4.5 4.5,1.6 6.8,9.5 0,5.2 -6.8,9.5 -4.5,1.6 -10,-4.5 -2.8,-4.5"
          fill="#C4502A" stroke={outline} strokeWidth="1.5" />
      </g>
    </svg>
  );
}
