/**
 * Run: `npx tsx lib/lexeme-key.test.ts` or `npm run test:lexeme-key`.
 */
import assert from "node:assert/strict";
import {
  buildLexemeKey,
  maybeNormalizeLanguage,
  normalizeLexemeSurface,
  tryParseLexemeKey,
} from "./lexeme-key";

function mustParse(key: string) {
  const p = tryParseLexemeKey(key);
  assert.equal(p.ok, true);
  if (!p.ok) {
    throw new Error("unreachable");
  }
  return p;
}

assert.equal(maybeNormalizeLanguage("  Es-419 "), "es");
assert.equal(maybeNormalizeLanguage("  "), "und");
assert.equal(maybeNormalizeLanguage(undefined), "und");
assert.equal(maybeNormalizeLanguage("ru-RU"), "ru");

assert.equal(normalizeLexemeSurface("  Hola ", "es"), "hola");

assert.equal(normalizeLexemeSurface("Москва", "ru"), "москва");

assert.equal(normalizeLexemeSurface("café \n line", "es"), "café line");

assert.equal(normalizeLexemeSurface("東京", "ja"), "東京");

const piped = normalizeLexemeSurface("foo|bar", "en");
const k = buildLexemeKey("en", "foo|bar");
assert.ok(k.endsWith("|foo|bar"));
const parsed = mustParse(k);
assert.equal(parsed.normalizedSurface, piped);

const stable = buildLexemeKey("es", "Niño");
assert.equal(stable, "lr:v1|es|niño");

console.log(`lexeme-key tests passed (${stable})`);
