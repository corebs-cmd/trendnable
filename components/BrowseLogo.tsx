import React from 'react';
import { View, Text } from 'react-native';
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

// Hot Toys — Iron Man-style helmet face (what Hot Toys is most famous for)
function LogoHottoys() {
  return (
    <Svg viewBox="0 0 100 100" width="70%" height="70%">
      {/* helmet outer shell */}
      <Path d="M50 6 Q82 10 88 34 L86 68 Q82 88 50 94 Q18 88 14 68 L12 34 Q18 10 50 6 Z" fill="#C0C0C0" opacity={0.92} />
      {/* forehead panel */}
      <Path d="M50 10 Q76 14 80 32 L72 32 Q66 18 50 16 Q34 18 28 32 L20 32 Q24 14 50 10 Z" fill="#E8E8E8" opacity={0.85} />
      {/* left eye glow */}
      <Path d="M20 40 L34 36 L38 44 L24 50 Z" fill="#FFD700" opacity={0.95} />
      {/* right eye glow */}
      <Path d="M80 40 L66 36 L62 44 L76 50 Z" fill="#FFD700" opacity={0.95} />
      {/* nose bridge */}
      <Rect x={46} y={44} width={8} height={18} rx={2} fill="#A0A0A0" opacity={0.7} />
      {/* mouth grille */}
      <Path d="M30 68 Q50 62 70 68 L68 78 Q50 84 32 78 Z" fill="#888888" opacity={0.8} />
      {/* grille lines */}
      <Line x1={36} y1={70} x2={34} y2={77} stroke="#5C0A14" strokeWidth={1.5} opacity={0.5} />
      <Line x1={44} y1={68} x2={43} y2={77} stroke="#5C0A14" strokeWidth={1.5} opacity={0.5} />
      <Line x1={50} y1={67} x2={50} y2={77} stroke="#5C0A14" strokeWidth={1.5} opacity={0.5} />
      <Line x1={56} y1={68} x2={57} y2={77} stroke="#5C0A14" strokeWidth={1.5} opacity={0.5} />
      <Line x1={64} y1={70} x2={66} y2={77} stroke="#5C0A14" strokeWidth={1.5} opacity={0.5} />
      {/* chin piece */}
      <Path d="M32 78 Q50 86 68 78 Q66 90 50 94 Q34 90 32 78 Z" fill="#B0B0B0" opacity={0.85} />
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
        <Path d="M40 80 Q50 70 60 80 L60 84 L40 84 Z" fill="#0A1426" />
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
  stranger: { bg: '#0A0A0A', component: <LogoStranger /> },
  labubu:   { bg: '#F5C0C0', component: <LogoLabubu /> },
  disney:   { bg: '#00007A', component: <LogoDisney /> },
  jjk:      { bg: '#0D0D0D', component: <LogoJjk /> },
  dc:       { bg: '#0074E8', component: <LogoDc /> },
  horror:   { bg: '#1A0000', component: <LogoHorror /> },
  gaming:   { bg: '#107C10', component: <LogoGaming /> },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface BrowseLogoProps {
  id: string;
  label: string;
}

export default function BrowseLogo({ id, label }: BrowseLogoProps) {
  const entry = LOGOS[id];
  const bg = entry?.bg ?? '#1E2D45';

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
