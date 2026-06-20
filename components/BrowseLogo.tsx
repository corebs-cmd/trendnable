import React from 'react';
import { View, Text, Image } from 'react-native';
import Svg, {
  Path, Circle, Rect, G, Ellipse, Line, Polygon, Text as SvgText,
} from 'react-native-svg';

// ── Brand logo SVGs ───────────────────────────────────────────────────────────

// Funko Pop — iconic vinyl figure: oversized round head, huge black oval eyes, stubby body, "POP!" tag
function LogoFunko() {
  return (
    <Svg viewBox="0 0 100 115" width="62%" height="62%">
      {/* body — short squat block */}
      <Rect x={34} y={68} width={32} height={26} rx={4} fill="#FFFFFF" opacity={0.92} />
      {/* arms */}
      <Ellipse cx={24} cy={80} rx={7} ry={12} fill="#FFFFFF" opacity={0.88} />
      <Ellipse cx={76} cy={80} rx={7} ry={12} fill="#FFFFFF" opacity={0.88} />
      {/* neck */}
      <Rect x={44} y={60} width={12} height={10} fill="#FFFFFF" opacity={0.9} />
      {/* head — very large, round */}
      <Circle cx={50} cy={40} r={34} fill="#FFFFFF" opacity={0.96} />
      {/* big oval eyes — the defining Funko feature */}
      <Ellipse cx={37} cy={40} rx={8} ry={11} fill="#1A1A1A" />
      <Ellipse cx={63} cy={40} rx={8} ry={11} fill="#1A1A1A" />
      {/* eye shine */}
      <Circle cx={34} cy={36} r={2.5} fill="#FFFFFF" opacity={0.7} />
      <Circle cx={60} cy={36} r={2.5} fill="#FFFFFF" opacity={0.7} />
      {/* "POP!" text tag at bottom */}
      <Rect x={28} y={97} width={44} height={16} rx={3} fill="#FFFFFF" opacity={0.95} />
      <SvgText x={50} y={109} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={10} fontWeight="900" fill="#F5541E" letterSpacing={1}>POP!</SvgText>
    </Svg>
  );
}

// TCG — Pokéball
function LogoTcg() {
  return (
    <Svg viewBox="0 0 100 100" width="64%" height="64%">
      {/* top half red */}
      <Path d="M10 50 A40 40 0 0 1 90 50 Z" fill="#E53E3E" />
      {/* bottom half white */}
      <Path d="M10 50 A40 40 0 0 0 90 50 Z" fill="#FFFFFF" />
      {/* middle band */}
      <Rect x={10} y={46} width={80} height={8} fill="#1A1A1A" />
      {/* center circle outer */}
      <Circle cx={50} cy={50} r={13} fill="#1A1A1A" />
      {/* center circle inner */}
      <Circle cx={50} cy={50} r={8} fill="#FFFFFF" />
      {/* outer ring */}
      <Circle cx={50} cy={50} r={40} fill="none" stroke="#1A1A1A" strokeWidth={3} />
    </Svg>
  );
}

// Pop Mart — blind box with ?
function LogoPopmart() {
  return (
    <Svg viewBox="0 0 100 100" width="64%" height="64%">
      <G fill="#FFFFFF" opacity={0.95}>
        {/* box lid */}
        <Path d="M50 12 L85 28 L50 44 L15 28 Z" opacity={0.75} />
        {/* box front */}
        <Path d="M15 28 L50 44 L50 90 L15 74 Z" opacity={0.9} />
        {/* box side */}
        <Path d="M85 28 L50 44 L50 90 L85 74 Z" opacity={0.7} />
        {/* ? */}
        <SvgText x={32} y={80} fontFamily="serif" fontSize={28} fontWeight="700" fill="#EE2B3B" opacity={0.95}>?</SvgText>
      </G>
    </Svg>
  );
}

// Hot Toys — clean circular badge, stacked HOT / TOYS
function LogoHottoys() {
  return (
    <Svg viewBox="0 0 100 100" width="76%" height="76%">
      <Circle cx={50} cy={50} r={44} fill="#FFFFFF" opacity={0.95} />
      <SvgText x={50} y={46} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={22} fontWeight="900" fill="#5C0A14" letterSpacing={2}>HOT</SvgText>
      <Line x1={22} y1={52} x2={78} y2={52} stroke="#5C0A14" strokeWidth={1.5} opacity={0.2} />
      <SvgText x={50} y={68} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={22} fontWeight="900" fill="#5C0A14" letterSpacing={2}>TOYS</SvgText>
    </Svg>
  );
}

// NECA — shield with "NECA" text
function LogoNeca() {
  return (
    <Svg viewBox="0 0 100 100" width="68%" height="68%">
      {/* shield */}
      <Path d="M50 8 L88 24 L88 56 Q88 82 50 95 Q12 82 12 56 L12 24 Z" fill="#FFFFFF" opacity={0.95} />
      {/* text */}
      <SvgText x={50} y={58} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={22} fontWeight="900" fill="#CC0000" letterSpacing={1}>NECA</SvgText>
    </Svg>
  );
}

// Hot Wheels — flame with "HW"
function LogoHwheels() {
  return (
    <Svg viewBox="0 0 100 100" width="68%" height="68%">
      {/* flame shape */}
      <Path
        d="M50 8 C50 8 62 22 60 34 C68 24 66 14 66 14 C72 26 74 36 70 48 C76 42 76 32 76 32 C84 46 82 60 74 70 C66 80 56 86 50 92 C44 86 34 80 26 70 C18 60 16 46 24 32 C24 32 24 42 30 48 C26 36 28 26 34 14 C34 14 32 24 40 34 C38 22 50 8 50 8 Z"
        fill="#FFDE00"
        opacity={0.95}
      />
      <SvgText x={50} y={68} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={18} fontWeight="900" fill="#E8272B">HW</SvgText>
    </Svg>
  );
}

// One Piece — straw hat
function LogoOnepiece() {
  return (
    <Svg viewBox="0 0 100 100" width="70%" height="70%">
      <G fill="#F0C040">
        {/* brim */}
        <Ellipse cx={50} cy={56} rx={44} ry={12} opacity={0.95} />
        {/* crown */}
        <Ellipse cx={50} cy={46} rx={28} ry={18} />
        {/* band */}
        <Path d="M22 50 Q50 58 78 50" stroke="#CC0000" strokeWidth={5} fill="none" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

// Demon Slayer — sun-breath pattern / hanafuda earring
function LogoDemon() {
  return (
    <Svg viewBox="0 0 100 100" width="68%" height="68%">
      {/* outer circle */}
      <Circle cx={50} cy={50} r={42} fill="none" stroke="#E53535" strokeWidth={4} opacity={0.9} />
      {/* inner circle */}
      <Circle cx={50} cy={50} r={28} fill="none" stroke="#E53535" strokeWidth={3} opacity={0.8} />
      {/* rays */}
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((a, i) => {
        const rad = (a * Math.PI) / 180;
        const x1 = 50 + 30 * Math.cos(rad);
        const y1 = 50 + 30 * Math.sin(rad);
        const x2 = 50 + 42 * Math.cos(rad);
        const y2 = 50 + 42 * Math.sin(rad);
        return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E53535" strokeWidth={3} opacity={0.85} />;
      })}
      {/* center */}
      <Circle cx={50} cy={50} r={10} fill="#E53535" opacity={0.9} />
    </Svg>
  );
}

// Star Wars — iconic text logo style
function LogoStarwars() {
  return (
    <Svg viewBox="0 0 120 60" width="80%" height="60%">
      <SvgText x={60} y={26} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={20} fontWeight="900" fill="#FFE81F" letterSpacing={3}>STAR</SvgText>
      <SvgText x={60} y={50} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={20} fontWeight="900" fill="#FFE81F" letterSpacing={3}>WARS</SvgText>
    </Svg>
  );
}

// Pokémon — Pikachu lightning bolt / Pokéball
function LogoPokemon() {
  return (
    <Svg viewBox="0 0 100 100" width="64%" height="64%">
      {/* top half */}
      <Path d="M10 50 A40 40 0 0 1 90 50 Z" fill="#CC0000" />
      {/* bottom half */}
      <Path d="M10 50 A40 40 0 0 0 90 50 Z" fill="#FFFFFF" />
      {/* band */}
      <Rect x={10} y={46} width={80} height={8} fill="#222222" />
      {/* center */}
      <Circle cx={50} cy={50} r={13} fill="#222222" />
      <Circle cx={50} cy={50} r={8} fill="#FFFFFF" />
      {/* ring */}
      <Circle cx={50} cy={50} r={40} fill="none" stroke="#222222" strokeWidth={3} />
    </Svg>
  );
}

// Marvel — red rectangle with MARVEL
function LogoMarvel() {
  return (
    <Svg viewBox="0 0 120 50" width="80%" height="60%">
      <Rect x={2} y={2} width={116} height={46} rx={3} fill="#FFFFFF" />
      <SvgText x={60} y={35} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={26} fontWeight="900" fill="#EC1D24" letterSpacing={1}>MARVEL</SvgText>
    </Svg>
  );
}

// My Hero Academia — lightning bolt + "PLUS ULTRA"
function LogoMha() {
  return (
    <Svg viewBox="0 0 100 100" width="68%" height="68%">
      {/* lightning bolt */}
      <Path d="M58 8 L38 52 L54 52 L42 92 L70 44 L54 44 L72 8 Z" fill="#FFD700" opacity={0.95} />
    </Svg>
  );
}

// Stranger Things — retro title style
function LogoStranger() {
  return (
    <Svg viewBox="0 0 120 70" width="82%" height="62%">
      <SvgText x={60} y={24} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={14} fontWeight="900" fill="#CC0000" letterSpacing={2}>STRANGER</SvgText>
      <SvgText x={60} y={52} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={14} fontWeight="900" fill="#CC0000" letterSpacing={2}>THINGS</SvgText>
      {/* underline */}
      <Line x1={20} y1={58} x2={100} y2={58} stroke="#CC0000" strokeWidth={2} opacity={0.6} />
    </Svg>
  );
}

// Labubu — bunny-ear face
function LogoLabubu() {
  return (
    <Svg viewBox="0 0 100 100" width="66%" height="66%">
      <G fill="#CC5577">
        {/* ears */}
        <Ellipse cx={34} cy={28} rx={10} ry={22} />
        <Ellipse cx={66} cy={28} rx={10} ry={22} />
        {/* inner ears */}
        <Ellipse cx={34} cy={28} rx={5} ry={14} fill="#FFB3C6" />
        <Ellipse cx={66} cy={28} rx={5} ry={14} fill="#FFB3C6" />
        {/* head */}
        <Circle cx={50} cy={60} r={30} />
      </G>
      {/* eyes */}
      <Circle cx={40} cy={56} r={5} fill="#FFFFFF" />
      <Circle cx={60} cy={56} r={5} fill="#FFFFFF" />
      <Circle cx={41} cy={57} r={2.5} fill="#222222" />
      <Circle cx={61} cy={57} r={2.5} fill="#222222" />
      {/* nose + mouth */}
      <Circle cx={50} cy={65} r={3} fill="#AA2244" />
      <Path d="M44 72 Q50 78 56 72" stroke="#AA2244" strokeWidth={2} fill="none" strokeLinecap="round" />
      {/* serrated teeth */}
      <Path d="M44 72 L46 76 L48 72 L50 76 L52 72 L54 76 L56 72" stroke="#AA2244" strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

// Disney — castle silhouette
function LogoDisney() {
  return (
    <Svg viewBox="0 0 100 100" width="66%" height="66%">
      <G fill="#FFFFFF" opacity={0.95}>
        {/* main tower */}
        <Rect x={40} y={30} width={20} height={50} />
        {/* main tower spire */}
        <Polygon points="50,8 42,30 58,30" />
        {/* left tower */}
        <Rect x={22} y={44} width={14} height={36} />
        <Polygon points="29,26 22,44 36,44" />
        {/* right tower */}
        <Rect x={64} y={44} width={14} height={36} />
        <Polygon points="71,26 64,44 78,44" />
        {/* gate arch */}
        <Path d="M40 80 Q50 70 60 80 L60 84 L40 84 Z" fill="#0D0D0D" />
        {/* base */}
        <Rect x={16} y={80} width={68} height={10} rx={2} />
      </G>
    </Svg>
  );
}

// Jujutsu Kaisen — cursed eye / domain
function LogoJjk() {
  return (
    <Svg viewBox="0 0 100 100" width="68%" height="68%">
      {/* outer hexagon-like shape */}
      <Path d="M50 8 L88 28 L88 72 L50 92 L12 72 L12 28 Z" fill="none" stroke="#9B59B6" strokeWidth={3} opacity={0.9} />
      {/* inner ring */}
      <Circle cx={50} cy={50} r={24} fill="none" stroke="#9B59B6" strokeWidth={2.5} opacity={0.85} />
      {/* eye shape */}
      <Path d="M26 50 Q50 30 74 50 Q50 70 26 50 Z" fill="#9B59B6" opacity={0.85} />
      {/* pupil */}
      <Circle cx={50} cy={50} r={10} fill="#0D0D0D" />
      <Circle cx={50} cy={50} r={5} fill="#9B59B6" />
      {/* light reflection */}
      <Circle cx={47} cy={47} r={2} fill="#FFFFFF" opacity={0.7} />
    </Svg>
  );
}

// DC Comics — shield with DC
function LogoDc() {
  return (
    <Svg viewBox="0 0 100 100" width="68%" height="68%">
      <Path d="M50 8 L86 24 L86 58 Q86 80 50 94 Q14 80 14 58 L14 24 Z" fill="#FFFFFF" opacity={0.95} />
      <SvgText x={50} y={62} textAnchor="middle" fontFamily="Inter_700Bold" fontSize={30} fontWeight="900" fill="#0074E8" letterSpacing={1}>DC</SvgText>
    </Svg>
  );
}

// Horror — dripping skull
function LogoHorror() {
  return (
    <Svg viewBox="0 0 100 100" width="64%" height="64%">
      <G fill="#CC0000" opacity={0.9}>
        {/* skull dome */}
        <Path d="M20 54 Q20 16 50 16 Q80 16 80 54 L80 68 L68 68 L68 80 L56 80 L56 68 L44 68 L44 80 L32 80 L32 68 L20 68 Z" />
      </G>
      {/* eyes */}
      <Circle cx={38} cy={46} r={8} fill="#1A0000" />
      <Circle cx={62} cy={46} r={8} fill="#1A0000" />
      {/* nose */}
      <Path d="M46 58 L50 52 L54 58 Z" fill="#1A0000" />
    </Svg>
  );
}

// Gaming — controller
function LogoGaming() {
  return (
    <Svg viewBox="0 0 120 80" width="78%" height="66%">
      <G fill="#FFFFFF" opacity={0.9}>
        {/* body */}
        <Path d="M20 28 Q20 16 36 16 L84 16 Q100 16 100 28 L108 60 Q112 72 100 72 Q92 72 84 60 L76 52 L44 52 L36 60 Q28 72 20 72 Q8 72 12 60 Z" />
      </G>
      {/* d-pad */}
      <Rect x={34} y={28} width={6} height={18} rx={2} fill="#107C10" />
      <Rect x={29} y={33} width={16} height={6} rx={2} fill="#107C10" />
      {/* buttons */}
      <Circle cx={80} cy={30} r={4} fill="#107C10" />
      <Circle cx={72} cy={36} r={4} fill="#107C10" />
      <Circle cx={88} cy={36} r={4} fill="#107C10" />
      <Circle cx={80} cy={42} r={4} fill="#107C10" />
    </Svg>
  );
}

// Anime — DBZ-style protagonist: golden spiky upward hair + large expressive eyes
function LogoAnime() {
  return (
    <Svg viewBox="0 0 100 100" width="72%" height="72%">
      {/* ── hair glow aura ── */}
      <Ellipse cx={50} cy={30} rx={40} ry={34} fill="#FFD700" opacity={0.18} />
      {/* ── hair base mass ── */}
      <Path d="M14 46 Q12 22 22 13 Q32 4 50 2 Q68 4 78 13 Q88 22 86 46 Z" fill="#F0C800" />
      {/* ── spikes pointing upward (classic DBZ/Naruto protagonist) ── */}
      {/* far-left spike */}
      <Path d="M16 38 L6 12 L24 32 Z" fill="#F0C800" />
      {/* left-mid spike */}
      <Path d="M28 22 L22 0 L38 18 Z" fill="#F0C800" />
      {/* center spike — tallest */}
      <Path d="M50 14 L45 0 L55 0 L50 14 Z" fill="#FFE040" />
      {/* right-mid spike */}
      <Path d="M72 22 L78 0 L62 18 Z" fill="#F0C800" />
      {/* far-right spike */}
      <Path d="M84 38 L94 12 L76 32 Z" fill="#F0C800" />
      {/* ── face ── */}
      <Path d="M14 46 Q12 64 16 76 Q24 98 50 100 Q76 98 84 76 Q88 64 86 46 Z" fill="#FFDDB0" />
      {/* jaw shadow */}
      <Ellipse cx={50} cy={90} rx={22} ry={8} fill="#E8B888" opacity={0.45} />
      {/* ── eyebrows — thick, angled, determined ── */}
      <Path d="M20 56 Q30 51 40 54" stroke="#A07420" strokeWidth={3} fill="none" strokeLinecap="round" />
      <Path d="M80 56 Q70 51 60 54" stroke="#A07420" strokeWidth={3} fill="none" strokeLinecap="round" />
      {/* ── left eye ── */}
      <Ellipse cx={31} cy={66} rx={11} ry={13} fill="#FFFFFF" />
      <Circle cx={31} cy={66} r={8} fill="#1C42DD" />
      <Circle cx={31} cy={66} r={5.2} fill="#0A0A1A" />
      <Circle cx={27} cy={61} r={3} fill="#FFFFFF" opacity={0.95} />
      <Circle cx={35} cy={63} r={1.4} fill="#FFFFFF" opacity={0.65} />
      {/* ── right eye ── */}
      <Ellipse cx={69} cy={66} rx={11} ry={13} fill="#FFFFFF" />
      <Circle cx={69} cy={66} r={8} fill="#1C42DD" />
      <Circle cx={69} cy={66} r={5.2} fill="#0A0A1A" />
      <Circle cx={65} cy={61} r={3} fill="#FFFFFF" opacity={0.95} />
      <Circle cx={73} cy={63} r={1.4} fill="#FFFFFF" opacity={0.65} />
      {/* ── nose ── */}
      <Path d="M46 80 Q50 84 54 80" stroke="#C09050" strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.5} />
      {/* ── determined smile ── */}
      <Path d="M38 90 Q50 98 62 90" stroke="#C09050" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.55} />
    </Svg>
  );
}

// TMNT — shoulders-up: shell collar, blue bandana mask, eyes through holes, toothy grin
function LogoTmnt() {
  return (
    <Svg viewBox="0 0 100 100" width="80%" height="80%">
      {/* ── brown shell collar at shoulders ── */}
      <Ellipse cx={50} cy={96} rx={48} ry={13} fill="#7A4E2A" />
      <Path d="M4 94 L12 88 L20 94 L20 102 L12 108 L4 102 Z" fill="#5E3614" opacity={0.7} />
      <Path d="M22 91 L30 85 L38 91 L38 99 L30 105 L22 99 Z" fill="#5E3614" opacity={0.7} />
      <Path d="M40 90 L48 84 L56 90 L56 98 L48 104 L40 98 Z" fill="#5E3614" opacity={0.7} />
      <Path d="M58 91 L66 85 L74 91 L74 99 L66 105 L58 99 Z" fill="#5E3614" opacity={0.7} />
      <Path d="M76 94 L84 88 L92 94 L92 102 L84 108 L76 102 Z" fill="#5E3614" opacity={0.7} />
      {/* ── neck ── */}
      <Rect x={37} y={76} width={26} height={18} rx={3} fill="#52AE36" />
      {/* ── head ── */}
      <Ellipse cx={50} cy={46} rx={40} ry={42} fill="#52AE36" />
      {/* face shading */}
      <Ellipse cx={50} cy={58} rx={28} ry={20} fill="#3A9020" opacity={0.25} />
      {/* ── blue bandana mask ── */}
      <Rect x={9} y={28} width={82} height={30} rx={5} fill="#1C42CC" />
      {/* top sheen */}
      <Rect x={9} y={28} width={82} height={11} rx={5} fill="#4468EE" opacity={0.4} />
      {/* center knot */}
      <Ellipse cx={50} cy={43} rx={11} ry={8} fill="#0E2B99" />
      <Ellipse cx={50} cy={41} rx={8} ry={5} fill="#2E52CC" opacity={0.55} />
      {/* tail 1 — upper-right */}
      <Path d="M91 32 L102 20 L106 28 L94 38 Z" fill="#122A99" />
      {/* tail 2 — lower-right */}
      <Path d="M91 54 L106 64 L102 70 L88 60 Z" fill="#122A99" />
      {/* ── eyes visible through mask holes ── */}
      <Ellipse cx={31} cy={40} rx={13} ry={12} fill="#FFFFFF" />
      <Circle cx={32} cy={40} r={8} fill="#141414" />
      <Circle cx={28} cy={36} r={3.2} fill="#FFFFFF" opacity={0.88} />
      <Ellipse cx={69} cy={40} rx={13} ry={12} fill="#FFFFFF" />
      <Circle cx={70} cy={40} r={8} fill="#141414" />
      <Circle cx={66} cy={36} r={3.2} fill="#FFFFFF" opacity={0.88} />
      {/* ── nostrils ── */}
      <Circle cx={45} cy={66} r={2.8} fill="#2E7A18" />
      <Circle cx={55} cy={66} r={2.8} fill="#2E7A18" />
      {/* ── wide toothy grin ── */}
      <Path d="M26 74 Q50 88 74 74 L72 80 Q50 96 28 80 Z" fill="#2E7A18" />
      <Path d="M30 75 L32 83 L38 75 L44 83 L50 75 L56 83 L62 75 L68 83 L70 75" fill="#FFFFFF" opacity={0.82} />
    </Svg>
  );
}

// Pop Culture — retro CRT TV with antennas
function LogoPopcult() {
  return (
    <Svg viewBox="0 0 100 100" width="78%" height="78%">
      {/* left antenna */}
      <Line x1={34} y1={8} x2={24} y2={28} stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" opacity={0.9} />
      {/* right antenna */}
      <Line x1={66} y1={8} x2={76} y2={28} stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" opacity={0.9} />
      {/* antenna tip dots */}
      <Circle cx={34} cy={7} r={3} fill="#FFFFFF" opacity={0.9} />
      <Circle cx={66} cy={7} r={3} fill="#FFFFFF" opacity={0.9} />
      {/* TV body */}
      <Rect x={8} y={24} width={84} height={62} rx={10} fill="#FFFFFF" opacity={0.92} />
      {/* screen bezel */}
      <Rect x={14} y={30} width={60} height={44} rx={6} fill="#1A1A2E" />
      {/* screen glow — slight scanline look */}
      <Rect x={14} y={30} width={60} height={44} rx={6} fill="#0055CC" opacity={0.15} />
      {/* screen content — classic static/signal lines */}
      <Line x1={18} y1={42} x2={70} y2={42} stroke="#FFFFFF" strokeWidth={1.5} opacity={0.25} />
      <Line x1={18} y1={50} x2={70} y2={50} stroke="#FFFFFF" strokeWidth={1.5} opacity={0.25} />
      <Line x1={18} y1={58} x2={70} y2={58} stroke="#FFFFFF" strokeWidth={1.5} opacity={0.25} />
      {/* play/star icon on screen */}
      <Path d="M38 44 L38 62 L58 53 Z" fill="#FFFFFF" opacity={0.88} />
      {/* right side controls */}
      <Circle cx={84} cy={44} r={4} fill="#CCCCCC" opacity={0.7} />
      <Circle cx={84} cy={56} r={4} fill="#CCCCCC" opacity={0.7} />
      {/* TV base / stand */}
      <Rect x={36} y={86} width={28} height={6} rx={3} fill="#DDDDDD" opacity={0.8} />
      <Rect x={30} y={92} width={40} height={4} rx={2} fill="#DDDDDD" opacity={0.7} />
    </Svg>
  );
}

// Signed & Autographed — 3D blind box with a signature flourish on the front face
function LogoAutographed() {
  return (
    <Svg viewBox="0 0 100 100" width="64%" height="64%">
      <G fill="#FFFFFF" opacity={0.95}>
        {/* lid */}
        <Path d="M50 12 L85 28 L50 44 L15 28 Z" opacity={0.75} />
        {/* front face */}
        <Path d="M15 28 L50 44 L50 90 L15 74 Z" opacity={0.9} />
        {/* side face */}
        <Path d="M85 28 L50 44 L50 90 L85 74 Z" opacity={0.7} />
      </G>
      {/* signature flourish — rotated ~25° to follow the face's horizontal axis */}
      <Path
        d="M22 70 C20 62 26 56 33 60 C40 64 35 74 40 70 L47 64"
        stroke="#fa0ed5"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
        transform="rotate(25, 32, 65)"
      />
    </Svg>
  );
}

// ThrillJoy — smiley face with star eyes inside a thick ring
function LogoThrilljoy() {
  return (
    <Svg viewBox="0 0 100 100" width="69%" height="69%">
      {/* face ring */}
      <Circle cx={50} cy={50} r={44} fill="none" stroke="#FFFFFF" strokeWidth={7} opacity={0.95} />
      {/* left 4-pointed star eye — centre (34, 41) outer R=8 inner R=3.5 */}
      <Polygon
        points="34,33 36.5,38.5 42,41 36.5,43.5 34,49 31.5,43.5 26,41 31.5,38.5"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* right 4-pointed star eye — centre (66, 41) */}
      <Polygon
        points="66,33 68.5,38.5 74,41 68.5,43.5 66,49 63.5,43.5 58,41 63.5,38.5"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* smile arc */}
      <Path d="M28 60 Q50 82 72 60" stroke="#FFFFFF" strokeWidth={5.5} fill="none" strokeLinecap="round" opacity={0.95} />
    </Svg>
  );
}

// ── Logo registry ─────────────────────────────────────────────────────────────

type LogoEntry = { bg: string; component: React.ReactNode };

const LOGOS: Record<string, LogoEntry> = {
  funko:    { bg: '#F5541E', component: <LogoFunko /> },
  tcg:      { bg: '#9C1C4A', component: <LogoTcg /> },
  popmart:  { bg: '#EE2B3B', component: <LogoPopmart /> },
  hottoys:  { bg: '#5C0A14', component: <LogoHottoys /> },
  neca:     { bg: '#AA0000', component: <LogoNeca /> },
  hwheels:  { bg: '#E8272B', component: <LogoHwheels /> },
  onepiece: { bg: '#0C1440', component: <LogoOnepiece /> },
  demon:    { bg: '#1B0000', component: <LogoDemon /> },
  starwars: { bg: '#000000', component: <LogoStarwars /> },
  pokemon:  { bg: '#FFCB05', component: <LogoPokemon /> },
  marvel:   { bg: '#EC1D24', component: <LogoMarvel /> },
  mha:      { bg: '#1B3A6B', component: <LogoMha /> },
  anime:    { bg: '#0D0B2E', component: <LogoAnime /> },
  stranger: { bg: '#0A0A0A', component: <LogoStranger /> },
  tmnt:     { bg: '#1A5C08', component: <LogoTmnt /> },
  labubu:   { bg: '#F5C0C0', component: <LogoLabubu /> },
  disney:   { bg: '#00007A', component: <LogoDisney /> },
  jjk:      { bg: '#0D0D0D', component: <LogoJjk /> },
  dc:       { bg: '#0074E8', component: <LogoDc /> },
  horror:   { bg: '#1A0000', component: <LogoHorror /> },
  gaming:      { bg: '#107C10', component: <LogoGaming /> },
  popcult:     { bg: '#0E1B35', component: <LogoPopcult /> },
  autographed: { bg: '#fa0ed5', component: <LogoAutographed /> },
  thrilljoy:   { bg: '#5FD551', component: <LogoThrilljoy /> },
};

// ── Static fandom images (require paths must be literals) ─────────────────────

const FANDOM_IMAGES: Record<string, any> = {
  anime:    require('../assets/fandoms/anime.png'),
  demon:    require('../assets/fandoms/demon.png'),
  labubu:   require('../assets/fandoms/labubu.png'),
  marvel:   require('../assets/fandoms/marvel.png'),
  onepiece: require('../assets/fandoms/onepiece.png'),
  pokemon:  require('../assets/fandoms/pokemon.png'),
  popcult:  require('../assets/fandoms/popcult.png'),
  starwars: require('../assets/fandoms/starwars.png'),
  tmnt:     require('../assets/fandoms/tmnt.png'),
  disney:   require('../assets/fandoms/disney.png'),
};

// ── Component ─────────────────────────────────────────────────────────────────

interface BrowseLogoProps {
  id: string;
  label: string;
}

export default function BrowseLogo({ id, label }: BrowseLogoProps) {
  const image = FANDOM_IMAGES[id];
  const entry = LOGOS[id];
  const bg = entry?.bg ?? '#1E2D45';

  if (image) {
    return (
      <View style={{ width: '100%', aspectRatio: 1, backgroundColor: bg }}>
        <Image
          source={image}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View style={{
      width: '100%',
      aspectRatio: 1,
      backgroundColor: bg,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {entry ? (
        entry.component
      ) : (
        <Text style={{
          color: '#FFFFFF',
          fontSize: 32,
          fontFamily: 'Inter_700Bold',
          letterSpacing: -0.5,
          opacity: 0.9,
        }}>
          {label.slice(0, 2).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
