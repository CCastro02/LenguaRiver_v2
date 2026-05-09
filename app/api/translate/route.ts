import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

type TranslateResponse =
  | {
      ok: true;
      translation: string;
    }
  | {
      ok: false;
      error: string;
    };

type TranslateRequestBody = {
  text?: string;
  from?: string;
  to?: string;
};

export const runtime = "nodejs";

function resolvePythonBins(): string[] {
  const bins: string[] = [];
  if (process.env.TRANSLATE_PYTHON_BIN) {
    bins.push(process.env.TRANSLATE_PYTHON_BIN);
  }
  if (process.env.WHISPER_PYTHON_BIN) {
    bins.push(process.env.WHISPER_PYTHON_BIN);
  }
  if (process.platform === "win32") {
    const windowsVenvPython = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
    if (existsSync(windowsVenvPython)) {
      bins.push(windowsVenvPython);
    }
  }
  bins.push("python");
  return bins.filter((bin, index, all) => all.indexOf(bin) === index);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TranslateRequestBody;
    const text = (body.text ?? "").trim();
    const fromLang = (body.from ?? "").trim().toLowerCase();
    const toLang = (body.to ?? "").trim().toLowerCase();

    if (!text) {
      return NextResponse.json<TranslateResponse>({ ok: false, error: "Missing text." }, { status: 400 });
    }
    if (!fromLang || !toLang) {
      return NextResponse.json<TranslateResponse>(
        { ok: false, error: "Missing source or target language." },
        { status: 400 }
      );
    }

    const scriptPath = path.join(process.cwd(), "scripts", "translate", "translate.py");
    let lastError: unknown = null;
    const pythonBins = resolvePythonBins();

    for (const pythonBin of pythonBins) {
      try {
        const { stdout } = await execFileAsync(pythonBin, [scriptPath, text, fromLang, toLang], {
          maxBuffer: 1024 * 1024 * 5,
          windowsHide: true,
        });
        const parsed = JSON.parse(stdout.trim()) as TranslateResponse;
        return NextResponse.json<TranslateResponse>(parsed, { status: parsed.ok ? 200 : 503 });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("Translation failed.");
  } catch (error) {
    return NextResponse.json<TranslateResponse>(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Translation failed.",
      },
      { status: 500 }
    );
  }
}
