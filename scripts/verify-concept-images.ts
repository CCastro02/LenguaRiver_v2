/**
 * Validates that concept icon paths under `public/` exist on disk.
 * Run: `npm run verify:concept-images`
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { listConceptImageUrls } from "@/lib/wild-word-concept-images";

function resolvePublicPath(imagePath: string): string {
  const trimmed = imagePath.trim();
  if (!trimmed.startsWith("/")) {
    return "";
  }
  return path.join(process.cwd(), "public", trimmed.replace(/^\//, ""));
}

function main(): number {
  const urls = listConceptImageUrls();
  const missing: string[] = [];

  console.log("Concept image path validation");
  console.log("-----------------------------");
  console.log(`Mapped concept assets: ${urls.length}`);

  for (const imageUrl of urls) {
    const fsPath = resolvePublicPath(imageUrl);
    if (!fsPath || !existsSync(fsPath)) {
      missing.push(imageUrl);
    }
  }

  if (missing.length > 0) {
    console.error(`\nMISSING FILES (${missing.length}):`);
    for (const p of missing) {
      console.error(`  ${p}`);
    }
    console.error("\nFAIL: run python scripts/generate-concept-icons.py");
    return 1;
  }

  console.log("\nOK: all concept image files exist under public/.");
  return 0;
}

process.exit(main());
