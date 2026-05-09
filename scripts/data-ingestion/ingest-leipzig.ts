import { importLeipzigVocabulary } from "./leipzig-importer";
import type { SupportedLanguage } from "./types";

type Parsed = {
  lang?: SupportedLanguage;
  limit?: number;
  topic?: string;
  local?: string;
};

function parseArgs(argv: string[]): Parsed {
  const out: Parsed = {};
  const hasLongFlags = argv.some((a) => a.startsWith("--") || a === "-l" || a === "-t" || a === "-f");

  let i = 0;
  /** Some Windows `npm run` invocations drop `--flag` tokens; accept `es 50 casa` as shorthand. */
  if (!hasLongFlags && (argv[0] === "es" || argv[0] === "ru")) {
    out.lang = argv[0] as SupportedLanguage;
    i = 1;
    if (argv[1] && /^\d+$/.test(argv[1])) {
      out.limit = Number(argv[1]);
      i = 2;
      if (argv[2] && !argv[2].startsWith("-")) {
        out.topic = argv[2];
        i = 3;
      }
    }
  }

  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lang" || a === "-l") {
      out.lang = argv[++i] as SupportedLanguage;
    } else if (a === "--limit") {
      out.limit = Number(argv[++i]);
    } else if (a === "--topic" || a === "-t") {
      out.topic = argv[++i];
    } else if (a === "--local" || a === "-f") {
      out.local = argv[++i];
    }
  }
  return out;
}

function printUsage(): void {
  console.error(`Usage:
  npm run ingest:leipzig -- --lang es|ru --limit <n> [--topic <term>]

  On Windows, if flags are stripped by the shell, use positional form after -- :
  npm run ingest:leipzig -- es 50 casa

  Remote batch (default):
    --lang, -l     Language code (es or ru)
    --limit        Max vocabulary rows (capped by source config)
    --topic, -t    Optional search / topic query (remote q=)

  Local file instead:
    --local, -f    Path to TSV/CSV frequency file
    (still requires --lang; --limit ignored for local full file parse)`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.lang !== "es" && args.lang !== "ru") {
    printUsage();
    process.exit(1);
  }

  if (args.local) {
    const result = await importLeipzigVocabulary({
      mode: "local",
      filePath: args.local,
      options: {
        language: args.lang,
        source: "leipzig",
      },
    });
    console.log(
      JSON.stringify(
        {
          mode: "local",
          count: result.normalized.length,
          fromCache: result.fromCache,
          warnings: result.warnings,
          sample: result.normalized.slice(0, 5),
        },
        null,
        2
      )
    );
    return;
  }

  const limit = Number.isFinite(args.limit) && (args.limit as number) > 0 ? (args.limit as number) : 50;

  const result = await importLeipzigVocabulary({
    mode: "remote",
    options: {
      language: args.lang,
      maxEntries: limit,
      topic: args.topic,
      source: "leipzig",
    },
  });

  console.log(
    JSON.stringify(
      {
        mode: "remote",
        count: result.normalized.length,
        fromCache: result.fromCache,
        warnings: result.warnings,
        sample: result.normalized.slice(0, 5),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
