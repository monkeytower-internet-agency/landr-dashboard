/**
 * FirstBooking — celebration: first ever booking received!
 * Comic scene: a booking confirmation slip bursting from a phone with
 * confetti and sparkles. Triumphant energy.
 */

import { useId } from 'react'

export function FirstBooking({ className }: { className?: string }) {
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
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--comic-sky, #4A7BD0)" />
          <stop offset="100%" stopColor="var(--comic-gold, #FFE9B8)" />
        </linearGradient>
      </defs>
      <rect width="240" height="200" rx="16" fill={`url(#${uid}-sky)`} />

      {/* ground */}
      <path d="M0 170 Q60 162 120 170 Q180 178 240 165 L240 200 L0 200 Z"
        fill="var(--comic-ground, #5DA53C)" />

      {/* sun burst radiating from behind phone */}
      {[0, 22, 44, 66, 88, 110, 132, 154, 176, 198, 220, 242, 264, 286, 308, 330].map((deg, i) => (
        <line
          key={i}
          x1={120 + Math.cos((deg * Math.PI) / 180) * 30}
          y1={105 + Math.sin((deg * Math.PI) / 180) * 30}
          x2={120 + Math.cos((deg * Math.PI) / 180) * 80}
          y2={105 + Math.sin((deg * Math.PI) / 180) * 80}
          stroke="#F7B32B"
          strokeWidth={i % 3 === 0 ? 3 : 1.5}
          strokeLinecap="round"
          opacity={i % 3 === 0 ? 0.7 : 0.35}
        />
      ))}

      {/* phone body */}
      <rect x="88" y="52" width="64" height="106" rx="10"
        fill="var(--comic-phone, #2B1A0F)" stroke={outline} strokeWidth="3" />
      {/* screen */}
      <rect x="93" y="60" width="54" height="88" rx="6"
        fill="var(--comic-screen, #EDF5FF)" />
      {/* status bar */}
      <rect x="93" y="60" width="54" height="10" rx="6"
        fill="var(--comic-sky, #4A7BD0)" />
      <rect x="93" y="68" width="54" height="2" fill="var(--comic-sky, #4A7BD0)" />
      {/* camera notch */}
      <rect x="112" y="56" width="16" height="5" rx="2.5"
        fill="#1A0A04" stroke={outline} strokeWidth="1" />
      {/* home indicator */}
      <rect x="108" y="150" width="24" height="4" rx="2"
        fill="#444" />

      {/* booking confirmation card bursting out */}
      <g transform="translate(120,90) rotate(-8)">
        <rect x="-44" y="-48" width="88" height="70" rx="8"
          fill="var(--comic-surface, #FFF6E3)" stroke={outline} strokeWidth="2.5" />
        {/* checkmark circle */}
        <circle cx="0" cy="-24" r="14" fill="var(--comic-success, #5DA53C)" stroke={outline} strokeWidth="2" />
        <path d="M-7,-24 L-2,-18 L8,-30" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* confirmation text lines */}
        <rect x="-32" y="-6" width="64" height="6" rx="3" fill={outline} opacity="0.15" />
        <rect x="-24" y="6" width="48" height="5" rx="2.5" fill={outline} opacity="0.1" />
        <rect x="-16" y="16" width="32" height="5" rx="2.5" fill={outline} opacity="0.1" />
      </g>

      {/* confetti pieces */}
      {[
        { x: 42, y: 55, color: "#D9486E", r: 6, rot: 25 },
        { x: 28, y: 80, color: "#F7B32B", r: 5, rot: 55 },
        { x: 50, y: 108, color: "#4A7BD0", r: 5, rot: 10 },
        { x: 198, y: 60, color: "#5DA53C", r: 5, rot: 70 },
        { x: 212, y: 88, color: "#D9486E", r: 6, rot: 40 },
        { x: 192, y: 118, color: "#F7B32B", r: 5, rot: 15 },
        { x: 60, y: 38, color: "#5DA53C", r: 4, rot: 80 },
        { x: 185, y: 38, color: "#C4502A", r: 4, rot: 35 },
        { x: 35, y: 138, color: "#4A7BD0", r: 4, rot: 60 },
        { x: 210, y: 138, color: "#5DA53C", r: 4, rot: 20 },
      ].map(({ x, y, color, r, rot }, i) => (
        <g key={i} transform={`rotate(${rot},${x},${y})`}>
          <rect x={x - r} y={y - r / 2} width={r * 2} height={r}
            rx={r / 3} fill={color} stroke={outline} strokeWidth="1" />
        </g>
      ))}

      {/* sparkle stars */}
      <g transform="translate(30,52)">
        <polygon points="0,-12 2.8,-4.5 10,-4.5 4.5,1.6 6.8,9.5 0,5.2 -6.8,9.5 -4.5,1.6 -10,-4.5 -2.8,-4.5"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
        <circle cx="-2.5" cy="0" r="1.2" fill={outline} />
        <circle cx="2.5" cy="0" r="1.2" fill={outline} />
        <path d="M-2.5,3 Q0,5.5 2.5,3" fill="none" stroke={outline} strokeWidth="1" strokeLinecap="round" />
      </g>
      <g transform="translate(212,52) scale(0.8)">
        <polygon points="0,-12 2.8,-4.5 10,-4.5 4.5,1.6 6.8,9.5 0,5.2 -6.8,9.5 -4.5,1.6 -10,-4.5 -2.8,-4.5"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
      </g>

      {/* "ding!" text badge */}
      <g transform="translate(168, 62) rotate(12)">
        <rect x="-22" y="-12" width="44" height="22" rx="11"
          fill="#F7B32B" stroke={outline} strokeWidth="2" />
        <text fontFamily="system-ui" fontSize="11" fontWeight="900" fill={outline}
          textAnchor="middle" y="5">DING!</text>
      </g>
    </svg>
  );
}
