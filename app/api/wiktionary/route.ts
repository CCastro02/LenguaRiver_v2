import { NextResponse } from "next/server";

import { isSupportedWiktionaryLanguage, lookupWord } from "@/lib/wiktionary";

export const runtime = "nodejs";

type WiktionaryRequestBody = {
  language?: string;
  word?: string;
};

type WiktionaryResponse =
  | {
      ok: true;
      word: string;
      lookupWord?: string;
      definition: string;
      partOfSpeech: string;
      pronunciation?: string;
      examples: string[];
      note?: string;
    }
  | {
      ok: false;
      error: string;
    };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WiktionaryRequestBody;
    const language = (body.language ?? "").trim().toLowerCase();
    const word = (body.word ?? "").trim();

    if (!word) {
      return NextResponse.json<WiktionaryResponse>({ ok: false, error: "Missing word." }, { status: 400 });
    }
    if (!language) {
      return NextResponse.json<WiktionaryResponse>({ ok: false, error: "Missing language." }, { status: 400 });
    }
    if (!isSupportedWiktionaryLanguage(language)) {
      return NextResponse.json<WiktionaryResponse>(
        { ok: false, error: "Wiktionary lookup is not supported for this language yet." },
        { status: 400 }
      );
    }

    const result = await lookupWord(language, word);
    const definition = result.definition?.trim();
    const pronunciation = result.pronunciation?.trim();
    const partOfSpeech = result.partOfSpeech?.trim();
    if (!definition && !pronunciation && !partOfSpeech) {
      return NextResponse.json<WiktionaryResponse>(
        { ok: false, error: "No Wiktionary definition found." },
        { status: 404 }
      );
    }

    return NextResponse.json<WiktionaryResponse>({
      ok: true,
      word: result.word,
      lookupWord: result.lookupWord,
      definition: definition ?? "",
      partOfSpeech: partOfSpeech ?? "unknown",
      pronunciation,
      examples: result.examples,
      note: result.note,
    });
  } catch (error) {
    return NextResponse.json<WiktionaryResponse>(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Wiktionary lookup failed.",
      },
      { status: 500 }
    );
  }
}
