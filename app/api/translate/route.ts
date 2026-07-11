import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { isTranslateDebugEnabled, translateDebug, translateDebugEnv } from "@/lib/translate-debug";
import { findTranslateProjectRoot, resolveTranslatePythonBins, translateScriptPath } from "@/lib/translate-python";

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

/** Kill hung Argos model downloads / translate subprocess (client times out at 10s). */
const TRANSLATE_EXEC_TIMEOUT_MS = 12_000;

function execErrorDetail(error: unknown): { message: string; timedOut: boolean } {
  const timedOut =
    typeof error === "object" &&
    error !== null &&
    "killed" in error &&
    Boolean((error as { killed?: boolean }).killed);
  const message = error instanceof Error ? error.message : "Translation failed.";
  return { message, timedOut };
}

export async function POST(request: Request) {
  const projectRoot = findTranslateProjectRoot();
  const pythonBins = resolveTranslatePythonBins();
  const scriptPath = translateScriptPath("translate.py");

  try {
    const body = (await request.json()) as TranslateRequestBody;
    const text = (body.text ?? "").trim();
    const fromLang = (body.from ?? "").trim().toLowerCase();
    const toLang = (body.to ?? "").trim().toLowerCase();

    if (isTranslateDebugEnabled()) {
      translateDebug("request", {
        from: fromLang,
        to: toLang,
        text,
        projectRoot,
        pythonCandidates: pythonBins,
        scriptPath,
      });
    }

    if (!text) {
      return NextResponse.json<TranslateResponse>({ ok: false, error: "Missing text." }, { status: 400 });
    }
    if (!fromLang || !toLang) {
      return NextResponse.json<TranslateResponse>(
        { ok: false, error: "Missing source or target language." },
        { status: 400 }
      );
    }

    let lastError: unknown = null;

    for (const pythonBin of pythonBins) {
      try {
        if (isTranslateDebugEnabled()) {
          translateDebug("exec", { pythonBin, pair: `${fromLang} -> ${toLang}` });
        }
        const { stdout, stderr } = await execFileAsync(pythonBin, [scriptPath, text, fromLang, toLang], {
          maxBuffer: 1024 * 1024 * 5,
          windowsHide: true,
          timeout: TRANSLATE_EXEC_TIMEOUT_MS,
          env: translateDebugEnv(),
          cwd: projectRoot,
        });
        if (isTranslateDebugEnabled() && stderr.trim()) {
          translateDebug("python_stderr", { pythonBin, stderr: stderr.trim() });
        }
        const parsed = JSON.parse(stdout.trim()) as TranslateResponse;
        if (isTranslateDebugEnabled()) {
          translateDebug(parsed.ok ? "success" : "failure", {
            pythonBin,
            pair: `${fromLang} -> ${toLang}`,
            ...(parsed.ok ? { translation: parsed.translation } : { reason: parsed.error }),
          });
        }
        return NextResponse.json<TranslateResponse>(parsed, { status: parsed.ok ? 200 : 503 });
      } catch (error) {
        lastError = error;
        if (isTranslateDebugEnabled()) {
          const detail = execErrorDetail(error);
          translateDebug("exec_error", {
            pythonBin,
            pair: `${fromLang} -> ${toLang}`,
            timedOut: detail.timedOut,
            reason: detail.message,
          });
        }
      }
    }

    throw lastError ?? new Error("Translation failed.");
  } catch (error) {
    const { message, timedOut } = execErrorDetail(error);
    if (isTranslateDebugEnabled()) {
      translateDebug("route_failure", {
        timedOut,
        reason: message,
        projectRoot,
        pythonCandidates: pythonBins,
      });
    }
    return NextResponse.json<TranslateResponse>(
      {
        ok: false,
        error: timedOut ? "Translation timed out." : message,
      },
      { status: timedOut ? 504 : 500 }
    );
  }
}
