/**
 * Validates lesson storyboard scene image paths under `public/`.
 * Run: `npm run verify:lesson-storyboards`
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { COFFEE_SHOP_DIALOGUE } from "@/lib/coffee-shop-story-dialogue";
import { panelSlotsForLayout } from "@/lib/comic-panel-layout";
import { LESSON_STORYBOARDS } from "@/lib/lesson-storyboards";

function resolvePublicPath(imagePath: string): string {
  const trimmed = imagePath.trim();
  if (!trimmed.startsWith("/")) {
    return "";
  }
  return path.join(process.cwd(), "public", trimmed.replace(/^\//, ""));
}

function validateCoffeeDialogueJson(): string[] {
  const errors: string[] = [];
  const jsonPath = path.join(process.cwd(), "lib", "coffee-shop-story-dialogue.json");
  if (!existsSync(jsonPath)) {
    errors.push("Missing lib/coffee-shop-story-dialogue.json");
    return errors;
  }

  for (const [tier, scenes] of Object.entries(COFFEE_SHOP_DIALOGUE)) {
    for (const [filename, spec] of Object.entries(scenes)) {
      if (!spec.panels?.length) {
        errors.push(`${tier}/${filename}: no dialogue panels defined`);
        continue;
      }
      if (spec.panels.length > 4) {
        errors.push(`${tier}/${filename}: too many dialogue panels (${spec.panels.length})`);
      }
      for (const panel of spec.panels) {
        if (!panel.text?.trim()) {
          errors.push(`${tier}/${filename}: empty panel text`);
        }
        if (!["learner", "stranger", "narration"].includes(panel.speaker)) {
          errors.push(`${tier}/${filename}: invalid speaker ${panel.speaker}`);
        }
      }
      if (spec.visualBeats.length < spec.panels.length) {
        errors.push(`${tier}/${filename}: more dialogue panels than visual beats`);
      }
      const validSlots = new Set(panelSlotsForLayout(spec.layout));
      for (const panel of spec.panels) {
        if (!panel.panelSlot) {
          errors.push(`${tier}/${filename}: panel missing panelSlot`);
        } else if (!validSlots.has(panel.panelSlot)) {
          errors.push(`${tier}/${filename}: invalid panelSlot ${panel.panelSlot}`);
        }
        if (!panel.placement) {
          errors.push(`${tier}/${filename}: panel missing placement`);
        }
      }
    }
  }

  return errors;
}

function main(): number {
  let totalScenes = 0;
  let withImage = 0;
  let withoutImage = 0;
  const missing: { lessonId: string; sceneId: string; imageUrl: string }[] = [];
  const panelErrors: string[] = [];

  for (const board of LESSON_STORYBOARDS) {
    for (const scene of board.scenes) {
      totalScenes += 1;
      const url = scene.imageUrl?.trim();
      if (!url) {
        withoutImage += 1;
        continue;
      }
      withImage += 1;
      if (!url.startsWith("/")) {
        continue;
      }
      const fsPath = resolvePublicPath(url);
      if (!fsPath || !existsSync(fsPath)) {
        missing.push({ lessonId: board.lessonId, sceneId: scene.id, imageUrl: url });
      }

      if (!scene.panels?.length) {
        panelErrors.push(`${board.lessonId}/${scene.id}: missing panels on storyboard scene`);
      } else if (!scene.sentenceKeys?.length) {
        panelErrors.push(`${board.lessonId}/${scene.id}: missing sentenceKeys derived from panels`);
      }
      if (scene.imageUrl?.includes("/coffee-shop/") && !scene.comicLayout) {
        panelErrors.push(`${board.lessonId}/${scene.id}: missing comicLayout on coffee scene`);
      }
      if (scene.comicLayout) {
        const validSlots = new Set(panelSlotsForLayout(scene.comicLayout));
        for (const panel of scene.panels ?? []) {
          if (panel.panelSlot && !validSlots.has(panel.panelSlot)) {
            panelErrors.push(
              `${board.lessonId}/${scene.id}: invalid panelSlot ${panel.panelSlot}`
            );
          }
        }
      }
    }
  }

  const dialogueErrors = validateCoffeeDialogueJson();
  const allErrors = [...dialogueErrors, ...panelErrors];

  console.log("Lesson storyboard image validation");
  console.log("----------------------------------");
  console.log(`Storyboards: ${LESSON_STORYBOARDS.length}`);
  console.log(`Total scenes: ${totalScenes}`);
  console.log(`Scenes with imageUrl: ${withImage}`);
  console.log(`Scenes without imageUrl (placeholder mode): ${withoutImage}`);

  if (allErrors.length > 0) {
    console.error(`\nMETADATA ERRORS (${allErrors.length}):`);
    for (const err of allErrors) {
      console.error(`  ${err}`);
    }
  }

  if (missing.length > 0) {
    console.error(`\nMISSING FILES (${missing.length}):`);
    for (const m of missing) {
      console.error(`  lesson: ${m.lessonId}`);
      console.error(`  scene:  ${m.sceneId}`);
      console.error(`  path:   ${m.imageUrl}`);
      console.error("");
    }
    console.error("FAIL: one or more storyboard scene images are missing under public/.");
    return 1;
  }

  if (allErrors.length > 0) {
    console.error("FAIL: storyboard scene metadata validation failed.");
    return 1;
  }

  console.log("\nOK: all root-relative storyboard scene images exist under public/.");
  console.log("OK: coffee-shop dialogue metadata and scene panels are valid.");
  return 0;
}

process.exit(main());
