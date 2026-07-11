/**
 * Phase 1 curated static image map for My Words enrichment.
 * Local bundled assets only — no remote URLs or generation.
 */

import {
  buildSpanishCorpusLookupNeedles,
  stripLeadingSpanishArticles,
} from "@/lib/lesson-chunk-corpus-lookup";

export type CuratedWordImageInput = {
  language: string;
  text: string;
  lexemeKey?: string;
  partOfSpeech?: string;
};

export type CuratedWordImageResult = {
  imageUrl: string;
  imageSource: "curated";
  imageAlt: string;
};

type CuratedAssetEntry = {
  /** Public path under `/public`. */
  imageUrl: string;
  imageAlt: string;
  /** Surface phrases that resolve to this asset (pre-normalization forms allowed). */
  phrases: string[];
};

/** Fold Spanish diacritics for lookup keys only (does not mutate stored learner text). */
export function foldSpanishAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

function lessonLanguageBase(languageTag: string): string {
  return languageTag.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
}

function normalizeCuratedLookupKey(phrase: string): string {
  const lowered = phrase.normalize("NFC").trim().toLowerCase().replace(/\s+/gu, " ");
  const stripped = stripLeadingSpanishArticles(lowered);
  return foldSpanishAccents(stripped);
}

function surfaceFromLexemeKey(lexemeKey: string | undefined): string | undefined {
  if (!lexemeKey?.trim()) {
    return undefined;
  }
  const parts = lexemeKey.split("|");
  const tail = parts[parts.length - 1]?.trim();
  return tail || undefined;
}

const CURATED_ASSETS: CuratedAssetEntry[] = [
  {
    imageUrl: "/images/chunks/mesa.png",
    imageAlt: "Mesa",
    phrases: ["mesa", "mesas", "una mesa"],
  },
  {
    imageUrl: "/images/chunks/menu.png",
    imageAlt: "Menú",
    phrases: ["menu", "menú", "el menu", "el menú"],
  },
  {
    imageUrl: "/images/chunks/cuenta.png",
    imageAlt: "Cuenta",
    phrases: ["cuenta", "la cuenta"],
  },
  {
    imageUrl: "/images/chunks/quiero.png",
    imageAlt: "Quiero",
    phrases: ["quiero"],
  },
  {
    imageUrl: "/images/chunks/sin-cebolla.png",
    imageAlt: "Sin cebolla",
    phrases: ["cebolla", "sin cebolla"],
  },
  {
    imageUrl: "/images/chunks/agua.png",
    imageAlt: "Agua",
    phrases: ["agua", "quiero agua"],
  },
  {
    imageUrl: "/images/chunks/arroz.png",
    imageAlt: "Arroz",
    phrases: ["arroz"],
  },
  {
    imageUrl: "/images/chunks/sopa.png",
    imageAlt: "Sopa",
    phrases: ["sopa", "la sopa"],
  },
  {
    imageUrl: "/images/chunks/pollo.png",
    imageAlt: "Pollo",
    phrases: ["pollo", "el pollo"],
  },
  {
    imageUrl: "/images/chunks/salsa.png",
    imageAlt: "Salsa",
    phrases: ["salsa", "la salsa"],
  },
  {
    imageUrl: "/images/chunks/picante.png",
    imageAlt: "Picante",
    phrases: ["picante"],
  },
  {
    imageUrl: "/images/chunks/habitacion.png",
    imageAlt: "Habitación",
    phrases: [
      "habitacion",
      "habitación",
      "la habitacion",
      "la habitación",
      "su habitacion",
      "su habitación",
      "habitaciones",
    ],
  },
  {
    imageUrl: "/images/chunks/pasaporte.png",
    imageAlt: "Pasaporte",
    phrases: ["pasaporte", "mi pasaporte"],
  },
  {
    imageUrl: "/images/chunks/desayuno.png",
    imageAlt: "Desayuno",
    phrases: ["desayuno", "el desayuno"],
  },
  {
    imageUrl: "/images/chunks/desayuno-incluido.png",
    imageAlt: "Desayuno incluido",
    phrases: ["desayuno incluido"],
  },
  {
    imageUrl: "/images/chunks/llave.png",
    imageAlt: "Llave",
    phrases: ["llave", "la llave", "llaves"],
  },
  {
    imageUrl: "/images/chunks/escuela.png",
    imageAlt: "Escuela",
    phrases: ["escuela", "una escuela"],
  },
  {
    imageUrl: "/images/chunks/oficina.png",
    imageAlt: "Oficina",
    phrases: ["oficina", "una oficina"],
  },
  {
    imageUrl: "/images/chunks/fotografia.png",
    imageAlt: "Fotografía",
    phrases: ["fotografia", "fotografía"],
  },
  {
    imageUrl: "/images/chunks/estacion-tren.png",
    imageAlt: "Estación de tren",
    phrases: ["estacion de tren", "estación de tren", "la estacion de tren", "la estación de tren"],
  },
  {
    imageUrl: "/images/chunks/semaforo.png",
    imageAlt: "Semáforo",
    phrases: ["semaforo", "semáforo", "el semaforo", "el semáforo"],
  },
  {
    imageUrl: "/images/chunks/esquina.png",
    imageAlt: "Esquina",
    phrases: ["esquina", "la esquina"],
  },
  {
    imageUrl: "/images/chunks/cafe.png",
    imageAlt: "Café",
    phrases: ["cafe", "café", "el café", "el cafe"],
  },
  {
    imageUrl: "/images/chunks/senderismo.png",
    imageAlt: "Senderismo",
    phrases: ["senderismo"],
  },
  {
    imageUrl: "/images/chunks/reserva.png",
    imageAlt: "Reserva",
    phrases: ["reserva", "tengo una reserva"],
  },
  {
    imageUrl: "/images/chunks/vista.png",
    imageAlt: "Vista",
    phrases: ["vista", "con vista"],
  },
];

const CURATED_LOOKUP = new Map<string, CuratedWordImageResult>();

for (const asset of CURATED_ASSETS) {
  const result: CuratedWordImageResult = {
    imageUrl: asset.imageUrl,
    imageSource: "curated",
    imageAlt: asset.imageAlt,
  };
  for (const phrase of asset.phrases) {
    const key = normalizeCuratedLookupKey(phrase);
    if (key && !CURATED_LOOKUP.has(key)) {
      CURATED_LOOKUP.set(key, result);
    }
    for (const needle of buildSpanishCorpusLookupNeedles(phrase)) {
      const needleKey = normalizeCuratedLookupKey(needle);
      if (needleKey && !CURATED_LOOKUP.has(needleKey)) {
        CURATED_LOOKUP.set(needleKey, result);
      }
    }
  }
}

function buildCuratedLookupNeedles(input: CuratedWordImageInput): string[] {
  const surfaces = new Set<string>();
  const trimmed = input.text.trim();
  if (trimmed) {
    surfaces.add(trimmed);
  }
  const fromLexeme = surfaceFromLexemeKey(input.lexemeKey);
  if (fromLexeme) {
    surfaces.add(fromLexeme);
  }

  const needles = new Set<string>();
  for (const surface of surfaces) {
    for (const needle of buildSpanishCorpusLookupNeedles(surface)) {
      needles.add(normalizeCuratedLookupKey(needle));
    }
  }
  return [...needles].filter(Boolean);
}

/**
 * Resolve a bundled curated chunk image for Spanish wild words.
 * Returns null when language is not Spanish or no map entry matches.
 */
export function lookupCuratedWordImage(input: CuratedWordImageInput): CuratedWordImageResult | null {
  if (lessonLanguageBase(input.language) !== "es") {
    return null;
  }

  for (const key of buildCuratedLookupNeedles(input)) {
    const hit = CURATED_LOOKUP.get(key);
    if (hit) {
      return hit;
    }
  }
  return null;
}
