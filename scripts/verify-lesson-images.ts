/**
 * Validates that lesson chunk image paths under `public/` exist on disk.
 * Run: `npm run verify:lesson-images`
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { lessons } from "@/lib/lesson-data";

type ImageRef = {
  image: string;
  lessonId: string;
  lessonTitle: string;
  wordText: string;
};

function isNonEmptyImage(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function resolvePublicPath(imagePath: string): string {
  const trimmed = imagePath.trim();
  if (!trimmed.startsWith("/")) {
    return "";
  }
  return path.join(process.cwd(), "public", trimmed.replace(/^\//, ""));
}

function main(): number {
  const refs: ImageRef[] = [];

  for (const lesson of lessons) {
    for (const sentence of lesson.sentences) {
      for (const word of sentence.words) {
        if (!isNonEmptyImage(word.image)) {
          continue;
        }
        refs.push({
          image: word.image.trim(),
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          wordText: word.text,
        });
      }
    }
  }

  const totalReferenced = refs.length;
  const pathCounts = new Map<string, number>();
  for (const r of refs) {
    pathCounts.set(r.image, (pathCounts.get(r.image) ?? 0) + 1);
  }

  const uniquePaths = pathCounts.size;
  const duplicatePaths = [...pathCounts.entries()].filter(([, n]) => n > 1);

  const localRefs = refs.filter((r) => r.image.startsWith("/"));
  const otherRefs = refs.filter((r) => !r.image.startsWith("/"));

  const missing: ImageRef[] = [];
  for (const ref of localRefs) {
    const fsPath = resolvePublicPath(ref.image);
    if (!fsPath || !existsSync(fsPath)) {
      missing.push(ref);
    }
  }

  console.log("Lesson image path validation");
  console.log("-----------------------------");
  console.log(`Total referenced images (non-empty word.image): ${totalReferenced}`);
  console.log(`Total unique image paths: ${uniquePaths}`);
  console.log(`Duplicate paths (same path used more than once): ${duplicatePaths.length}`);
  if (duplicatePaths.length > 0) {
    duplicatePaths
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([p, n]) => {
        console.log(`  ${n}× ${p}`);
      });
  }

  if (otherRefs.length > 0) {
    console.log(
      `\nSkipped existence check (${otherRefs.length} ref(s) — not a root-relative /... path):`
    );
    const otherUnique = new Map<string, number>();
    for (const r of otherRefs) {
      otherUnique.set(r.image, (otherUnique.get(r.image) ?? 0) + 1);
    }
    [...otherUnique.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([p, n]) => console.log(`  ${n}× ${p}`));
  }

  console.log(`\nLocal paths checked (start with /): ${localRefs.length}`);

  if (missing.length > 0) {
    console.error(`\nMISSING FILES (${missing.length}):`);
    for (const m of missing) {
      console.error(`  path:   ${m.image}`);
      console.error(`  lesson: ${m.lessonId} — ${m.lessonTitle}`);
      console.error(`  word:   ${m.wordText}`);
      console.error("");
    }
    console.error("FAIL: one or more root-relative lesson images are missing under public/.");
    return 1;
  }

  console.log("\nOK: all root-relative lesson image files exist under public/.");
  return 0;
}

process.exit(main());
