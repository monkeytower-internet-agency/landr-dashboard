/**
 * <Mascot> — the Landr paraglider-pilot mascot.
 *
 * Style DNA (from comic-reference.jpg + DESIGN_DIRECTION.md):
 *   - Chunky dark-brown outlines (not pure black)
 *   - Flat cel shadow shapes (one shadow tone per surface)
 *   - Saturated sunset / gold / sky / meadow palette
 *   - Big expressive eyes, thick-framed glasses, ball cap, warm grin
 *
 * Poses:
 *   wave      — arm raised, friendly waving hand
 *   celebrate — both arms up, grin wide, sparkle stars
 *   thinking  — hand on chin, contemplative look
 *   empty     — arms down / shrug, slight frown
 */

import type { CSSProperties, ReactElement } from "react";

export type MascotPose = "wave" | "celebrate" | "thinking" | "empty";

interface MascotProps {
  pose?: MascotPose;
  size?: number;
  style?: CSSProperties;
  className?: string;
}

/* ─── palette constants ────────────────────────────────────────────────── */
const C = {
  outline: "#2B1A0F",       // dark brown-black outline
  skin: "#E8A87C",          // warm skin tone
  skinShad: "#C87A4A",      // cel shadow on skin
  cap: "#4A7BD0",           // blue cap (sky blue from palette)
  capShad: "#2E5BA0",       // cap shadow
  capBrim: "#3A6AC0",
  glasses: "#2B1A0F",       // dark thick frames
  glassesTint: "#B8D4F0",   // lens tint
  hair: "#F7B32B",          // golden-blond hair
  shirt: "#C4502A",         // rust/sunset orange shirt
  shirtShad: "#8B3118",     // shirt shadow
  shirtHighlight: "#E8702E",
  bag: "#5DA53C",           // meadow-green harness/bag
  bagShad: "#2E6B3E",
  teeth: "#FFFFFF",
  eyeWhite: "#FFFFFF",
  pupil: "#2B1A0F",
  pupilShine: "#FFFFFF",
  star1: "#F7B32B",         // gold star
  star2: "#C4502A",         // rust star
  starSmile: "#2B1A0F",
  sparkle: "#FFE9B8",
  cheek: "#D9486E",         // magenta blush
} as const;

/* ─── shared sub-shapes ────────────────────────────────────────────────── */

/** Body torso — orange shirt with cel shadow */
function Body() {
  return (
    <g>
      {/* torso */}
      <path
        d="M60 155 Q55 210 58 240 L142 240 Q145 210 140 155 Z"
        fill={C.shirt}
        stroke={C.outline}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* shadow stripe on shirt */}
      <path
        d="M70 160 Q67 195 68 225 L88 225 Q87 195 88 160 Z"
        fill={C.shirtShad}
        opacity="0.6"
      />
      {/* shirt collar */}
      <path
        d="M85 155 Q100 165 115 155"
        fill="none"
        stroke={C.outline}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
  );
}

/** Head with cap + glasses + face */
function Head({ expression }: { expression: "grin" | "wide-grin" | "neutral" | "frown" | "thinking" }) {
  return (
    <g>
      {/* neck */}
      <rect x="88" y="135" width="24" height="25" rx="6" fill={C.skin} stroke={C.outline} strokeWidth="2" />
      <rect x="88" y="148" width="24" height="12" fill={C.skinShad} opacity="0.5" />

      {/* head */}
      <ellipse cx="100" cy="110" rx="42" ry="40" fill={C.skin} stroke={C.outline} strokeWidth="2.5" />
      {/* head cel shadow */}
      <ellipse cx="86" cy="118" rx="18" ry="14" fill={C.skinShad} opacity="0.3" />

      {/* cap — back strap behind head */}
      <path d="M60 98 Q62 82 100 78 Q138 82 140 98 L138 102 Q100 92 62 102 Z"
        fill={C.cap} stroke={C.outline} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M62 100 Q100 90 138 100 L140 98 Q138 82 100 78 Q62 82 60 98 Z"
        fill={C.capShad} opacity="0.35" />

      {/* cap brim */}
      <path d="M56 105 Q58 95 100 92 Q100 108 58 108 Z"
        fill={C.capBrim} stroke={C.outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M56 105 Q58 95 100 92 L100 98 Q62 101 58 108 Z"
        fill={C.capShad} opacity="0.3" />

      {/* cap logo patch — small rect */}
      <rect x="88" y="81" width="24" height="12" rx="3" fill="#1A3A7A" stroke={C.outline} strokeWidth="1.5" />
      <path d="M91 87 Q100 83 109 87" fill="none" stroke="#7FA8E8" strokeWidth="1.5" strokeLinecap="round" />

      {/* hair peek under cap */}
      <path d="M60 105 Q64 118 68 120" stroke={C.hair} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M140 105 Q136 118 132 120" stroke={C.hair} strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* ears */}
      <ellipse cx="58" cy="112" rx="7" ry="9" fill={C.skin} stroke={C.outline} strokeWidth="2" />
      <ellipse cx="142" cy="112" rx="7" ry="9" fill={C.skin} stroke={C.outline} strokeWidth="2" />
      <path d="M55 109 Q58 113 55 117" fill="none" stroke={C.skinShad} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M145 109 Q142 113 145 117" fill="none" stroke={C.skinShad} strokeWidth="1.5" strokeLinecap="round" />

      {/* glasses frames */}
      {/* left lens */}
      <rect x="68" y="108" width="26" height="19" rx="7" fill={C.glassesTint} stroke={C.glasses} strokeWidth="3" />
      {/* right lens */}
      <rect x="106" y="108" width="26" height="19" rx="7" fill={C.glassesTint} stroke={C.glasses} strokeWidth="3" />
      {/* bridge */}
      <line x1="94" y1="116" x2="106" y2="116" stroke={C.glasses} strokeWidth="3" strokeLinecap="round" />
      {/* temple arms */}
      <line x1="68" y1="116" x2="59" y2="112" stroke={C.glasses} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="132" y1="116" x2="141" y2="112" stroke={C.glasses} strokeWidth="2.5" strokeLinecap="round" />
      {/* lens glare */}
      <ellipse cx="76" cy="112" rx="4" ry="3" fill="#FFFFFF" opacity="0.5" />
      <ellipse cx="114" cy="112" rx="4" ry="3" fill="#FFFFFF" opacity="0.5" />

      {/* eyes behind glasses */}
      {/* left eye */}
      <ellipse cx="81" cy="117" rx="7" ry="7" fill={C.eyeWhite} />
      <circle cx="83" cy="118" r="4.5" fill={C.pupil} />
      <circle cx="84.5" cy="116.5" r="1.5" fill={C.pupilShine} />
      {/* right eye */}
      <ellipse cx="119" cy="117" rx="7" ry="7" fill={C.eyeWhite} />
      <circle cx="121" cy="118" r="4.5" fill={C.pupil} />
      <circle cx="122.5" cy="116.5" r="1.5" fill={C.pupilShine} />

      {/* eyebrows */}
      {expression === "frown" ? (
        <>
          <path d="M70 107 Q81 111 89 108" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M111 108 Q119 111 130 107" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : expression === "thinking" ? (
        <>
          <path d="M70 108 Q81 105 89 107" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M111 106 Q119 104 130 108" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M70 107 Q81 103 89 106" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M111 106 Q119 103 130 107" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}

      {/* cheek blush */}
      <ellipse cx="68" cy="126" rx="8" ry="5" fill={C.cheek} opacity="0.3" />
      <ellipse cx="132" cy="126" rx="8" ry="5" fill={C.cheek} opacity="0.3" />

      {/* mouth */}
      {expression === "grin" && (
        <path d="M82 130 Q100 142 118 130" fill={C.teeth} stroke={C.outline} strokeWidth="2" strokeLinejoin="round" />
      )}
      {expression === "wide-grin" && (
        <path d="M78 130 Q100 148 122 130" fill={C.teeth} stroke={C.outline} strokeWidth="2.5" strokeLinejoin="round" />
      )}
      {expression === "neutral" && (
        <path d="M85 133 Q100 138 115 133" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
      )}
      {expression === "frown" && (
        <path d="M84 136 Q100 128 116 136" fill="none" stroke={C.outline} strokeWidth="2.5" strokeLinecap="round" />
      )}
    </g>
  );
}

/** Harness / paraglider bag on back */
function Harness() {
  return (
    <g>
      <path d="M140 165 Q160 170 162 200 Q160 225 145 230 L142 230 L142 165 Z"
        fill={C.bag} stroke={C.outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M148 170 Q158 175 159 200 Q157 218 148 224"
        fill={C.bagShad} opacity="0.4" />
      {/* buckle */}
      <rect x="141" y="188" width="12" height="8" rx="2" fill="#F7B32B" stroke={C.outline} strokeWidth="1.5" />
    </g>
  );
}

/* ─── Sparkle star (with optional face) ────────────────────────────────── */
function SparkeStar({
  cx, cy, r = 10, color = C.star1, face = false,
}: {
  cx: number; cy: number; r?: number; color?: string; face?: boolean;
}) {
  const pts = (n: number, ro: number, ri: number) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const angle = (i * Math.PI) / n - Math.PI / 2;
      const radius = i % 2 === 0 ? ro : ri;
      return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
    }).join(" ");

  return (
    <g>
      <polygon points={pts(5, r, r * 0.42)} fill={color} stroke={C.outline} strokeWidth="1.5" strokeLinejoin="round" />
      {face && (
        <>
          {/* smiley on star */}
          <circle cx={cx - r * 0.2} cy={cy - r * 0.05} r={r * 0.1} fill={C.outline} />
          <circle cx={cx + r * 0.2} cy={cy - r * 0.05} r={r * 0.1} fill={C.outline} />
          <path
            d={`M ${cx - r * 0.2} ${cy + r * 0.15} Q ${cx} ${cy + r * 0.32} ${cx + r * 0.2} ${cy + r * 0.15}`}
            fill="none" stroke={C.outline} strokeWidth={r * 0.1} strokeLinecap="round"
          />
        </>
      )}
    </g>
  );
}

/** Mini paraglider wing in background */
function TinyGlider({ x, y, color = "#D9486E" }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <path d="M-15,0 Q0,-10 15,0 L12,4 Q0,0 -12,4 Z" fill={color} stroke={C.outline} strokeWidth="1.5" />
      <line x1="0" y1="0" x2="0" y2="12" stroke={C.outline} strokeWidth="1" />
    </g>
  );
}

/* ─── Pose-specific arms ────────────────────────────────────────────────── */

function ArmWave() {
  // Right arm down, left arm raised and waving
  return (
    <g>
      {/* right arm down */}
      <path d="M138 170 Q152 185 148 210" stroke={C.skin} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M138 170 Q152 185 148 210" stroke={C.skinShad} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M138 170 Q152 185 148 210" stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* left arm raised */}
      <path d="M62 168 Q42 140 50 115" stroke={C.skin} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M62 168 Q42 140 50 115" stroke={C.skinShad} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M62 168 Q42 140 50 115" stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* waving hand */}
      <ellipse cx="51" cy="110" rx="10" ry="8" fill={C.skin} stroke={C.outline} strokeWidth="2" />
      {/* fingers */}
      <path d="M45 104 Q43 95 45 90" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M45 104 Q43 95 45 90" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M51 103 Q50 93 51 88" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M51 103 Q50 93 51 88" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M57 104 Q57 94 57 89" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M57 104 Q57 94 57 89" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* right hand (fist/open) */}
      <ellipse cx="148" cy="213" rx="9" ry="8" fill={C.skin} stroke={C.outline} strokeWidth="2" />
    </g>
  );
}

function ArmsCelebrate() {
  // Both arms raised up triumphantly
  return (
    <g>
      {/* left arm up */}
      <path d="M62 165 Q38 135 32 108" stroke={C.skin} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M62 165 Q38 135 32 108" stroke={C.skinShad} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M62 165 Q38 135 32 108" stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* left hand */}
      <ellipse cx="32" cy="104" rx="10" ry="9" fill={C.skin} stroke={C.outline} strokeWidth="2" />
      <path d="M27 97 Q25 88 27 83" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M27 97 Q25 88 27 83" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M33 95 Q32 86 33 81" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M33 95 Q32 86 33 81" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M38 97 Q38 88 38 83" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M38 97 Q38 88 38 83" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />

      {/* right arm up */}
      <path d="M138 165 Q162 135 168 108" stroke={C.skin} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M138 165 Q162 135 168 108" stroke={C.skinShad} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M138 165 Q162 135 168 108" stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* right hand */}
      <ellipse cx="168" cy="104" rx="10" ry="9" fill={C.skin} stroke={C.outline} strokeWidth="2" />
      <path d="M162 97 Q160 88 162 83" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M162 97 Q160 88 162 83" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M168 95 Q167 86 168 81" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M168 95 Q167 86 168 81" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M173 97 Q173 88 173 83" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M173 97 Q173 88 173 83" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  );
}

function ArmThinking() {
  // Right arm raised with hand on chin, left arm crossed
  return (
    <g>
      {/* left arm folded across body */}
      <path d="M62 168 Q72 185 105 188" stroke={C.skin} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M62 168 Q72 185 105 188" stroke={C.skinShad} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M62 168 Q72 185 105 188" stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* left hand resting */}
      <ellipse cx="108" cy="189" rx="10" ry="8" fill={C.skin} stroke={C.outline} strokeWidth="2" />

      {/* right arm raised to chin */}
      <path d="M138 168 Q148 155 138 140" stroke={C.skin} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M138 168 Q148 155 138 140" stroke={C.skinShad} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M138 168 Q148 155 138 140" stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* hand near chin */}
      <ellipse cx="132" cy="136" rx="10" ry="8" fill={C.skin} stroke={C.outline} strokeWidth="2" />
      {/* index finger up */}
      <path d="M128 130 Q126 121 128 116" stroke={C.skin} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M128 130 Q126 121 128 116" stroke={C.outline} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  );
}

function ArmsEmpty() {
  // Arms slightly out — shrug gesture
  return (
    <g>
      {/* left arm out and up slightly */}
      <path d="M62 168 Q38 172 30 160" stroke={C.skin} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M62 168 Q38 172 30 160" stroke={C.skinShad} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M62 168 Q38 172 30 160" stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* left hand open */}
      <ellipse cx="27" cy="157" rx="10" ry="9" fill={C.skin} stroke={C.outline} strokeWidth="2" />

      {/* right arm out */}
      <path d="M138 168 Q162 172 170 160" stroke={C.skin} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M138 168 Q162 172 170 160" stroke={C.skinShad} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.3" />
      <path d="M138 168 Q162 172 170 160" stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* right hand open */}
      <ellipse cx="173" cy="157" rx="10" ry="9" fill={C.skin} stroke={C.outline} strokeWidth="2" />
    </g>
  );
}

/* ─── Legs ──────────────────────────────────────────────────────────────── */
function Legs({ pose }: { pose: MascotPose }) {
  // simple pants + boots
  const leftLeg = pose === "celebrate"
    ? "M80 240 Q75 265 70 288"
    : "M80 240 Q78 265 78 288";
  const rightLeg = pose === "celebrate"
    ? "M120 240 Q125 265 130 288"
    : "M120 240 Q122 265 122 288";

  return (
    <g>
      {/* pants */}
      <path d={leftLeg} stroke="#2B4A7A" strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d={leftLeg} stroke="#1A3260" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.4" />
      <path d={leftLeg} stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />

      <path d={rightLeg} stroke="#2B4A7A" strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d={rightLeg} stroke="#1A3260" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.4" />
      <path d={rightLeg} stroke={C.outline} strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* boots */}
      {pose === "celebrate" ? (
        <>
          <ellipse cx="70" cy="292" rx="14" ry="8" fill={C.outline} />
          <ellipse cx="130" cy="292" rx="14" ry="8" fill={C.outline} />
        </>
      ) : (
        <>
          <ellipse cx="78" cy="292" rx="14" ry="8" fill={C.outline} />
          <ellipse cx="122" cy="292" rx="14" ry="8" fill={C.outline} />
        </>
      )}
    </g>
  );
}

/* ─── Pose compositions ──────────────────────────────────────────────────── */

function PoseWave() {
  return (
    <svg viewBox="0 0 200 320" fill="none" xmlns="http://www.w3.org/2000/svg">
      <Harness />
      <Body />
      <ArmWave />
      <Legs pose="wave" />
      <Head expression="grin" />
      {/* motion lines near waving hand */}
      <path d="M65 85 L72 78" stroke={C.star1} strokeWidth="2" strokeLinecap="round" />
      <path d="M60 92 L64 83" stroke={C.star1} strokeWidth="2" strokeLinecap="round" />
      <path d="M72 78 L78 72" stroke={C.star1} strokeWidth="2" strokeLinecap="round" />
      {/* small sparkle */}
      <SparkeStar cx={38} cy={78} r={8} color={C.star1} />
    </svg>
  );
}

function PoseCelebrate() {
  return (
    <svg viewBox="0 0 200 320" fill="none" xmlns="http://www.w3.org/2000/svg">
      <Harness />
      <Body />
      <ArmsCelebrate />
      <Legs pose="celebrate" />
      <Head expression="wide-grin" />
      {/* sparkle constellation */}
      <SparkeStar cx={22} cy={72} r={12} color={C.star1} face />
      <SparkeStar cx={178} cy={68} r={10} color={C.star2} />
      <SparkeStar cx={165} cy={90} r={6} color={C.star1} />
      <SparkeStar cx={35} cy={95} r={7} color={C.star2} />
      {/* comic emphasis lines */}
      <line x1="25" y1="100" x2="18" y2="88" stroke={C.star1} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="175" y1="100" x2="182" y2="88" stroke={C.star1} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="24" y1="110" x2="12" y2="108" stroke={C.star1} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="176" y1="110" x2="188" y2="108" stroke={C.star1} strokeWidth="2.5" strokeLinecap="round" />
      <TinyGlider x={160} y={42} color="#D9486E" />
      <TinyGlider x={40} y={50} color="#C4502A" />
    </svg>
  );
}

function PoseThinking() {
  return (
    <svg viewBox="0 0 200 320" fill="none" xmlns="http://www.w3.org/2000/svg">
      <Harness />
      <Body />
      <ArmThinking />
      <Legs pose="thinking" />
      <Head expression="neutral" />
      {/* thought bubble */}
      <circle cx="168" cy="80" r="14" fill="#FFF6E3" stroke={C.outline} strokeWidth="2" />
      <circle cx="158" cy="95" r="8" fill="#FFF6E3" stroke={C.outline} strokeWidth="2" />
      <circle cx="150" cy="108" r="5" fill="#FFF6E3" stroke={C.outline} strokeWidth="2" />
      {/* thought content — tiny paraglider wing in bubble */}
      <TinyGlider x={168} y={80} color={C.star2} />
      {/* question mark style dots */}
      <circle cx="145" cy="72" r="3" fill={C.star1} />
      <circle cx="152" cy="65" r="2" fill={C.star1} />
      <circle cx="160" cy="60" r="1.5" fill={C.star1} />
    </svg>
  );
}

function PoseEmpty() {
  return (
    <svg viewBox="0 0 200 320" fill="none" xmlns="http://www.w3.org/2000/svg">
      <Harness />
      <Body />
      <ArmsEmpty />
      <Legs pose="empty" />
      <Head expression="frown" />
      {/* sweat drop */}
      <path d="M143 105 Q146 112 143 118 Q140 112 143 105 Z"
        fill="#7FA8E8" stroke={C.outline} strokeWidth="1.5" strokeLinejoin="round" />
      {/* empty swirls */}
      <path d="M24 140 Q30 130 36 140" fill="none" stroke={C.outline} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="M164 140 Q170 130 176 140" fill="none" stroke={C.outline} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

/* ─── Public component ──────────────────────────────────────────────────── */

const POSE_MAP: Record<MascotPose, () => ReactElement> = {
  wave: PoseWave,
  celebrate: PoseCelebrate,
  thinking: PoseThinking,
  empty: PoseEmpty,
};

export function Mascot({ pose = "wave", size = 200, style, className }: MascotProps) {
  const PoseComponent = POSE_MAP[pose];
  return (
    <span
      style={{ display: "inline-block", width: size, height: size, flexShrink: 0, ...style }}
      aria-hidden="true"
      className={className}
    >
      <PoseComponent />
    </span>
  );
}
