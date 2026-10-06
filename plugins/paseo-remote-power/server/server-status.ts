import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Locator for the embedded MCP server (mcp/paseo-remote-power.mjs), mirroring
 * plugins/x-comms: a plugin server is bundled and inlined before it runs, so
 * neither import.meta.url nor process.cwd() identifies the checkout. The
 * dependable candidates are the install path the daemon records in
 * ~/.paseo/config.json and the managed-checkout layout, with an env override
 * on top.
 *
 * The server is deliberately dependency-free (node builtins only), so unlike
 * x-comms there is no separate bundle artifact — the plain .mjs IS the
 * self-contained artifact the injector copies to the stable state-dir path.
 */

const SERVER_FILENAME = "paseo-remote-power.mjs";

function inMcpDir(base: string): string[] {
  return [join(base, "mcp", SERVER_FILENAME)];
}

/** Explicit override for unusual host layouts (packaged app, moved checkout). */
function overrideCandidates(): string[] {
  const raw = process.env.PASEO_REMOTE_POWER_MCP_SERVER?.trim();
  return raw ? [isAbsolute(raw) ? raw : join(process.cwd(), raw)] : [];
}

/** Plugin ids this plugin may be installed under. */
const SELF_PLUGIN_IDS = ["paseo-remote-power"];

const PaseoConfigSchema = z.object({
  plugins: z.record(z.string(), z.object({ path: z.string().optional() }).optional()).optional(),
});

/**
 * Directories the daemon records for installed plugins, with this plugin's own
 * entries first so a sibling install can never shadow it.
 */
function configCandidates(selfDir?: string): string[] {
  const configPath = join(homedir(), ".paseo", "config.json");
  let parsed: z.infer<typeof PaseoConfigSchema>;
  try {
    parsed = PaseoConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
  } catch {
    return [];
  }
  if (!parsed.plugins) return [];

  const preferred: string[] = [];
  const rest: string[] = [];
  for (const [id, entry] of Object.entries(parsed.plugins)) {
    const dir = entry?.path;
    if (typeof dir !== "string" || !dir.trim()) continue;
    const isSelf = SELF_PLUGIN_IDS.includes(id) || (selfDir !== undefined && dir === selfDir);
    (isSelf ? preferred : rest).push(dir);
  }
  return [...preferred, ...rest].flatMap(inMcpDir);
}

/** Managed-install layout: ~/.paseo/plugins/<pluginId>/<commit>/checkout/mcp/… */
function managedCandidates(): string[] {
  const out: string[] = [];
  for (const pluginId of SELF_PLUGIN_IDS) {
    const base = join(homedir(), ".paseo", "plugins", pluginId);
    if (!existsSync(base)) continue;
    let entries;
    try {
      entries = readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      out.push(...inMcpDir(join(base, entry.name, "checkout")));
    }
  }
  return out;
}

/**
 * import.meta.url only resolves when the server code runs unbundled (tests,
 * tsx); the daemon inlines plugin server code, so this is usually empty and
 * the failure is caught below.
 */
function moduleCandidates(): string[] {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return [...inMcpDir(here), ...inMcpDir(join(here, ".."))];
  } catch {
    return [];
  }
}

/** Low-priority fallback for direct runs (tests, tsx). */
function cwdCandidates(): string[] {
  const cwd = process.cwd();
  return [...inMcpDir(cwd), ...inMcpDir(join(cwd, ".."))];
}

/** Ordered candidate paths for the embedded MCP server, highest-confidence first. */
export function serverCandidates(selfDir?: string): string[] {
  return [
    ...overrideCandidates(),
    ...configCandidates(selfDir),
    ...managedCandidates(),
    ...moduleCandidates(),
    ...cwdCandidates(),
  ];
}

/**
 * Absolute path of the embedded remote-power MCP server.
 * Set PASEO_REMOTE_POWER_MCP_SERVER to override.
 */
export function serverPath(selfDir?: string): string {
  for (const candidate of serverCandidates(selfDir)) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "could not locate the embedded mcp server (mcp/paseo-remote-power.mjs); set PASEO_REMOTE_POWER_MCP_SERVER to the .mjs path",
  );
}
