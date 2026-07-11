/**
 * Run: `npx tsx lib/wikimedia-image.test.ts`
 */
import assert from "node:assert/strict";

import {
  isCommonConcreteNoun,
  isNonImageableLookupTerm,
  lookupWikimediaImageForWord,
  normalizeWikimediaSearchText,
  parseCommonsImageInfoResponse,
  sanitizeWikimediaMetadata,
} from "./wikimedia-image";

assert.equal(isNonImageableLookupTerm("perhaps"), true);
assert.equal(isNonImageableLookupTerm("expects"), true);
assert.equal(isNonImageableLookupTerm("learning"), true);
assert.equal(isNonImageableLookupTerm("table", "noun"), false);
assert.equal(isCommonConcreteNoun("dog"), true);
assert.equal(isNonImageableLookupTerm("dog", "verb"), false, "concrete nouns may image even with wrong POS");

assert.equal(normalizeWikimediaSearchText("La mesa", "es"), "mesa");
assert.equal(normalizeWikimediaSearchText("  El Pollo  ", "es"), "pollo");

assert.equal(
  sanitizeWikimediaMetadata('<a href="/x">Jane Doe</a> &amp; Co.'),
  "Jane Doe & Co."
);

const commonsPayload = {
  query: {
    pages: {
      "1": {
        title: "File:Test chicken.jpg",
        imageinfo: [
          {
            thumburl: "https://upload.wikimedia.org/thumb/a/aa/chicken.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Test_chicken.jpg",
            extmetadata: {
              Artist: { value: "<b>Photographer</b> Name" },
              LicenseShortName: { value: "CC BY 4.0" },
              LicenseUrl: {
                value: "https://creativecommons.org/licenses/by/4.0/",
              },
            },
          },
        ],
      },
    },
  },
};

const parsed = parseCommonsImageInfoResponse("File:Test chicken.jpg", commonsPayload);
assert.ok(parsed);
assert.equal(parsed.imageUrl, "https://upload.wikimedia.org/thumb/a/aa/chicken.jpg");
assert.equal(parsed.imageAttribution, "Photographer Name");
assert.equal(parsed.imageLicense, "CC BY 4.0");
assert.equal(parsed.imagePageUrl, "https://commons.wikimedia.org/wiki/File:Test_chicken.jpg");

const rejectedLicense = parseCommonsImageInfoResponse("File:Bad.jpg", {
  query: {
    pages: {
      "2": {
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/x.jpg",
            extmetadata: {
              LicenseShortName: { value: "Non-commercial" },
            },
          },
        ],
      },
    },
  },
});
assert.equal(rejectedLicense, null);

async function runAsyncTests(): Promise<void> {
let fetchCalls = 0;
const mockFetch: typeof fetch = async (input) => {
  fetchCalls += 1;
  const url = String(input);
  if (url.includes("wbsearchentities")) {
    return new Response(
      JSON.stringify({
        search: [
          {
            id: "Q123",
            label: "mesa",
            description: "piece of furniture with a flat top",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  if (url.includes("wbgetentities")) {
    return new Response(
      JSON.stringify({
        entities: {
          Q123: {
            id: "Q123",
            labels: { es: { value: "mesa" } },
            claims: {
              P18: [{ mainsnak: { datavalue: { value: "Table.jpg" } } }],
            },
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  if (url.includes("commons.wikimedia.org")) {
    return new Response(JSON.stringify(commonsPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("{}", { status: 404 });
};

const lookupResult = await lookupWikimediaImageForWord(
  { text: "mesa", language: "es" },
  { fetch: mockFetch }
);
assert.ok(lookupResult);
assert.equal(lookupResult.imageSource, "wikimedia");
assert.equal(lookupResult.wikidataEntityId, "Q123");
assert.ok(fetchCalls >= 3);

const noP18Fetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("wbsearchentities")) {
    return new Response(
      JSON.stringify({
        search: [{ id: "Q999", label: "ghost", description: "fictional character" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  if (url.includes("wbgetentities")) {
    return new Response(
      JSON.stringify({
        entities: { Q999: { id: "Q999", labels: { en: { value: "ghost" } }, claims: {} } },
      }),
      { status: 200 }
    );
  }
  return new Response("{}", { status: 404 });
};

const noP18 = await lookupWikimediaImageForWord(
  { text: "ghost", language: "en" },
  { fetch: noP18Fetch }
);
assert.equal(noP18, null);

const ambiguousFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("wbsearchentities")) {
    return new Response(
      JSON.stringify({
        search: [
          { id: "Q1", label: "bank", description: "financial institution" },
          { id: "Q2", label: "bank", description: "land alongside a river" },
        ],
      }),
      { status: 200 }
    );
  }
  return new Response("{}", { status: 404 });
};

const ambiguous = await lookupWikimediaImageForWord(
  { text: "bank", language: "en" },
  { fetch: ambiguousFetch }
);
assert.equal(ambiguous, null);

const fetchCallsBeforeAbstract = fetchCalls;
const abstractLookup = await lookupWikimediaImageForWord(
  { text: "perhaps", language: "en" },
  { fetch: mockFetch }
);
assert.equal(abstractLookup, null);
assert.equal(fetchCalls, fetchCallsBeforeAbstract, "abstract terms must not call Wikidata");

const dogCommonsPayload = {
  query: {
    pages: {
      "9": {
        title: "File:YellowLabradorLooking_new.jpg",
        imageinfo: [
          {
            thumburl: "https://upload.wikimedia.org/thumb/dog.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:YellowLabradorLooking_new.jpg",
            extmetadata: {
              Artist: { value: "Test Photographer" },
              LicenseShortName: { value: "CC BY-SA 4.0" },
              LicenseUrl: {
                value: "https://creativecommons.org/licenses/by-sa/4.0/",
              },
            },
          },
        ],
      },
    },
  },
};

const dogFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("wbsearchentities")) {
    return new Response(
      JSON.stringify({
        search: [
          {
            id: "Q12345",
            label: "Dog",
            description: "American rock band",
          },
          {
            id: "Q144",
            label: "dog",
            description: "domesticated species of mammal",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  if (url.includes("wbgetentities")) {
    return new Response(
      JSON.stringify({
        entities: {
          Q144: {
            id: "Q144",
            labels: { en: { value: "dog" } },
            claims: {
              P18: [{ mainsnak: { datavalue: { value: "YellowLabradorLooking_new.jpg" } } }],
            },
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  if (url.includes("commons.wikimedia.org")) {
    return new Response(JSON.stringify(dogCommonsPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response("{}", { status: 404 });
};

const dogLookup = await lookupWikimediaImageForWord(
  {
    text: "dog",
    language: "en",
    partOfSpeech: "noun",
    definition: "A domesticated mammal, Canis familiaris, bred as a pet.",
  },
  { fetch: dogFetch }
);
assert.ok(dogLookup, "dog should resolve a Wikimedia image");
assert.equal(dogLookup.wikidataEntityId, "Q144");
assert.equal(dogLookup.imageSource, "wikimedia");
assert.ok(dogLookup.imageUrl.includes("dog.jpg"));
}

void runAsyncTests().then(() => {
  console.log("wikimedia-image.test.ts: all tests passed");
});
