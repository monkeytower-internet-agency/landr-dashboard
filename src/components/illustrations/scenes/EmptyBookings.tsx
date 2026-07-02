/**
 * EmptyBookings — no bookings yet.
 * Comic scene: a blank calendar page with a lonely paraglider wing floating above it,
 * meadow-green ground strip, sparkle star top-right.
 *
 * Uses --comic-bookings hue (or fallback #4A7BD0 sky-blue).
 */

import { useId } from 'react'

export function EmptyBookings({ className }: { className?: string }) {
  const outline = "#2B1A0F";
  const uid = useId();

  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* sky backdrop gradient */}
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--comic-bookings-sky, #7FA8E8)" />
          <stop offset="100%" stopColor="var(--comic-bookings-sky2, #FFE9B8)" />
        </linearGradient>
      </defs>
      <rect width="240" height="200" rx="16" fill={`url(#${uid}-sky)`} />

      {/* ground strip */}
      <rect x="0" y="162" width="240" height="38" rx="0" fill="var(--comic-ground, #5DA53C)" />
      <rect x="0" y="178" width="240" height="22" rx="0" fill="var(--comic-ground-dark, #2E6B3E)" />
      <path d="M0 162 Q60 155 120 162 Q180 169 240 162" fill="var(--comic-ground, #5DA53C)" stroke="none" />

      {/* big calendar page */}
      <rect x="55" y="38" width="130" height="115" rx="8"
        fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" />
      {/* calendar header bar */}
      <rect x="55" y="38" width="130" height="26" rx="8"
        fill="var(--comic-bookings-sky, #4A7BD0)" stroke={outline} strokeWidth="2.5" />
      <rect x="55" y="52" width="130" height="12" rx="0"
        fill="var(--comic-bookings-sky, #4A7BD0)" />
      {/* ring holes */}
      <circle cx="90" cy="38" r="5" fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2" />
      <circle cx="120" cy="38" r="5" fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2" />
      <circle cx="150" cy="38" r="5" fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2" />
      {/* month label */}
      <rect x="80" y="44" width="80" height="10" rx="3" fill="var(--comic-bookings-sky2, #7FA8E8)" opacity="0.5" />
      {/* grid lines (empty) */}
      {[76, 92, 108, 124, 140].map((y) => (
        <line key={y} x1="65" x2="175" y1={y} y2={y} stroke={outline} strokeWidth="0.8" opacity="0.2" />
      ))}
      {[65, 97, 129, 161, 175].map((x) => (
        <line key={x} x1={x} x2={x} y1="64" y2="148" stroke={outline} strokeWidth="0.8" opacity="0.2" />
      ))}
      {/* sad empty circle in middle of calendar */}
      <circle cx="120" cy="106" r="18" fill="none" stroke={outline} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.35" />
      <circle cx="115" cy="102" r="1.8" fill={outline} opacity="0.35" />
      <circle cx="125" cy="102" r="1.8" fill={outline} opacity="0.35" />
      <path d="M113 111 Q120 106 127 111" fill="none" stroke={outline} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />

      {/* floating paraglider wing (cel-shaded) */}
      <path d="M88 28 Q120 12 152 28 L148 36 Q120 22 92 36 Z"
        fill="var(--comic-accent, #C4502A)" stroke={outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M88 28 Q120 14 152 28 L149 31 Q120 18 91 31 Z"
        fill="var(--comic-accent-light, #E8702E)" opacity="0.55" />
      {/* suspension lines */}
      <line x1="104" y1="36" x2="112" y2="48" stroke={outline} strokeWidth="1" />
      <line x1="120" y1="34" x2="120" y2="48" stroke={outline} strokeWidth="1" />
      <line x1="136" y1="36" x2="128" y2="48" stroke={outline} strokeWidth="1" />
      {/* tiny pilot dot */}
      <circle cx="120" cy="50" r="4" fill="var(--comic-skin, #E8A87C)" stroke={outline} strokeWidth="1.5" />

      {/* sparkle stars */}
      <g transform="translate(198,28)">
        <polygon points="0,-11 2.6,-4 9.5,-4 4.2,1.5 6.3,9 0,4.8 -6.3,9 -4.2,1.5 -9.5,-4 -2.6,-4"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
        {/* smiley on star */}
        <circle cx="-2.5" cy="0" r="1.2" fill={outline} />
        <circle cx="2.5" cy="0" r="1.2" fill={outline} />
        <path d="M-2.5,3 Q0,5.5 2.5,3" fill="none" stroke={outline} strokeWidth="1" strokeLinecap="round" />
      </g>
      <g transform="translate(30,50) scale(0.7)">
        <polygon points="0,-11 2.6,-4 9.5,-4 4.2,1.5 6.3,9 0,4.8 -6.3,9 -4.2,1.5 -9.5,-4 -2.6,-4"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
      </g>

      {/* comic emphasis lines */}
      <line x1="198" y1="42" x2="205" y2="35" stroke="#F7B32B" strokeWidth="2" strokeLinecap="round" />
      <line x1="196" y1="48" x2="204" y2="46" stroke="#F7B32B" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
