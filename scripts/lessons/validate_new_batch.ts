import { loadValidationInput, printValidationSummary, runValidation } from "./validation-shared";

function main(): number {
  try {
    const { newLessons, existing } = loadValidationInput(process.argv.slice(2));
    const result = runValidation(newLessons, existing);
    printValidationSummary(result, "pre-merge batch validation");

    if (result.errors.length > 0) {
      console.error("\nFAIL: blocking merge due to hard validation errors.");
      return 1;
    }

    if (result.warnings.length > 0) {
      console.warn("\nPASS with warnings: manual review required before merge.");
    } else {
      console.log("\nPASS: no validation warnings.");
    }
    return 0;
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: "FAIL",
          error: error instanceof Error ? error.message : "Unknown validation error",
        },
        null,
        2
      )
    );
    return 1;
  }
}

process.exit(main());
