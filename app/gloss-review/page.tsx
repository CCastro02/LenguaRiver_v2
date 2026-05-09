import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AppShell } from "@/app/AppShell";
import { GlossReviewClient } from "./GlossReviewClient";
import type { GlossLessonDraft } from "./types";

async function loadDrafts(): Promise<GlossLessonDraft[]> {
  const path = join(process.cwd(), "scripts", "gloss", "output", "gloss_lesson_drafts.json");
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as GlossLessonDraft[];
  } catch {
    return [];
  }
}

async function loadApprovedIds(): Promise<string[]> {
  const path = join(process.cwd(), "lib", "generated-lessons.ts");
  try {
    const raw = await readFile(path, "utf-8");
    const matches = [...raw.matchAll(/(?:id|"id")\s*:\s*"([^"]+)"/gu)];
    return matches.map((m) => m[1]);
  } catch {
    return [];
  }
}

export default async function GlossReviewPage() {
  const [drafts, approvedIds] = await Promise.all([loadDrafts(), loadApprovedIds()]);

  return (
    <AppShell>
      <div className="page">
        <h1>GLOSS Draft Review</h1>
        <p className="muted">Manual approval pipeline for review-only generated drafts.</p>
        <GlossReviewClient drafts={drafts} approvedIds={approvedIds} />
      </div>
    </AppShell>
  );
}
