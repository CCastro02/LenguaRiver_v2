import { existsSync } from "node:fs";
import path from "node:path";

const TRANSLATE_MARKER = path.join("scripts", "translate", "argos_support.py");

let cachedProjectRoot: string | null = null;

/** Directory containing `scripts/translate/` (works when cwd is repo root or `LenguaRiver/`). */
export function findTranslateProjectRoot(): string {
  if (cachedProjectRoot) {
    return cachedProjectRoot;
  }

  const starts = new Set<string>([process.cwd(), path.join(process.cwd(), "LenguaRiver")]);
  for (const start of starts) {
    let dir = path.resolve(start);
    while (true) {
      if (existsSync(path.join(dir, TRANSLATE_MARKER))) {
        cachedProjectRoot = dir;
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }

  cachedProjectRoot = process.cwd();
  return cachedProjectRoot;
}

export function resolveProjectVenvPythonBin(projectRoot = findTranslateProjectRoot()): string | null {
  if (process.platform === "win32") {
    const windowsPython = path.join(projectRoot, ".venv", "Scripts", "python.exe");
    if (existsSync(windowsPython)) {
      return windowsPython;
    }
    return null;
  }

  for (const name of ["python3", "python"]) {
    const unixPython = path.join(projectRoot, ".venv", "bin", name);
    if (existsSync(unixPython)) {
      return unixPython;
    }
  }
  return null;
}

function resolveEnvPythonBin(
  projectRoot: string,
  envVar: string | undefined
): { path: string; exists: boolean } | null {
  if (!envVar?.trim()) {
    return null;
  }
  const trimmed = envVar.trim();
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(projectRoot, trimmed);
  return { path: resolved, exists: existsSync(resolved) };
}

/**
 * Python executables for Argos, project `.venv` first (absolute path).
 * Avoids Cursor/workspace-root cwd mismatches with relative `.env.local` paths.
 */
export function resolveTranslatePythonBins(): string[] {
  const projectRoot = findTranslateProjectRoot();
  const bins: string[] = [];

  const venvPython = resolveProjectVenvPythonBin(projectRoot);
  if (venvPython) {
    bins.push(venvPython);
  }

  for (const envVar of [process.env.TRANSLATE_PYTHON_BIN, process.env.WHISPER_PYTHON_BIN]) {
    const fromEnv = resolveEnvPythonBin(projectRoot, envVar);
    if (fromEnv?.exists) {
      bins.push(fromEnv.path);
    }
  }

  bins.push("python3", "python");
  return bins.filter((bin, index, all) => all.indexOf(bin) === index);
}

export function resolveTranslatePythonBin(): string {
  return resolveTranslatePythonBins()[0] ?? "python";
}

export function translateScriptPath(scriptName: string): string {
  return path.join(findTranslateProjectRoot(), "scripts", "translate", scriptName);
}

export function pythonBinExists(pythonBin: string): boolean {
  if (pythonBin === "python" || pythonBin === "python3") {
    return true;
  }
  return existsSync(pythonBin);
}
