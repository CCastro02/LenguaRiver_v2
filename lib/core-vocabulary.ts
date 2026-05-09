export type VocabularyLanguage = "es" | "ru";
export type VocabularyPartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "phrase"
  | "preposition"
  | "pronoun"
  | "other";
export type VocabularyImageability = "high" | "medium" | "low";
export type VocabularyRepetitionPriority = "high" | "medium" | "low";
export type VocabularyGender = "masculine" | "feminine" | "neuter" | "none";
export type VocabularyCategory =
  | "general"
  | "food"
  | "hotel"
  | "directions"
  | "introductions"
  | "job-hobbies"
  | "places";

export type CoreVocabularyWord = {
  language: VocabularyLanguage;
  baseForm: string;
  translation: string;
  gender?: VocabularyGender;
  partOfSpeech: VocabularyPartOfSpeech;
  imageability: VocabularyImageability;
  repetitionPriority: VocabularyRepetitionPriority;
  categories: VocabularyCategory[];
};

const rawStarterCoreVocabularySeed: CoreVocabularyWord[] = [
  // Spanish (primary)
  {
    language: "es",
    baseForm: "hola",
    translation: "hello",
    partOfSpeech: "other",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "es",
    baseForm: "buenas tardes",
    translation: "good afternoon",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "es",
    baseForm: "mucho gusto",
    translation: "nice to meet you",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["introductions"],
  },
  {
    language: "es",
    baseForm: "me llamo",
    translation: "my name is",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["introductions"],
  },
  {
    language: "es",
    baseForm: "yo",
    translation: "I",
    partOfSpeech: "pronoun",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "es",
    baseForm: "tu",
    translation: "you",
    partOfSpeech: "pronoun",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "es",
    baseForm: "usted",
    translation: "you (formal)",
    partOfSpeech: "pronoun",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "es",
    baseForm: "soy",
    translation: "I am",
    partOfSpeech: "verb",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["introductions"],
  },
  {
    language: "es",
    baseForm: "vivir",
    translation: "to live",
    partOfSpeech: "verb",
    imageability: "medium",
    repetitionPriority: "medium",
    categories: ["introductions"],
  },
  {
    language: "es",
    baseForm: "chile",
    translation: "Chile",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "low",
    categories: ["places"],
  },
  {
    language: "es",
    baseForm: "españa",
    translation: "Spain",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "low",
    categories: ["places"],
  },
  {
    language: "es",
    baseForm: "rusia",
    translation: "Russia",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "low",
    categories: ["places"],
  },
  {
    language: "es",
    baseForm: "trabajar",
    translation: "to work",
    partOfSpeech: "verb",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "oficina",
    translation: "office",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "escuela",
    translation: "school",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "profesor",
    translation: "teacher",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "ingeniera",
    translation: "engineer",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "low",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "me gusta",
    translation: "I like",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["job-hobbies", "food"],
  },
  {
    language: "es",
    baseForm: "tiempo libre",
    translation: "free time",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "medium",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "fotografia",
    translation: "photography",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "low",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "senderismo",
    translation: "hiking",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "low",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "futbol",
    translation: "soccer",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "quiero",
    translation: "I want",
    partOfSpeech: "verb",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["food", "hotel"],
  },
  {
    language: "es",
    baseForm: "por favor",
    translation: "please",
    partOfSpeech: "other",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "es",
    baseForm: "gracias",
    translation: "thank you",
    partOfSpeech: "other",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "es",
    baseForm: "menu",
    translation: "menu",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "high",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "mesa",
    translation: "table",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "agua",
    translation: "water",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "high",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "arroz",
    translation: "rice",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "sopa",
    translation: "soup",
    gender: "feminine",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "pollo",
    translation: "chicken",
    gender: "masculine",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "salsa",
    translation: "sauce",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "picante",
    translation: "spicy",
    partOfSpeech: "adjective",
    imageability: "medium",
    repetitionPriority: "low",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "sin",
    translation: "without",
    partOfSpeech: "preposition",
    imageability: "low",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "cebolla",
    translation: "onion",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "low",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "cuenta",
    translation: "bill",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["food"],
  },
  {
    language: "es",
    baseForm: "reserva",
    translation: "reservation",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["hotel"],
  },
  {
    language: "es",
    baseForm: "pasaporte",
    translation: "passport",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "high",
    categories: ["hotel"],
  },
  {
    language: "es",
    baseForm: "habitacion",
    translation: "room",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "high",
    categories: ["hotel"],
  },
  {
    language: "es",
    baseForm: "llave",
    translation: "key",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["hotel"],
  },
  {
    language: "es",
    baseForm: "desayuno",
    translation: "breakfast",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["hotel", "food"],
  },
  {
    language: "es",
    baseForm: "a que hora",
    translation: "at what time",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["hotel", "directions"],
  },
  {
    language: "es",
    baseForm: "con vista",
    translation: "with a view",
    partOfSpeech: "phrase",
    imageability: "high",
    repetitionPriority: "low",
    categories: ["hotel"],
  },
  {
    language: "es",
    baseForm: "donde esta",
    translation: "where is",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "es",
    baseForm: "como llego",
    translation: "how do I get",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "es",
    baseForm: "siga recto",
    translation: "go straight",
    partOfSpeech: "phrase",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "es",
    baseForm: "gire a la derecha",
    translation: "turn right",
    partOfSpeech: "phrase",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "es",
    baseForm: "a la izquierda",
    translation: "to the left",
    partOfSpeech: "preposition",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "es",
    baseForm: "esquina",
    translation: "corner",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["directions"],
  },
  {
    language: "es",
    baseForm: "semaforo",
    translation: "traffic light",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["directions"],
  },
  {
    language: "es",
    baseForm: "cerca",
    translation: "near",
    partOfSpeech: "adjective",
    imageability: "medium",
    repetitionPriority: "medium",
    categories: ["directions", "hotel"],
  },
  {
    language: "es",
    baseForm: "desde aqui",
    translation: "from here",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "medium",
    categories: ["directions"],
  },
  {
    language: "es",
    baseForm: "hasta",
    translation: "until",
    partOfSpeech: "preposition",
    imageability: "low",
    repetitionPriority: "medium",
    categories: ["directions"],
  },
  {
    language: "es",
    baseForm: "caminar",
    translation: "to walk",
    partOfSpeech: "verb",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["directions", "job-hobbies"],
  },
  {
    language: "es",
    baseForm: "correr",
    translation: "to run",
    partOfSpeech: "verb",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "leer",
    translation: "to read",
    partOfSpeech: "verb",
    imageability: "medium",
    repetitionPriority: "medium",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "hacer",
    translation: "to do",
    partOfSpeech: "verb",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["job-hobbies", "introductions"],
  },
  {
    language: "es",
    baseForm: "actualmente",
    translation: "currently",
    partOfSpeech: "other",
    imageability: "low",
    repetitionPriority: "low",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "amigos",
    translation: "friends",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["introductions", "job-hobbies"],
  },
  {
    language: "es",
    baseForm: "fin de semana",
    translation: "weekend",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "medium",
    categories: ["job-hobbies"],
  },
  {
    language: "es",
    baseForm: "ayuda",
    translation: "help",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "medium",
    categories: ["directions", "hotel"],
  },
  {
    language: "es",
    baseForm: "perfecto",
    translation: "perfect",
    partOfSpeech: "adjective",
    imageability: "low",
    repetitionPriority: "low",
    categories: ["food", "hotel", "directions"],
  },
  // Russian (secondary)
  {
    language: "ru",
    baseForm: "privet",
    translation: "hello",
    partOfSpeech: "other",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "ru",
    baseForm: "dobryi vecher",
    translation: "good evening",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "ru",
    baseForm: "ya",
    translation: "I",
    partOfSpeech: "pronoun",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "ru",
    baseForm: "ty",
    translation: "you",
    partOfSpeech: "pronoun",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "ru",
    baseForm: "vy",
    translation: "you (formal)",
    partOfSpeech: "pronoun",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "ru",
    baseForm: "ya hochu",
    translation: "I want",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["food", "hotel"],
  },
  {
    language: "ru",
    baseForm: "pozhaluysta",
    translation: "please",
    partOfSpeech: "other",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "ru",
    baseForm: "spasibo",
    translation: "thank you",
    partOfSpeech: "other",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["general"],
  },
  {
    language: "ru",
    baseForm: "menyu",
    translation: "menu",
    gender: "neuter",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "high",
    categories: ["food"],
  },
  {
    language: "ru",
    baseForm: "stolik",
    translation: "table",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "ru",
    baseForm: "voda",
    translation: "water",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "high",
    categories: ["food"],
  },
  {
    language: "ru",
    baseForm: "sup",
    translation: "soup",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "ru",
    baseForm: "kuritsa",
    translation: "chicken",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "ru",
    baseForm: "bez",
    translation: "without",
    partOfSpeech: "preposition",
    imageability: "low",
    repetitionPriority: "medium",
    categories: ["food"],
  },
  {
    language: "ru",
    baseForm: "luk",
    translation: "onion",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "low",
    categories: ["food"],
  },
  {
    language: "ru",
    baseForm: "ostryi",
    translation: "spicy",
    partOfSpeech: "adjective",
    imageability: "medium",
    repetitionPriority: "low",
    categories: ["food"],
  },
  {
    language: "ru",
    baseForm: "schet",
    translation: "bill/check",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["food", "hotel"],
  },
  {
    language: "ru",
    baseForm: "bron",
    translation: "reservation",
    partOfSpeech: "noun",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["hotel"],
  },
  {
    language: "ru",
    baseForm: "pasport",
    translation: "passport",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "high",
    categories: ["hotel"],
  },
  {
    language: "ru",
    baseForm: "nomer",
    translation: "hotel room",
    gender: "masculine",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "high",
    categories: ["hotel"],
  },
  {
    language: "ru",
    baseForm: "klyuch",
    translation: "key",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["hotel"],
  },
  {
    language: "ru",
    baseForm: "gde",
    translation: "where",
    partOfSpeech: "other",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "ru",
    baseForm: "kak",
    translation: "how",
    partOfSpeech: "other",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "ru",
    baseForm: "idti pryamo",
    translation: "go straight",
    partOfSpeech: "phrase",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "ru",
    baseForm: "napravo",
    translation: "to the right",
    partOfSpeech: "other",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "ru",
    baseForm: "nalevo",
    translation: "to the left",
    partOfSpeech: "other",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["directions"],
  },
  {
    language: "ru",
    baseForm: "ugol",
    translation: "corner",
    partOfSpeech: "noun",
    imageability: "high",
    repetitionPriority: "medium",
    categories: ["directions"],
  },
  {
    language: "ru",
    baseForm: "rabotat",
    translation: "to work",
    partOfSpeech: "verb",
    imageability: "medium",
    repetitionPriority: "high",
    categories: ["job-hobbies"],
  },
  {
    language: "ru",
    baseForm: "mne nravitsya",
    translation: "I like",
    partOfSpeech: "phrase",
    imageability: "low",
    repetitionPriority: "high",
    categories: ["job-hobbies", "food"],
  },
];

const SURVIVAL_HIGH_PRIORITY = new Set<string>([
  "hola",
  "privet",
  "buenas tardes",
  "dobryi vecher",
  "yo",
  "ty",
  "tu",
  "ya",
  "soy",
  "ya hochu",
  "quiero",
  "por favor",
  "pozhaluysta",
  "gracias",
  "spasibo",
  "donde esta",
  "gde",
  "como llego",
  "kak",
  "menu",
  "menyu",
  "cuenta",
  "schet",
  "pasaporte",
  "pasport",
  "habitacion",
  "nomer",
  "reserva",
  "bron",
  "me llamo",
  "mne nravitsya",
  "me gusta",
]);

const INTRODUCTION_TERMS = new Set<string>([
  "hola",
  "buenas tardes",
  "privet",
  "dobryi vecher",
  "gracias",
  "spasibo",
  "me llamo",
  "menya zovut",
  "mucho gusto",
]);

const GENERAL_FUNCTION_TERMS = new Set<string>(["por favor", "pozhaluysta"]);

const DIRECTIONAL_TERMS = new Set<string>([
  "a la izquierda",
  "a la derecha",
  "pryamo",
  "idti pryamo",
  "napravo",
  "nalevo",
  "donde esta",
  "como llego",
  "gde",
  "kak",
]);

const NAMED_LOCATION_TERMS = new Set<string>([
  "chile",
  "españa",
  "rusia",
  "rossiya",
  "madrid",
  "moskva",
]);

function getPrimaryCategoryByRules(word: CoreVocabularyWord): VocabularyCategory {
  const base = word.baseForm.toLowerCase();
  const functionPos: VocabularyPartOfSpeech[] = ["pronoun", "verb", "preposition", "other"];

  if (functionPos.includes(word.partOfSpeech) || GENERAL_FUNCTION_TERMS.has(base)) {
    return "general";
  }

  if (INTRODUCTION_TERMS.has(base)) {
    return "introductions";
  }

  if (DIRECTIONAL_TERMS.has(base)) {
    return "directions";
  }

  if (NAMED_LOCATION_TERMS.has(base)) {
    return "places";
  }

  if (word.partOfSpeech === "noun" || word.partOfSpeech === "phrase") {
    const domainCategory = word.categories.find(
      (category) =>
        category === "food" ||
        category === "hotel" ||
        category === "directions" ||
        category === "job-hobbies" ||
        category === "introductions" ||
        category === "places"
    );
    return domainCategory ?? "general";
  }

  return "general";
}

export const rawStarterCoreVocabulary: CoreVocabularyWord[] = rawStarterCoreVocabularySeed.map((word) => ({
  ...word,
  categories: [getPrimaryCategoryByRules(word)],
}));

function normalizeWordCategories(word: CoreVocabularyWord): VocabularyCategory[] {
  return [getPrimaryCategoryByRules(word)];
}

function normalizeRepetitionPriority(word: CoreVocabularyWord): VocabularyRepetitionPriority {
  if (SURVIVAL_HIGH_PRIORITY.has(word.baseForm.toLowerCase())) {
    return "high";
  }
  if (word.categories[0] === "general" && word.partOfSpeech === "other") {
    return "high";
  }
  if (word.categories[0] === "places") {
    return "low";
  }
  return word.repetitionPriority;
}

export const starterCoreVocabulary: CoreVocabularyWord[] = rawStarterCoreVocabulary.map((word) => {
  const categories = normalizeWordCategories(word);
  const repetitionPriority = normalizeRepetitionPriority({ ...word, categories });

  return {
    ...word,
    categories,
    repetitionPriority,
  };
});

export type VocabularyAuditField = "categories" | "partOfSpeech" | "repetitionPriority";

export type VocabularyAuditMismatch = {
  language: VocabularyLanguage;
  baseForm: string;
  field: VocabularyAuditField;
  rawValue: string;
  normalizedValue: string;
};

export function getVocabularyNormalizationAudit(): VocabularyAuditMismatch[] {
  const mismatches: VocabularyAuditMismatch[] = [];

  rawStarterCoreVocabulary.forEach((rawWord, index) => {
    const normalizedWord = starterCoreVocabulary[index];
    if (!normalizedWord) {
      return;
    }

    if (rawWord.categories.join("|") !== normalizedWord.categories.join("|")) {
      mismatches.push({
        language: rawWord.language,
        baseForm: rawWord.baseForm,
        field: "categories",
        rawValue: rawWord.categories.join(", "),
        normalizedValue: normalizedWord.categories.join(", "),
      });
    }

    if (rawWord.partOfSpeech !== normalizedWord.partOfSpeech) {
      mismatches.push({
        language: rawWord.language,
        baseForm: rawWord.baseForm,
        field: "partOfSpeech",
        rawValue: rawWord.partOfSpeech,
        normalizedValue: normalizedWord.partOfSpeech,
      });
    }

    if (rawWord.repetitionPriority !== normalizedWord.repetitionPriority) {
      mismatches.push({
        language: rawWord.language,
        baseForm: rawWord.baseForm,
        field: "repetitionPriority",
        rawValue: rawWord.repetitionPriority,
        normalizedValue: normalizedWord.repetitionPriority,
      });
    }
  });

  return mismatches;
}

export function logVocabularyNormalizationAudit(): VocabularyAuditMismatch[] {
  const mismatches = getVocabularyNormalizationAudit();
  if (mismatches.length === 0) {
    console.info("Vocabulary audit: no normalization mismatches found.");
    return mismatches;
  }
  console.table(mismatches);
  return mismatches;
}
