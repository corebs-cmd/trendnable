import React, { useState } from 'react';
import { View, Image, Text } from 'react-native';

type LogoEntry = {
  url: string;
  bg: string;
  inset: number; // fraction of container to pad on each side (0–0.4)
};

// All PNG thumbnail URLs from Wikimedia Commons / Wikipedia — stable CDN.
const LOGOS: Record<string, LogoEntry> = {
  // ── Categories ─────────────────────────────────────────────────────────────
  funko: {
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cc/Funko.svg/400px-Funko.svg.png',
    bg: '#D0252A',
    inset: 0.16,
  },
  tcg: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Pok%C3%A9mon_Trading_Card_Game_logo.svg/400px-Pok%C3%A9mon_Trading_Card_Game_logo.svg.png',
    bg: '#003A70',
    inset: 0.12,
  },
  popmart: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Pop_Mart_logo.svg/400px-Pop_Mart_logo.svg.png',
    bg: '#EE2B3B',
    inset: 0.18,
  },
  hottoys: {
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Hottoys-logo.jpg/400px-Hottoys-logo.jpg',
    bg: '#111111',
    inset: 0.14,
  },
  neca: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Neca_company_logo.png/400px-Neca_company_logo.png',
    bg: '#CC0000',
    inset: 0.14,
  },
  hwheels: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Hot_wheels_textlogo.svg/400px-Hot_wheels_textlogo.svg.png',
    bg: '#E8272B',
    inset: 0.12,
  },
  // ── Fandoms ────────────────────────────────────────────────────────────────
  onepiece: {
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/13/One_Piece_Anime_Logo_International.png/400px-One_Piece_Anime_Logo_International.png',
    bg: '#0C1440',
    inset: 0.08,
  },
  demon: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Kimetsu_no_Yaiba_logo.svg/400px-Kimetsu_no_Yaiba_logo.svg.png',
    bg: '#1B0000',
    inset: 0.08,
  },
  starwars: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Star_Wars_Logo.svg/400px-Star_Wars_Logo.svg.png',
    bg: '#000000',
    inset: 0.1,
  },
  pokemon: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Pokemon_logo.png/400px-Pokemon_logo.png',
    bg: '#FFCB05',
    inset: 0.1,
  },
  marvel: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Marvel_Logo.svg/400px-Marvel_Logo.svg.png',
    bg: '#EC1D24',
    inset: 0.2,
  },
  mha: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/My_Hero_Academia_-_international_logo.png/400px-My_Hero_Academia_-_international_logo.png',
    bg: '#1B3A6B',
    inset: 0.1,
  },
  stranger: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Stranger_Things_logo.svg/400px-Stranger_Things_logo.svg.png',
    bg: '#000000',
    inset: 0.08,
  },
  labubu: {
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/Pop_Mart_Labubu_The_Monsters_Exciting_Macaron.jpg/400px-Pop_Mart_Labubu_The_Monsters_Exciting_Macaron.jpg',
    bg: '#F5C0C0',
    inset: 0,
  },
  disney: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Walt_Disney_wordmark.svg/400px-Walt_Disney_wordmark.svg.png',
    bg: '#00007A',
    inset: 0.18,
  },
  jjk: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Jujutsu_Kaisen_logo.svg/400px-Jujutsu_Kaisen_logo.svg.png',
    bg: '#0D0D0D',
    inset: 0.1,
  },
  dc: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/DC_Comics_logo.svg/400px-DC_Comics_logo.svg.png',
    bg: '#0074E8',
    inset: 0.18,
  },
  horror: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Slash_filmworks_logo.svg/400px-Slash_filmworks_logo.svg.png',
    bg: '#1A0000',
    inset: 0.14,
  },
  gaming: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Xbox_logo_2019.svg/400px-Xbox_logo_2019.svg.png',
    bg: '#107C10',
    inset: 0.18,
  },
};

interface BrowseLogoProps {
  id: string;
  label: string;
}

export default function BrowseLogo({ id, label }: BrowseLogoProps) {
  const [error, setError] = useState(false);
  const entry = LOGOS[id];

  const bg = entry?.bg ?? '#1E2D45';
  const inset = entry?.inset ?? 0.14;

  return (
    <View style={{
      width: '100%',
      aspectRatio: 1,
      backgroundColor: bg,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {entry && !error ? (
        <Image
          source={{ uri: entry.url }}
          style={{
            width: `${Math.round((1 - inset * 2) * 100)}%`,
            height: `${Math.round((1 - inset * 2) * 100)}%`,
          }}
          resizeMode="contain"
          onError={() => setError(true)}
        />
      ) : (
        // Fallback: two-letter initials
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
