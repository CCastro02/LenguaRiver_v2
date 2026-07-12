import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { extensionForAudioMimeType } from "@/lib/recorded-audio";

const execFileAsync = promisify(execFile);
const ALLOWED_LANGUAGES = new Set(["es", "ru", "en"]);

type TranscriptionResponse =
  | {
      ok: true;
      transcript: string;
      language: string;
    }
  | {
      ok: false;
      error: string;
    };

function resolvePythonBin(): string {
  if (process.env.WHISPER_PYTHON_BIN) {
    return process.env.WHISPER_PYTHON_BIN;
  }

  if (process.platform === "win32") {
    const windowsVenvPython = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
    if (existsSync(windowsVenvPython)) {
      return windowsVenvPython;
    }
  }

  return "python";
}

export async function POST(request: Request) {
  let tempPath: string | null = null;

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const language = form.get("language");
    console.log("[api] received audio");

    if (!(audio instanceof File)) {
      return NextResponse.json<TranscriptionResponse>(
        { ok: false, error: "Missing audio file." },
        { status: 400 }
      );
    }

    if (typeof language !== "string" || !ALLOWED_LANGUAGES.has(language)) {
      return NextResponse.json<TranscriptionResponse>(
        { ok: false, error: "Invalid language. Expected es, ru, or en." },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV === "production" && process.env.ENABLE_LOCAL_WHISPER !== "true") {
      return NextResponse.json<TranscriptionResponse>(
        {
          ok: false,
          error: "Server transcription is disabled in production. Use browser speech recognition or type what you said.",
        },
        { status: 503 }
      );
    }

    const tempDir = path.join(tmpdir(), "lenguariver-speech");
    await mkdir(tempDir, { recursive: true });
    tempPath = path.join(tempDir, `${randomUUID()}${extensionForAudioMimeType(audio.type)}`);
    await writeFile(tempPath, Buffer.from(await audio.arrayBuffer()));

    const scriptPath = path.join(process.cwd(), "scripts", "speech", "transcribe.py");
    const pythonBin = resolvePythonBin();
    if (process.env.NODE_ENV === "development") {
      console.log("[api] python bin:", pythonBin);
    }
    console.log("[api] running python script");
    // Force UTF-8 on the Python child's stdio. Without this, Python on Windows
    // encodes stdout using the system codepage (cp1252 etc.) which corrupts
    // Spanish accents like "¿/ó/á" — Node then decodes the bytes as UTF-8 and
    // substitutes U+FFFD ("�"), so the browser sees "�C�mo est�s?" instead of
    // "¿Cómo estás?". The Python script also calls sys.stdout.reconfigure
    // for the same reason; doing both is intentional belt-and-suspenders.
    const { stdout } = await execFileAsync(pythonBin, [scriptPath, tempPath, language], {
      maxBuffer: 1024 * 1024 * 5,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
    });

    const parsed = JSON.parse(stdout.trim()) as TranscriptionResponse;
    console.log("[api] transcript:", parsed);
    return NextResponse.json<TranscriptionResponse>(parsed, { status: parsed.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json<TranscriptionResponse>(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Transcription failed.",
      },
      { status: 500 }
    );
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => undefined);
    }
  }
}
