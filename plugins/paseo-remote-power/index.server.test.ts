import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { z } from "zod";
import type { AgentCreateInjectionRequest, McpInjectionHookHandler } from "paseo-plugin-helper/server";
import { PluginStorage } from "paseo-plugin-helper/server";
import { INJECTION_FALLBACK_KEY, INJECTION_KEY_PREFIX } from "./server/injection.ts";

/**
 * The `agent.create` injection and the RPC registrations are wired into the
 * plugin entrypoint — the one file no other test in this package imports
 * (#689 pattern from plugins/x-comms). Deleting either call leaves every unit
 * test green while newborn agents stop receiving the power tools, silently.
 * So this suite loads the REAL entrypoint through the same build the daemon
 * performs (esbuild, host-externalized SDK specifiers) and asserts on what it
 * registers — never on a stub of it.
 *
 * Everything runs inside a fixture HOME: every state path in the plugin is
 * derived from the home directory at call time, so redirecting HOME before
 * loading keeps the developer's real ~/.paseo untouched.
 */

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT = join(PACKAGE_ROOT, "index.server.ts");

/** A daemon id in the sandboxed home, so the injected key has the namespaced production shape. */
const SERVER_ID = "srv_remotepower_entry";
const STABLE_SERVER_SOURCE = join(PACKAGE_ROOT, "mcp", "paseo-remote-power.mjs");

let scratch: string;
let previousHome: string | undefined;
let contribute: (server: unknown) => () => void;

before(async () => {
  scratch = mkdtempSync(join(tmpdir(), "remote-power-entry-"));
  const home = join(scratch, "home");
  mkdirSync(join(home, ".paseo"), { recursive: true });
  writeFileSync(join(home, ".paseo", "server-id"), `${SERVER_ID}\n`);

  // Redirected before the backend is loaded: every module-level path in the
  // plugin derives from the home directory, so loading it unsandboxed would
  // touch the developer's real state dir.
  previousHome = process.env.HOME;
  process.env.HOME = home;
  // Pin the embedded server through the documented override, so the locator
  // never depends on the test runner's working directory.
  process.env.PASEO_REMOTE_POWER_MCP_SERVER = STABLE_SERVER_SOURCE;

  const outfile = join(scratch, "index.server.cjs");
  await build({
    entryPoints: [ENTRYPOINT],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    // The SDK specifiers the daemon externalises, verbatim. Everything else —
    // the helper through tsconfig paths, zod, the plugin's own modules — is
    // inlined, because this bundle is required from a temp directory.
    external: [
      "@getpaseo/plugin",
      "@getpaseo/plugin/server",
      "@getpaseo/plugin/server/provider",
      "@getpaseo/plugin/server/acp",
      "@getpaseo/plugin/client",
      "@getpaseo/plugin/client/ui",
      "@getpaseo/plugin/client/react-native",
    ],
    treeShaking: true,
    logLevel: "silent",
    absWorkingDir: PACKAGE_ROOT,
    outfile,
  });
  const require = createRequire(outfile);
  contribute = (require(outfile) as { default: (server: unknown) => () => void }).default;
});

after(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  delete process.env.PASEO_REMOTE_POWER_MCP_SERVER;
  rmSync(scratch, { recursive: true, force: true });
});

/** The shipped state is no settings file at all: injection defaults to on. */
function setInjectionToggle(enabled: boolean): void {
  if (enabled) {
    rmSync(join(scratch, "home", ".paseo", "plugin-data", "xpufx", "paseo-remote-power", "settings.json"), { force: true });
    return;
  }
  new PluginStorage<{ agentInjectionEnabled?: boolean }>("paseo-remote-power", "settings.json", {
    defaultData: {},
  }).write({ agentInjectionEnabled: false });
}

interface Recorded {
  contracts: string[];
  events: string[];
  hooks: { name: string; handler: McpInjectionHookHandler }[];
}

/** Records what the entrypoint asks of the server context, the way
 * plugins/x-comms/index.server.test.ts and plugins/forges do. */
function createStubServer(): { server: unknown; recorded: Recorded } {
  const recorded: Recorded = { contracts: [], events: [], hooks: [] };
  const server = {
    handle(contract: { name: string }): void {
      recorded.contracts.push(contract.name);
    },
    on(event: string): () => void {
      recorded.events.push(event);
      return () => {};
    },
    before(name: string, handler: McpInjectionHookHandler): () => void {
      recorded.hooks.push({ name, handler });
      return () => {
        const index = recorded.hooks.findIndex((entry) => entry.handler === handler);
        if (index !== -1) recorded.hooks.splice(index, 1);
      };
    },
  };
  return { server, recorded };
}

function startPlugin(): { recorded: Recorded; stop: () => void } {
  const { server, recorded } = createStubServer();
  const dispose = contribute(server);
  return {
    recorded,
    stop: () => dispose?.(),
  };
}

function runAgentCreate(hooks: McpInjectionHookHandler[], request: AgentCreateInjectionRequest): AgentCreateInjectionRequest {
  let current = request;
  for (const handler of hooks) {
    const next = handler({ request: current });
    if (next instanceof Promise) throw new Error("the injection hooks must register synchronously");
    if (next) current = next;
  }
  return current;
}

describe("plugin entrypoint: registrations are live in production (#689)", () => {
  it("registers the roster RPCs and the settings contract", () => {
    setInjectionToggle(true);
    const plugin = startPlugin();
    try {
      for (const expected of [
        "hosts.list",
        "hosts.add",
        "hosts.update",
        "hosts.remove",
        "host.status",
        "host.wake",
        "job.status",
        "jobs.list",
        "paseo-remote-power.settings.get",
        "paseo-remote-power.settings.update",
        "paseo-remote-power.settings.reset",
      ]) {
        assert.ok(plugin.recorded.contracts.includes(expected), `expected contract ${expected}`);
      }
    } finally {
      plugin.stop();
    }
  });

  it("installs the embedded server at the stable state-dir path, byte-identical to the source", () => {
    setInjectionToggle(true);
    const plugin = startPlugin();
    try {
      const stable = join(
        scratch,
        "home",
        ".paseo",
        "plugin-data",
        "xpufx",
        "paseo-remote-power",
        "bin",
        "paseo-remote-power.mjs",
      );
      const stableContent = readFileSync(stable);
      assert.ok(stableContent.equals(readFileSync(STABLE_SERVER_SOURCE)), "the stable copy must track the embedded server");
    } finally {
      plugin.stop();
    }
  });

  it("injects the power tools into every newborn agent under the namespaced key", () => {
    setInjectionToggle(true);
    const plugin = startPlugin();
    try {
      const hooks = plugin.recorded.hooks.filter((entry) => entry.name === "agent.create").map((entry) => entry.handler);
      assert.equal(hooks.length, 1, "exactly one agent.create hook");

      const request: AgentCreateInjectionRequest = { config: { provider: "opencode", cwd: "/work" } };
      const injected = runAgentCreate(hooks, request);
      const serverName = `${INJECTION_KEY_PREFIX}${SERVER_ID}`;
      const InjectedServersSchema = z.record(
        z.string(),
        z.object({ type: z.string(), command: z.string(), args: z.array(z.string()).optional() }),
      );
      const mcpServers = InjectedServersSchema.parse(injected.config.mcpServers);
      const entry = mcpServers[serverName];
      assert.ok(entry, `expected an mcp server under '${serverName}'`);
      assert.equal(entry.type, "stdio");
      assert.equal(entry.args?.length, 1);
      assert.match(entry.args[0], /bin\/paseo-remote-power\.mjs$/);
      assert.ok(entry.command.length > 0, "a runtime command is set");
    } finally {
      plugin.stop();
    }
  });

  it("does not inject when the settings toggle is off", () => {
    setInjectionToggle(false);
    const plugin = startPlugin();
    try {
      assert.equal(plugin.recorded.hooks.length, 0, "the agent.create hook is skipped entirely");
    } finally {
      plugin.stop();
      setInjectionToggle(true);
    }
  });

  it("teardown removes the injection hook", () => {
    setInjectionToggle(true);
    const plugin = startPlugin();
    const hooksBefore = plugin.recorded.hooks.length;
    assert.ok(hooksBefore > 0);
    plugin.stop();
    assert.equal(plugin.recorded.hooks.length, 0, "stop() unregisters the hook");
  });

  it("the fallback injection key stays a bare name when the server id is unreadable", () => {
    assert.equal(INJECTION_FALLBACK_KEY, "paseo-remote-power");
    assert.ok(INJECTION_KEY_PREFIX.startsWith("paseo-remote-power"));
    // A dotted key would break Gemini's ACP name validation; _ and - are safe.
    assert.doesNotMatch(INJECTION_KEY_PREFIX, /\./);
  });
});
