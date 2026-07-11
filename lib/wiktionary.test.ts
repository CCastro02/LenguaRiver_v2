/**
 * Run: `npx tsx lib/wiktionary.test.ts`
 */
import assert from "node:assert/strict";

import { rankDefinitionCandidate } from "./wiktionary-definition-ranking";
import { parseWiktionaryWikitext } from "./wiktionary";

const dogWikitext = `==English==
===Noun===
# A mechanical device or support that holds something in place.
# A domesticated mammal, Canis familiaris, bred in many varieties as a pet or working animal.
===Verb===
# To hunt with dogs.`;

const dogParsed = parseWiktionaryWikitext(dogWikitext, "en", "dog");
assert.ok(dogParsed?.definition, "dog should return a definition");
assert.ok(
  dogParsed!.definition.toLowerCase().includes("domesticated") ||
    dogParsed!.definition.toLowerCase().includes("mammal"),
  `dog should prefer animal sense, got: ${dogParsed!.definition}`
);
assert.ok(
  !dogParsed!.definition.toLowerCase().includes("mechanical device"),
  `dog should not pick mechanical sense, got: ${dogParsed!.definition}`
);

const catWikitext = `==English==
===Noun===
# {{lb|en|obsolete}} A spiteful person.
# A domesticated mammal, Felis catus, often kept as a pet.`;

const catParsed = parseWiktionaryWikitext(catWikitext, "en", "cat");
assert.ok(catParsed?.definition);
assert.ok(catParsed!.definition.toLowerCase().includes("mammal"));
assert.ok(!catParsed!.definition.toLowerCase().includes("obsolete"));

assert.ok(
  rankDefinitionCandidate("A mechanical device or support.", { word: "dog", language: "en" }) >
    rankDefinitionCandidate(
      "A domesticated mammal, Canis familiaris, bred as a pet.",
      { word: "dog", language: "en" }
    ),
  "mechanical sense should rank worse than animal sense for dog"
);

assert.ok(
  rankDefinitionCandidate("An archaic form of the word.", { word: "table", language: "en" }) >
    rankDefinitionCandidate("A piece of furniture with a flat top.", {
      word: "table",
      language: "en",
    }),
  "obsolete definitions should rank lower"
);

const markupWiki = parseWiktionaryWikitext(
  `==English==
===Noun===
# * quote-journal|date=2017|author=Mark|journal=Nature|title=Only`,
  "en",
  "perhaps"
);
assert.equal(markupWiki, null, "raw markup definitions should be rejected");

console.log("wiktionary.test.ts: all tests passed");
