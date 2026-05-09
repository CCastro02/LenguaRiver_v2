import { loadValidationInput, printValidationSummary, runValidation } from "./validation-shared";

function main(): number {
  try {
    const { newLessons, existing } = loadValidationInput(process.argv.slice(2));
    const result = runValidation(newLessons, existing);
    printValidationSummary(result, "overlap checker");

    if (result.errors.length > 0) {
      console.error("\nFAIL: overlap checker found blocking errors.");
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: "FAIL",
          error: error instanceof Error ? error.message : "Unknown overlap checker error",
        },
        null,
        2
      )
    );
    return 1;
  }
}

process.exit(main());
