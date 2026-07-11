import { autoFixChunk, validateChunk } from "./chunk-normalizer";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testValidChunkWithAccents(): void {
  const sentence = "Perdón, ¿dónde está la estación de tren?";
  const chunk = "la estación de tren";
  assert(validateChunk(sentence, chunk), "accented phrase in sentence should validate");
}

function testPatternChunkWithAnchor(): void {
  const sentence = "¿Dónde está el baño?";
  const fix = autoFixChunk(sentence, "¿dónde está el baño?", { language: "es" });
  assert(fix.text === "¿dónde está ___?", `expected pattern, got ${fix.text}`);
  assert(
    fix.exerciseAnchorText?.toLowerCase().includes("baño") ||
      fix.exerciseAnchorText?.toLowerCase().includes("bano"),
    "anchor should preserve bathroom phrase"
  );
  assert(!fix.warning, `unexpected warning: ${fix.warning}`);
}

function testInvalidCopiedChunk(): void {
  const sentence = "¿En qué área trabaja usted?";
  const chunk = "¿cómo se llama?";
  assert(!validateChunk(sentence, chunk), "copied chunk should not validate");
}

function testAccentInsensitiveInSentence(): void {
  const sentence = "Aqui tiene la llave de la habitacion.";
  const chunk = "la habitacion";
  assert(validateChunk(sentence, chunk), "habitacion chunk should validate in sentence");
}

function testDondeFullQuestionBecomesPattern(): void {
  const sentence = "¿Dónde está el baño?";
  const fix = autoFixChunk(sentence, "¿dónde está el baño?", { language: "es" });
  assert(fix.text === "¿dónde está ___?", `expected pattern, got ${fix.text}`);
  assert(!fix.warning?.includes("fallback"), `unexpected fallback: ${fix.warning}`);
}

function testFourWordPhraseInSentence(): void {
  const sentence = "Luego gire a la derecha en la esquina.";
  const chunk = "gire a la derecha";
  assert(validateChunk(sentence, chunk), "4-word in-sentence phrase should validate");
}

function testRussianChunk(): void {
  const sentence = "Привет, как тебя зовут?";
  const chunk = "как тебя зовут";
  assert(validateChunk(sentence, chunk), "Russian phrase chunk should validate");
}

function run(): void {
  testValidChunkWithAccents();
  testPatternChunkWithAnchor();
  testInvalidCopiedChunk();
  testAccentInsensitiveInSentence();
  testDondeFullQuestionBecomesPattern();
  testFourWordPhraseInSentence();
  testRussianChunk();
  console.log("chunk-normalizer.test.ts: all passed");
}

run();
