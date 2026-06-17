/**
 * EmptyCalendar — no schedule / events yet.
 * Comic scene: a large wall calendar pinned to a fence post, blank,
 * a tiny tumble-weed (actually a cloud puff) drifting past. Alpine morning.
 */

export function EmptyCalendar({ className }: { className?: string }) {
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
        <linearGradient id="ecal-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--comic-morning, #B8D4F0)" />
          <stop offset="100%" stopColor="var(--comic-morning2, #FFE9B8)" />
        </linearGradient>
      </defs>
      <rect width="240" height="200" rx="16" fill="url(#ecal-sky)" />

      {/* sun peeking corner */}
      <circle cx="210" cy="35" r="28" fill="#F7B32B" stroke={outline} strokeWidth="2" />
      <circle cx="210" cy="35" r="22" fill="#FFE9B8" />
      {/* sun rays */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
        <line
          key={i}
          x1={210 + Math.cos((deg * Math.PI) / 180) * 30}
          y1={35 + Math.sin((deg * Math.PI) / 180) * 30}
          x2={210 + Math.cos((deg * Math.PI) / 180) * 40}
          y2={35 + Math.sin((deg * Math.PI) / 180) * 40}
          stroke="#F7B32B" strokeWidth="3" strokeLinecap="round"
        />
      ))}

      {/* fence post */}
      <rect x="108" y="80" width="24" height="118" rx="4"
        fill="var(--comic-wood, #C87A4A)" stroke={outline} strokeWidth="2.5" />
      <rect x="108" y="80" width="8" height="118" rx="4"
        fill="var(--comic-wood-light, #E8A060)" opacity="0.5" />
      {/* post top hat */}
      <rect x="104" y="74" width="32" height="10" rx="5"
        fill="var(--comic-wood-dark, #8B5030)" stroke={outline} strokeWidth="2" />

      {/* calendar sheet */}
      <rect x="46" y="58" width="148" height="118" rx="6"
        fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" />
      {/* nail/pin */}
      <circle cx="120" cy="58" r="5" fill="var(--comic-accent, #C4502A)" stroke={outline} strokeWidth="2" />
      {/* header */}
      <rect x="46" y="58" width="148" height="28" rx="6"
        fill="var(--comic-cal-header, #4A7BD0)" stroke={outline} strokeWidth="2.5" />
      <rect x="46" y="74" width="148" height="12" rx="0"
        fill="var(--comic-cal-header, #4A7BD0)" />
      {/* day labels */}
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <text
          key={i}
          x={57 + i * 20}
          y="78"
          fontFamily="system-ui, sans-serif"
          fontSize="8"
          fontWeight="bold"
          fill="white"
          textAnchor="middle"
          opacity="0.85"
        >
          {d}
        </text>
      ))}
      {/* grid */}
      {[90, 107, 124, 141, 158].map((y) => (
        <line key={y} x1="50" x2="190" y1={y} y2={y} stroke={outline} strokeWidth="0.6" opacity="0.15" />
      ))}
      {[50, 70, 90, 110, 130, 150, 170, 190].map((x) => (
        <line key={x} x1={x} x2={x} y1="88" y2="172" stroke={outline} strokeWidth="0.6" opacity="0.15" />
      ))}
      {/* empty dashed circle in center */}
      <circle cx="120" cy="130" r="20" fill="none" stroke={outline} strokeWidth="1.5"
        strokeDasharray="4 3" opacity="0.25" />
      <text x="120" y="134" fontFamily="system-ui" fontSize="9" fill={outline}
        textAnchor="middle" opacity="0.25">FREE</text>

      {/* drifting cloud puff */}
      <g transform="translate(30,115)">
        <ellipse cx="0" cy="0" rx="22" ry="14" fill="white" stroke={outline} strokeWidth="2" />
        <ellipse cx="-10" cy="-5" rx="12" ry="10" fill="white" stroke={outline} strokeWidth="2" />
        <ellipse cx="10" cy="-6" rx="14" ry="10" fill="white" stroke={outline} strokeWidth="2" />
      </g>

      {/* sparkle star */}
      <g transform="translate(28,62) scale(0.75)">
        <polygon points="0,-11 2.6,-4 9.5,-4 4.2,1.5 6.3,9 0,4.8 -6.3,9 -4.2,1.5 -9.5,-4 -2.6,-4"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
        <circle cx="-2.5" cy="0" r="1.2" fill={outline} />
        <circle cx="2.5" cy="0" r="1.2" fill={outline} />
        <path d="M-2.5,3 Q0,5.5 2.5,3" fill="none" stroke={outline} strokeWidth="1" strokeLinecap="round" />
      </g>
    </svg>
  );
}
