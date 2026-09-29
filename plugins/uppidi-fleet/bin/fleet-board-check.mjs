#!/usr/bin/env node
import { register } from "node:module";
import { parseArgs } from "node:util";

// Install TS-extension resolver hook so node can load .ts server modules directly
const hookUrl = new URL("../test/resolve-ts-hooks.mjs", import.meta.url);
register(hookUrl, import.meta.url);

const {
  runIssuesCheck,
  renderIssuesCheckJson,
  renderIssuesCheckMarkdown,
  ISSUES_CHECK_DEFAULT_HOSTNAME,
  ISSUES_CHECK_DEFAULT_REPO,
  ISSUES_CHECK_DEFAULT_STALE_WIP_HOURS,
} = await import("../server/issues-check.ts");

function printHelp() {
  console.log(`Usage: fleet-board-check [options]

Deterministic Forgejo board triage and candidate ranking runner.

Options:
  --repo <repo>              Target repository (default: ${ISSUES_CHECK_DEFAULT_REPO})
  --hostname <hostname>      Forgejo host (default: ${ISSUES_CHECK_DEFAULT_HOSTNAME})
  --role <role>              Triage perspective: orchestrator | operator | coding_worker (default: orchestrator)
  --force                    Force re-check even if cache signature matches
  --all                      Include non-triaged issues
  --stale-wip-hours <hours>  Hours before in-progress issues become stale (default: ${ISSUES_CHECK_DEFAULT_STALE_WIP_HOURS})
  --dry-run                  Compute rankings without applying board mutations
  --json                     Output JSON instead of markdown
  -h, --help                 Display this help message
`);
}

async function main() {
  let values;
  try {
    const parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        repo: { type: "string" },
        hostname: { type: "string", default: ISSUES_CHECK_DEFAULT_HOSTNAME },
        role: { type: "string", default: "orchestrator" },
        force: { type: "boolean", default: false },
        all: { type: "boolean", default: false },
        "stale-wip-hours": { type: "string", default: String(ISSUES_CHECK_DEFAULT_STALE_WIP_HOURS) },
        "dry-run": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
    });
    values = parsed.values;
  } catch (err) {
    console.error(`Error parsing arguments: ${err.message}`);
    printHelp();
    process.exit(2);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const validRoles = ["orchestrator", "operator", "coding_worker"];
  if (!validRoles.includes(values.role)) {
    console.error(`Error: invalid role "${values.role}". Expected one of: ${validRoles.join(", ")}`);
    process.exit(2);
  }

  const staleWipHours = parseFloat(values["stale-wip-hours"]);
  if (Number.isNaN(staleWipHours) || staleWipHours < 0) {
    console.error(`Error: --stale-wip-hours must be a non-negative number`);
    process.exit(2);
  }

  const repo = values.repo ?? ISSUES_CHECK_DEFAULT_REPO;
  const hostname = values.hostname ?? ISSUES_CHECK_DEFAULT_HOSTNAME;
  const dryRun = values["dry-run"] ?? false;

  try {
    const outcome = await runIssuesCheck({
      hostname,
      repo,
      role: values.role,
      force: values.force,
      all: values.all,
      staleWipHours,
      dryRun,
    });

    if (values.json) {
      process.stdout.write(renderIssuesCheckJson(outcome) + "\n");
    } else {
      process.stdout.write(
        renderIssuesCheckMarkdown(outcome, {
          hostname,
          repo,
          role: values.role,
          staleWipHours,
          dryRun,
        }),
      );
    }

    process.exit(outcome.exitCode);
  } catch (err) {
    console.error(`fleet-board-check failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

await main();
