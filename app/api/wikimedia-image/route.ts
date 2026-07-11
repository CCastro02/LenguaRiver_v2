import { NextResponse } from "next/server";

import {
  isSupportedWikimediaLanguage,
  lookupWikimediaImageForWord,
  type WikimediaImageLookupInput,
  type WikimediaImageResult,
} from "@/lib/wikimedia-image";

export const runtime = "nodejs";

type WikimediaImageRequestBody = WikimediaImageLookupInput;

type WikimediaImageResponse =
  | { ok: true; result: WikimediaImageResult }
  | { ok: false; error: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WikimediaImageRequestBody;
    const text = (body.text ?? "").trim();
    const language = (body.language ?? "").trim().toLowerCase();

    if (!text) {
      return NextResponse.json<WikimediaImageResponse>(
        { ok: false, error: "Missing text." },
        { status: 400 }
      );
    }
    if (!language) {
      return NextResponse.json<WikimediaImageResponse>(
        { ok: false, error: "Missing language." },
        { status: 400 }
      );
    }
    if (!isSupportedWikimediaLanguage(language)) {
      return NextResponse.json<WikimediaImageResponse>(
        { ok: false, error: "Wikimedia image lookup is not supported for this language yet." },
        { status: 400 }
      );
    }

    const result = await lookupWikimediaImageForWord({
      text,
      language,
      definition: body.definition,
      partOfSpeech: body.partOfSpeech,
    });

    if (!result) {
      return NextResponse.json<WikimediaImageResponse>(
        { ok: false, error: "No safe Wikimedia image found." },
        { status: 404 }
      );
    }

    return NextResponse.json<WikimediaImageResponse>({ ok: true, result });
  } catch (error) {
    return NextResponse.json<WikimediaImageResponse>(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Wikimedia image lookup failed.",
      },
      { status: 500 }
    );
  }
}
