/**
 * Accepted synonym groups for common English translations.
 *
 * Keys are the canonical translation (lowercase, trimmed).
 * Values list every form that should be marked CORRECT for that meaning.
 *
 * Inclusion rules:
 *   ✔ Direct lexical equivalents ("hi" / "hello")
 *   ✔ Standard contractions or shortened forms ("thanks" / "thank you")
 *   ✔ Clearly interchangeable informal/formal pairs for greetings/farewells
 *   ✗ Semantically related but non-equivalent words ("greetings", "what's up")
 *   ✗ Phrases that add meaning not present in the source ("how are you" ≠ "hello")
 */
const TRANSLATION_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  // ── Greetings ────────────────────────────────────────────────────────────
  hello: ["hello", "hi", "hey"],
  hi: ["hi", "hello", "hey"],
  hey: ["hey", "hi", "hello"],
  "good morning": ["good morning"],
  "good afternoon": ["good afternoon"],
  "good evening": ["good evening"],
  "good night": ["good night"],
  "good day": ["good day"],

  // ── Farewells ────────────────────────────────────────────────────────────
  goodbye: ["goodbye", "bye", "farewell"],
  bye: ["bye", "goodbye", "farewell"],
  farewell: ["farewell", "goodbye", "bye"],
  "see you": ["see you", "bye"],
  "see you later": ["see you later", "see you", "bye"],
  "see you soon": ["see you soon", "see you"],

  // ── Politeness ───────────────────────────────────────────────────────────
  please: ["please"],
  "thank you": ["thank you", "thanks"],
  thanks: ["thanks", "thank you"],
  "thank you very much": ["thank you very much", "thanks a lot", "thank you so much"],
  "thanks a lot": ["thanks a lot", "thank you very much", "thanks"],
  "you're welcome": ["you're welcome", "no problem", "not at all"],
  "no problem": ["no problem", "you're welcome", "not at all"],
  "not at all": ["not at all", "you're welcome", "no problem"],
  "excuse me": ["excuse me", "pardon me", "pardon"],
  "pardon me": ["pardon me", "excuse me", "pardon"],
  pardon: ["pardon", "excuse me", "pardon me"],
  sorry: ["sorry", "i'm sorry", "apologies"],
  "i'm sorry": ["i'm sorry", "sorry", "apologies"],
  "i am sorry": ["i am sorry", "i'm sorry", "sorry"],
  apologies: ["apologies", "sorry", "i'm sorry"],

  // ── Basic affirmations / negations ───────────────────────────────────────
  yes: ["yes", "yeah", "yep", "yup"],
  yeah: ["yeah", "yes", "yep"],
  yep: ["yep", "yes", "yeah"],
  no: ["no", "nope"],
  nope: ["nope", "no"],
  okay: ["okay", "ok", "alright"],
  ok: ["ok", "okay", "alright"],
  alright: ["alright", "okay", "ok"],
  "of course": ["of course", "certainly", "absolutely", "definitely"],
  certainly: ["certainly", "of course", "absolutely"],
  absolutely: ["absolutely", "of course", "certainly"],
  sure: ["sure", "of course", "certainly"],

  // ── Common noun pairs ────────────────────────────────────────────────────
  house: ["house", "home"],
  home: ["home", "house"],
  child: ["child", "kid"],
  kid: ["kid", "child"],

  // ── Common adjective synonyms ────────────────────────────────────────────
  happy: ["happy", "glad"],
  glad: ["glad", "happy"],
  tired: ["tired", "exhausted"],
  beautiful: ["beautiful", "pretty", "lovely"],
  pretty: ["pretty", "beautiful", "lovely"],
  fast: ["fast", "quick"],
  quick: ["quick", "fast"],
  easy: ["easy", "simple"],
  simple: ["simple", "easy"],
  difficult: ["difficult", "hard"],
  hard: ["hard", "difficult"],
  big: ["big", "large"],
  large: ["large", "big"],
  small: ["small", "little"],
  little: ["little", "small"],
} as const;

/**
 * Return the full list of accepted English meanings for a translation.
 *
 * - Always includes the canonical `translation` itself.
 * - Appends any lesson-defined `explicit` synonyms (e.g. from word.acceptedMeanings).
 * - Appends synonyms from TRANSLATION_SYNONYMS for the canonical form.
 * - Deduplicates (case-insensitive) while preserving insertion order.
 *
 * The result always has at least one entry.
 */
export function getAcceptedMeanings(translation: string, explicit?: string[]): string[] {
  const key = translation.toLowerCase().trim();
  const fromMap = TRANSLATION_SYNONYMS[key] ?? [translation];

  // Merge: canonical first, then map synonyms, then explicit lesson overrides
  const candidates: string[] = [translation, ...fromMap, ...(explicit ?? [])];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of candidates) {
    const norm = m.toLowerCase().trim();
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(m);
    }
  }
  return result;
}
