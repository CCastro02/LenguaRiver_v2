import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

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

const STATUS_CHECK_SCRIPT = [
  "import json",
  "ready = False",
  "try:",
  "    import argostranslate.translate",
  "    langs = argostranslate.translate.get_installed_languages()",
  "    source = next((lang for lang in langs if lang.code == 'es'), None)",
  "    target = next((lang for lang in langs if lang.code == 'en'), None)",
  "    ready = bool(source and target and source.get_translation(target))",
  "except Exception:",
  "    ready = False",
  "print(json.dumps({'ready': ready}))",
].join("\n");

export async function GET() {
  const pythonBins = resolvePythonBins();
  for (const pythonBin of pythonBins) {
    try {
      const { stdout } = await execFileAsync(pythonBin, ["-c", STATUS_CHECK_SCRIPT], {
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      const parsed = JSON.parse(stdout.trim()) as { ready?: unknown };
      return NextResponse.json({ ready: Boolean(parsed.ready) });
    } catch {
      // Try the next python binary.
    }
  }
  return NextResponse.json({ ready: false });
}
