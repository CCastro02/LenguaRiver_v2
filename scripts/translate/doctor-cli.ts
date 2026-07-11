/**
 * Run: `npm run translate:doctor`
 */
import { execFileSync } from "node:child_process";

import {
  findTranslateProjectRoot,
  pythonBinExists,
  resolveTranslatePythonBin,
  translateScriptPath,
} from "../../lib/translate-python";

const pythonBin = resolveTranslatePythonBin();
const projectRoot = findTranslateProjectRoot();
const doctorScript = translateScriptPath("doctor.py");

console.log(`Project root: ${projectRoot}`);
console.log(`Python executable: ${pythonBin}`);
console.log(`Python exists: ${pythonBinExists(pythonBin) ? "yes" : "no"}`);
console.log("");

try {
  execFileSync(pythonBin, [doctorScript], {
    stdio: "inherit",
    windowsHide: true,
    cwd: projectRoot,
  });
} catch (error) {
  const code = typeof error === "object" && error !== null && "status" in error ? error.status : 1;
  process.exit(typeof code === "number" ? code : 1);
}
