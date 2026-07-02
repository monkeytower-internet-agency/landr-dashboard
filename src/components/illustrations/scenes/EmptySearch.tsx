/**
 * EmptySearch — no search results.
 * Comic scene: giant magnifying glass over empty meadow with the mascot
 * peeking through the lens looking confused.
 */

import { useId } from 'react'

export function EmptySearch({ className }: { className?: string }) {
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
          <stop offset="0%" stopColor="var(--comic-sky, #7FA8E8)" />
          <stop offset="100%" stopColor="var(--comic-sky2, #FFE9B8)" />
        </linearGradient>
        <clipPath id={`${uid}-lens`}>
          <circle cx="100" cy="95" r="62" />
        </clipPath>
      </defs>
      <rect width="240" height="200" rx="16" fill={`url(#${uid}-sky)`} />

      {/* inside lens — own mini-sky */}
      <g clipPath={`url(#${uid}-lens)`}>
        <rect x="38" y="33" width="124" height="124" fill="var(--comic-lens-bg, #EDF5FF)" />
        {/* tiny meadow inside */}
        <rect x="38" y="130" width="124" height="30" fill="var(--comic-ground, #5DA53C)" />
        {/* question marks inside */}
        <text x="72" y="85" fontFamily="system-ui" fontSize="28" fontWeight="900"
          fill={outline} opacity="0.08">?</text>
        <text x="95" y="105" fontFamily="system-ui" fontSize="22" fontWeight="900"
          fill={outline} opacity="0.06">?</text>
        <text x="120" y="78" fontFamily="system-ui" fontSize="18" fontWeight="900"
          fill={outline} opacity="0.06">?</text>
        {/* tiny mascot face in lens */}
        <ellipse cx="100" cy="108" rx="22" ry="20" fill="var(--comic-skin, #E8A87C)" />
        {/* cap */}
        <path d="M80 102 Q100 94 120 102 L118 106 Q100 98 82 106 Z"
          fill="var(--comic-cap, #4A7BD0)" stroke={outline} strokeWidth="2" />
        <path d="M78 108 Q100 103 122 108" fill="none" stroke="var(--comic-cap, #4A7BD0)" strokeWidth="6"
          strokeLinecap="round" />
        {/* glasses */}
        <rect x="84" y="106" width="14" height="10" rx="4"
          fill="var(--comic-lens-tint, #B8D4F0)" stroke={outline} strokeWidth="2" />
        <rect x="102" y="106" width="14" height="10" rx="4"
          fill="var(--comic-lens-tint, #B8D4F0)" stroke={outline} strokeWidth="2" />
        <line x1="98" y1="110" x2="102" y2="110" stroke={outline} strokeWidth="2" />
        {/* puzzled mouth */}
        <path d="M90 120 Q100 116 110 120" fill="none" stroke={outline} strokeWidth="2" strokeLinecap="round" />
        {/* sweat drop */}
        <path d="M122 104 Q124 108 122 112 Q120 108 122 104 Z"
          fill="#7FA8E8" stroke={outline} strokeWidth="1" />
      </g>

      {/* magnifying glass frame */}
      <circle cx="100" cy="95" r="62"
        fill="none" stroke={outline} strokeWidth="5" />
      {/* lens glare */}
      <ellipse cx="70" cy="68" rx="14" ry="9"
        fill="white" opacity="0.3" transform="rotate(-30,70,68)" />
      {/* handle */}
      <path d="M148 143 L195 182"
        stroke="var(--comic-wood, #C87A4A)" strokeWidth="14" strokeLinecap="round" />
      <path d="M148 143 L195 182"
        stroke="var(--comic-wood-light, #E8A060)" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
      <path d="M148 143 L195 182"
        stroke={outline} strokeWidth="2" strokeLinecap="round" />

      {/* star */}
      <g transform="translate(208,42)">
        <polygon points="0,-11 2.6,-4 9.5,-4 4.2,1.5 6.3,9 0,4.8 -6.3,9 -4.2,1.5 -9.5,-4 -2.6,-4"
          fill="#F7B32B" stroke={outline} strokeWidth="1.5" />
        <circle cx="-2.5" cy="0" r="1.2" fill={outline} />
        <circle cx="2.5" cy="0" r="1.2" fill={outline} />
        <path d="M-2.5,3 Q0,5.5 2.5,3" fill="none" stroke={outline} strokeWidth="1" strokeLinecap="round" />
      </g>
    </svg>
  );
}
