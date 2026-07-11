import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { isTranslateDebugEnabled, translateDebug, translateDebugEnv } from "@/lib/translate-debug";
import {
  findTranslateProjectRoot,
  pythonBinExists,
  resolveTranslatePythonBins,
  translateScriptPath,
} from "@/lib/translate-python";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const STATUS_EXEC_TIMEOUT_MS = 5_000;

export type TranslateStatusPayload = {
  ready: boolean;
  from: string;
  to: string;
  pythonPathUsed: string | null;
  pythonExists: boolean;
  installedPairs: string[];
  stderr: string | null;
  argosPackageDir: string | null;
  projectRoot?: string;
  pythonCandidates?: string[];
};

function execErrorDetail(error: unknown): { message: string; stderr: string | null } {
  if (typeof error === "object" && error !== null) {
    const withStderr = error as { message?: string; stderr?: string };
    return {
      message: withStderr.message ?? "status check failed",
      stderr: typeof withStderr.stderr === "string" && withStderr.stderr.trim() ? withStderr.stderr.trim() : null,
    };
  }
  return { message: "status check failed", stderr: null };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fromLang = (url.searchParams.get("from") ?? "es").trim().toLowerCase();
  const toLang = (url.searchParams.get("to") ?? "en").trim().toLowerCase();
  const pair = `${fromLang} -> ${toLang}`;
  const projectRoot = findTranslateProjectRoot();
  const statusScript = translateScriptPath("status.py");
  const pythonBins = resolveTranslatePythonBins();

  if (isTranslateDebugEnabled()) {
    translateDebug("status_request", { pair, projectRoot, pythonCandidates: pythonBins, statusScript });
  }

  let lastFailure: TranslateStatusPayload | null = null;

  for (const pythonBin of pythonBins) {
    try {
      const { stdout, stderr } = await execFileAsync(pythonBin, [statusScript, fromLang, toLang], {
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        timeout: STATUS_EXEC_TIMEOUT_MS,
        env: translateDebugEnv(),
        cwd: projectRoot,
      });

      const parsed = JSON.parse(stdout.trim()) as Partial<TranslateStatusPayload>;
      const payload: TranslateStatusPayload = {
        ready: Boolean(parsed.ready),
        from: fromLang,
        to: toLang,
        pythonPathUsed: typeof parsed.pythonPathUsed === "string" ? parsed.pythonPathUsed : pythonBin,
        pythonExists: pythonBinExists(pythonBin),
        installedPairs: Array.isArray(parsed.installedPairs)
          ? parsed.installedPairs.filter((entry): entry is string => typeof entry === "string")
          : [],
        stderr:
          typeof parsed.stderr === "string" && parsed.stderr.trim()
            ? parsed.stderr.trim()
            : stderr.trim() || null,
        argosPackageDir: typeof parsed.argosPackageDir === "string" ? parsed.argosPackageDir : null,
        projectRoot,
        pythonCandidates: pythonBins,
      };

      if (isTranslateDebugEnabled()) {
        translateDebug("status_result", { pair, pythonBin, payload });
      }

      if (payload.ready) {
        return NextResponse.json(payload);
      }

      lastFailure = payload;
    } catch (error) {
      const detail = execErrorDetail(error);
      lastFailure = {
        ready: false,
        from: fromLang,
        to: toLang,
        pythonPathUsed: pythonBin,
        pythonExists: pythonBinExists(pythonBin),
        installedPairs: [],
        stderr: detail.stderr ?? detail.message,
        argosPackageDir: null,
        projectRoot,
        pythonCandidates: pythonBins,
      };
      if (isTranslateDebugEnabled()) {
        translateDebug("status_exec_error", { pair, pythonBin, reason: detail.message, stderr: detail.stderr });
      }
    }
  }

  if (isTranslateDebugEnabled()) {
    translateDebug("status_failure", { pair, reason: "no_python_bin_succeeded", lastFailure });
  }

  return NextResponse.json(
    lastFailure ?? {
      ready: false,
      from: fromLang,
      to: toLang,
      pythonPathUsed: null,
      pythonExists: false,
      installedPairs: [],
      stderr: "No Python executable succeeded.",
      argosPackageDir: null,
      projectRoot,
      pythonCandidates: pythonBins,
    }
  );
}
