/**
 * Validates continuation metadata for all lessons in lib/lesson-data.
 * Exit 1 if hard errors; warnings alone exit 0.
 */
import { lessons } from "../../lib/lesson-data";
import { validateLessonContinuationDataset } from "../../lib/lesson-continuation-validation";

function main(): number {
  const { errors, warnings } = validateLessonContinuationDataset(lessons);
  for (const w of warnings) {
    console.warn(`[continuation] ${w.lessonId} ${w.code}: ${w.message}`);
  }
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[continuation] ${e.lessonId} ${e.code}: ${e.message}`);
    }
    console.error(`\nFAIL: ${errors.length} continuation validation error(s).`);
    return 1;
  }
  if (warnings.length === 0) {
    console.log("PASS: no continuation validation warnings.");
  } else {
    console.log(`PASS with ${warnings.length} warning(s).`);
  }
  return 0;
}

process.exit(main());
