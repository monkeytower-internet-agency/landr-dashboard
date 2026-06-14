/**
 * OnboardingHero — welcome / first-time setup hero illustration.
 * Comic scene: wide alpine valley at golden hour, paraglider wing in
 * sky, testival banner, the mascot waving from the foreground.
 * Wider aspect ratio (3:2) for hero usage.
 */

export function OnboardingHero({ className }: { className?: string }) {
  const outline = "#2B1A0F";

  return (
    <svg
      viewBox="0 0 360 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="oh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A7BD0" />
          <stop offset="50%" stopColor="#F7B32B" />
          <stop offset="100%" stopColor="#C4502A" />
        </linearGradient>
        <linearGradient id="oh-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE9B8" />
          <stop offset="100%" stopColor="#F7B32B" />
        </linearGradient>
      </defs>
      <rect width="360" height="240" rx="20" fill="url(#oh-sky)" />

      {/* sun */}
      <circle cx="280" cy="80" r="38" fill="url(#oh-sun)" stroke={outline} strokeWidth="2" />
      {/* sun rays */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, i) => (
        <line
          key={i}
          x1={280 + Math.cos((deg * Math.PI) / 180) * 42}
          y1={80 + Math.sin((deg * Math.PI) / 180) * 42}
          x2={280 + Math.cos((deg * Math.PI) / 180) * 55}
          y2={80 + Math.sin((deg * Math.PI) / 180) * 55}
          stroke="#F7B32B" strokeWidth="3" strokeLinecap="round" opacity="0.8"
        />
      ))}

      {/* far mountains */}
      <path d="M0 160 L50 100 L100 155 L150 95 L200 148 L250 90 L305 150 L360 105 L360 200 L0 200 Z"
        fill="#2E6B3E" stroke={outline} strokeWidth="2" />
      {/* snow caps */}
      <path d="M50 100 L65 118 L35 118 Z" fill="#FFF6E3" stroke={outline} strokeWidth="1.5" />
      <path d="M150 95 L168 116 L132 116 Z" fill="#FFF6E3" stroke={outline} strokeWidth="1.5" />
      <path d="M250 90 L268 112 L232 112 Z" fill="#FFF6E3" stroke={outline} strokeWidth="1.5" />

      {/* mid mountains (lighter) */}
      <path d="M0 175 L30 145 L70 172 L110 138 L155 170 L195 140 L240 175 L285 142 L330 172 L360 148 L360 210 L0 210 Z"
        fill="#5DA53C" stroke={outline} strokeWidth="2" />

      {/* meadow */}
      <path d="M0 192 Q90 180 180 192 Q270 204 360 188 L360 240 L0 240 Z"
        fill="#5DA53C" />
      <path d="M0 208 Q90 196 180 208 Q270 220 360 204 L360 240 L0 240 Z"
        fill="#2E6B3E" />

      {/* alpine hut */}
      <rect x="240" y="158" width="55" height="38" rx="3"
        fill="#C87A4A" stroke={outline} strokeWidth="2" />
      <path d="M235 162 L267 138 L300 162 Z"
        fill="#8B3118" stroke={outline} strokeWidth="2" />
      <rect x="257" y="172" width="20" height="24" rx="2"
        fill="#2B1A0F" stroke={outline} strokeWidth="1.5" />
      {/* windows */}
      <rect x="243" y="168" width="10" height="10" rx="2"
        fill="#FFE9B8" stroke={outline} strokeWidth="1.5" />
      <rect x="283" y="168" width="10" height="10" rx="2"
        fill="#FFE9B8" stroke={outline} strokeWidth="1.5" />

      {/* testival banners on poles */}
      {[
        { x: 38, color: "#C4502A", label: "LANDR" },
        { x: 75, color: "#4A7BD0", label: "TEST" },
      ].map(({ x, color, label }, i) => (
        <g key={i}>
          <line x1={x} y1="205" x2={x} y2="148" stroke={outline} strokeWidth="3" strokeLinecap="round" />
          <path d={`M${x} 148 L${x + 28} 155 L${x} 162 Z`}
            fill={color} stroke={outline} strokeWidth="1.5" />
          <text x={x + 8} y="158" fontFamily="system-ui" fontSize="5" fontWeight="bold"
            fill="white">{label}</text>
        </g>
      ))}

      {/* big paraglider wing in sky */}
      <path d="M110 70 Q180 44 250 70 L245 82 Q180 58 115 82 Z"
        fill="#C4502A" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M110 70 Q180 46 250 70 L248 74 Q180 50 112 74 Z"
        fill="#E8702E" opacity="0.5" />
      {/* suspension lines */}
      <line x1="145" y1="82" x2="172" y2="102" stroke={outline} strokeWidth="1.2" />
      <line x1="180" y1="78" x2="180" y2="102" stroke={outline} strokeWidth="1.2" />
      <line x1="215" y1="82" x2="188" y2="102" stroke={outline} strokeWidth="1.2" />
      {/* pilot silhouette */}
      <circle cx="180" cy="106" r="6" fill="#2B1A0F" />

      {/* small second glider */}
      <path d="M30 88 Q55 78 80 88 L78 94 Q55 84 32 94 Z"
        fill="#D9486E" stroke={outline} strokeWidth="1.5" />

      {/* MASCOT (simplified inline) — bottom left, waving */}
      <g transform="translate(28, 152) scale(0.55)">
        {/* body */}
        <path d="M60 155 Q55 210 58 240 L142 240 Q145 210 140 155 Z"
          fill="#C4502A" stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
        {/* left arm raised */}
        <path d="M62 168 Q42 140 50 115" stroke="#E8A87C" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M62 168 Q42 140 50 115" stroke={outline} strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="51" cy="110" rx="10" ry="8" fill="#E8A87C" stroke={outline} strokeWidth="2" />
        {/* right arm down */}
        <path d="M138 170 Q152 185 148 210" stroke="#E8A87C" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M138 170 Q152 185 148 210" stroke={outline} strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="148" cy="213" rx="9" ry="8" fill="#E8A87C" stroke={outline} strokeWidth="2" />
        {/* harness */}
        <path d="M140 165 Q160 170 162 200 Q160 225 145 230 L142 230 L142 165 Z"
          fill="#5DA53C" stroke={outline} strokeWidth="2" />
        {/* legs */}
        <path d="M80 240 Q78 265 78 288" stroke="#2B4A7A" strokeWidth="18" fill="none" strokeLinecap="round" />
        <path d="M80 240 Q78 265 78 288" stroke={outline} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M120 240 Q122 265 122 288" stroke="#2B4A7A" strokeWidth="18" fill="none" strokeLinecap="round" />
        <path d="M120 240 Q122 265 122 288" stroke={outline} strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="78" cy="292" rx="14" ry="8" fill={outline} />
        <ellipse cx="122" cy="292" rx="14" ry="8" fill={outline} />
        {/* head */}
        <ellipse cx="100" cy="110" rx="42" ry="40" fill="#E8A87C" stroke={outline} strokeWidth="2.5" />
        {/* cap */}
        <path d="M60 98 Q62 82 100 78 Q138 82 140 98 L138 102 Q100 92 62 102 Z"
          fill="#4A7BD0" stroke={outline} strokeWidth="2.5" />
        <path d="M56 105 Q58 95 100 92 Q100 108 58 108 Z"
          fill="#3A6AC0" stroke={outline} strokeWidth="2" />
        {/* glasses */}
        <rect x="68" y="108" width="26" height="19" rx="7" fill="#B8D4F0" stroke={outline} strokeWidth="3" />
        <rect x="106" y="108" width="26" height="19" rx="7" fill="#B8D4F0" stroke={outline} strokeWidth="3" />
        <line x1="94" y1="116" x2="106" y2="116" stroke={outline} strokeWidth="3" strokeLinecap="round" />
        {/* eyes */}
        <ellipse cx="81" cy="117" rx="7" ry="7" fill="white" />
        <circle cx="83" cy="118" r="4.5" fill={outline} />
        <circle cx="84.5" cy="116.5" r="1.5" fill="white" />
        <ellipse cx="119" cy="117" rx="7" ry="7" fill="white" />
        <circle cx="121" cy="118" r="4.5" fill={outline} />
        <circle cx="122.5" cy="116.5" r="1.5" fill="white" />
        {/* grin */}
        <path d="M82 130 Q100 142 118 130" fill="white" stroke={outline} strokeWidth="2" strokeLinejoin="round" />
        {/* cheeks */}
        <ellipse cx="68" cy="126" rx="8" ry="5" fill="#D9486E" opacity="0.3" />
        <ellipse cx="132" cy="126" rx="8" ry="5" fill="#D9486E" opacity="0.3" />
      </g>

      {/* sparkle stars */}
      <g transform="translate(320,50)">
        <polygon points="0,-14 3.3,-5.4 11.4,-5.4 5,2 7.6,11.4 0,6.3 -7.6,11.4 -5,2 -11.4,-5.4 -3.3,-5.4"
          fill="#F7B32B" stroke={outline} strokeWidth="2" />
        <circle cx="-3" cy="0" r="1.5" fill={outline} />
        <circle cx="3" cy="0" r="1.5" fill={outline} />
        <path d="M-3,4 Q0,7 3,4" fill="none" stroke={outline} strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g transform="translate(18,72) scale(0.7)">
        <polygon points="0,-14 3.3,-5.4 11.4,-5.4 5,2 7.6,11.4 0,6.3 -7.6,11.4 -5,2 -11.4,-5.4 -3.3,-5.4"
          fill="#F7B32B" stroke={outline} strokeWidth="2" />
      </g>
      <g transform="translate(345,130) scale(0.6)">
        <polygon points="0,-14 3.3,-5.4 11.4,-5.4 5,2 7.6,11.4 0,6.3 -7.6,11.4 -5,2 -11.4,-5.4 -3.3,-5.4"
          fill="#C4502A" stroke={outline} strokeWidth="2" />
      </g>

      {/* comic emphasis dashes near sun */}
      <line x1="306" y1="62" x2="316" y2="55" stroke="#F7B32B" strokeWidth="3" strokeLinecap="round" />
      <line x1="302" y1="72" x2="314" y2="70" stroke="#F7B32B" strokeWidth="3" strokeLinecap="round" />
      <line x1="308" y1="80" x2="320" y2="82" stroke="#F7B32B" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
