#!/usr/bin/env node
// Hermetic stand-in for the paseo CLI. Only used by tests via PASEO_X_COMMS_PASEO.
// Never called by the real tool outside of tests.
//
// Flags are validated against per-subcommand allowlists mirroring the real
// commander-based paseo CLI (#351): an unknown flag must fail the same way —
// `error: unknown option '<flag>'` on stderr, exit 1 — so the tests cannot pass
// against invocations the real binary rejects. Notably `send` does NOT accept
// `--message-id` (#350, #351).
//
// Test controls via env:
//   FAKE_PASEO_DELAY_MS  respond after a delay (tests cancellation / exit discipline)
//   FAKE_PASEO_FAIL      exit 1 with this message on stderr (tests error paths)
//   FAKE_PASEO_STATUS    agent lifecycle reported by inspect/ls (default "idle").
//                        Set to "running" to make the busy gate hold a send.
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const delay = Number(process.env.FAKE_PASEO_DELAY_MS || 0);
const fail = process.env.FAKE_PASEO_FAIL;

const GLOBAL_FLAGS = new Set([
  "--host", "--home", "--json", "--format", "-o", "--quiet", "-q", "--no-headers", "--no-color", "-v", "--version", "-h", "--help",
]);

// Mirrors the real option sets from `paseo <cmd> --help` on this machine.
// Per-command, not one shared pool: `permit ls` really has no --format/-q, and
// --message-id is deliberately absent from send — the real CLI has no such
// option and exits 1 on it (#351/#350).
const FLAG_ALLOWLISTS = {
  daemon: new Set(["--json", "--host", "--home", "-h", "--help"]),
  inspect: GLOBAL_FLAGS,
  ls: new Set([...GLOBAL_FLAGS, "-a", "--all", "-g", "--global", "--label", "--thinking"]),
  send: new Set([...GLOBAL_FLAGS, "--prompt", "--prompt-file", "--image", "--no-wait"]),
  run: new Set([
    ...GLOBAL_FLAGS, "-d", "--background", "--title", "--provider", "--model", "--thinking",
    "--mode", "--new-workspace", "--worktree-slug", "--worktree-mode", "--new-branch", "--base",
    "--branch", "--pr-number", "--forge", "--workspace", "--image", "--cwd", "--env", "--label",
    "--wait-timeout", "--output-schema",
  ]),
  logs: new Set([...GLOBAL_FLAGS, "-f", "--follow", "--tail", "--filter", "--since"]),
  wait: new Set([...GLOBAL_FLAGS, "--timeout"]),
  "permit ls": new Set(["--json", "--host", "--home", "-h", "--help"]),
  "permit allow": new Set(["--all", "--input", "--json", "--host", "--home", "-h", "--help"]),
  "permit deny": new Set(["--all", "--message", "--interrupt", "--json", "--host", "--home", "-h", "--help"]),
};

function argAfter(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}

// commander errors on unknown options before doing anything; mirror that shape
// exactly: `error: unknown option '--<flag>'`, stdout untouched, exit 1.
function rejectUnknownFlags(sub, rest) {
  const allowlist = FLAG_ALLOWLISTS[sub];
  if (!allowlist) return;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("-") || arg === "-") continue;
    // commander distinguishes negation (--no-wait) from unknown (--not-a-flag);
    // both forms land in the allowlists, so plain membership is enough.
    if (!allowlist.has(arg)) {
      console.error(`error: unknown option '${arg}'`);
      process.exit(1);
    }
    // Consume an option's value so it cannot be mistaken for another flag —
    // except boolean switches, which take no argument.
    if (!allowlist.has(arg) || BOOLEAN_FLAGS.has(arg)) continue;
    const takesValue = !arg.startsWith("--no") || !allowlist.has(arg.replace(/^--no/, "--"));
    if (takesValue && rest[i + 1]?.startsWith("-") === false) {
      i++;
    }
  }
}

// Switches that take no value; everything else in the allowlists does.
const BOOLEAN_FLAGS = new Set([
  "--json", "--quiet", "-q", "--no-headers", "--no-color", "-v", "--version", "-h", "--help",
  "-a", "--all", "-g", "--global", "--no-wait", "-f", "--follow", "--interrupt",
]);

const sub = args[0];
const rest = args.slice(1);
const subKey = sub === "permit" ? `permit ${rest[0]}` : sub;
rejectUnknownFlags(subKey, sub === "permit" ? rest.slice(1) : rest);

const host = argAfter("--host");
const prompt = args[args.length - 1];
// `paseo inspect --json` answers `Status`, `paseo ls --json` answers `status`;
// both are covered so the gate's casing handling is exercised on the real path.
const status = process.env.FAKE_PASEO_STATUS || "idle";

function respond(data) {
  if (delay > 0) {
    // Keep the event loop alive across the delay; SIGTERM still kills us (no
    // signal listener installed), which is what the cancellation test relies on.
    sleep(delay).then(() => write(data));
  } else {
    write(data);
  }
}
function write(data) {
  process.stdout.write(JSON.stringify(data) + "\n");
}

if (fail) {
  console.error(fail);
  process.exit(1);
}

switch (sub) {
  case "daemon": {
    // The real command is `paseo daemon status --json`; tolerate flag order.
    const token = rest.find((a) => !a.startsWith("-"));
    if (token === undefined || token === "status") {
      respond({ serverId: "srv_fake", hostname: "fakehost" });
    } else {
      console.error(`fake-paseo: unhandled daemon subcommand: ${token}`);
      process.exit(1);
    }
    break;
  }
  case "inspect":
    respond({ Id: rest[0], Name: "fake-agent", Status: status, sawHost: host });
    break;
  case "ls":
    respond([{ id: "agent-1", shortId: "agent-1", name: "fake-agent", status, sawHost: host }]);
    break;
  case "run":
    respond({
      agentId: "spawned-agent-1",
      status: "running",
      provider: argAfter("--provider"),
      cwd: argAfter("--cwd"),
      title: argAfter("--title"),
      sawHost: host,
      sawBackground: args.includes("--background"),
      sawThinking: argAfter("--thinking"),
      promptHead: prompt,
      labels: args.flatMap((a, i) => (a === "--label" ? [args[i + 1]] : [])),
    });
    break;
  case "send":
    respond({ ok: true, to: rest[0], sawHost: host, sawNoWait: args.includes("--no-wait"), promptHead: prompt });
    break;
  case "logs":
    respond({ events: [], sawHost: host });
    break;
  case "wait":
    respond({
      agentId: rest[0],
      status: process.env.FAKE_PASEO_WAIT_STATUS || "idle",
      message: process.env.FAKE_PASEO_WAIT_STATUS === "permission"
        ? "Agent is waiting for permission: external_directory"
        : "Agent is idle.",
      sawHost: host,
      sawTimeout: argAfter("--timeout"),
    });
    break;
  case "permit": {
    const sub = rest[0];
    if (sub === "ls") {
      respond(process.env.FAKE_PASEO_PERMISSIONS ? JSON.parse(process.env.FAKE_PASEO_PERMISSIONS) : []);
    } else if (sub === "allow" || sub === "deny") {
      // positional agent is rest[1]; positional reqId is rest[2] (if no options before it)
      const positionals = rest.slice(1).filter((a) => !a.startsWith("-"));
      const item = {
        requestId: positionals[1] ?? "all",
        agentId: positionals[0],
        result: sub === "allow" ? "allowed" : "denied",
        sawHost: host,
        sawAll: args.includes("--all"),
      };
      respond(sub === "allow" ? [item] : { data: [item] });
    } else {
      console.error(`fake-paseo: unhandled permit subcommand: ${sub}`);
      process.exit(1);
    }
    break;
  }
  default:
    console.error(`fake-paseo: unhandled args: ${args.join(" ")}`);
    process.exit(1);
}
