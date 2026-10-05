import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { PluginStorage } from "paseo-plugin-helper/server";
import type {
  FleetSkill,
  FleetSkillId,
  UppidiSetSkillInput,
  UppidiSetSkillOutput,
  UppidiSkillsOutput,
} from "../shared/contracts.js";

/** Plugin ids this plugin may be installed under (`uppidi-forge` is an alias). */
const SELF_PLUGIN_IDS = ["uppidi-fleet", "uppidi-forge"];

/** Bundled defaults live under `<pluginRoot>/examples/skills`. */
const BUNDLED_SKILLS_DIR = path.join("examples", "skills");

export interface PluginRootOptions {
  /** Explicit plugin root; callers that already know it skip discovery. */
  rootDir?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  cwd?: string;
  /**
   * Test seam: the module URL to consult. `null` simulates the daemon's bundle,
   * where `import.meta.url` is absent; `undefined` reads it, guarded.
   */
  moduleUrl?: string | null;
}

/** Explicit override for unusual host layouts (packaged app, moved checkout). */
function overrideCandidates(env: NodeJS.ProcessEnv, cwd: string): string[] {
  const raw = env.PASEO_UPPIDI_FLEET_ROOT?.trim();
  if (!raw) return [];
  return [path.isAbsolute(raw) ? raw : path.join(cwd, raw)];
}

/**
 * Directories the daemon records for installed plugins, this plugin's own ids
 * first so a sibling install can never shadow it.
 */
function configCandidates(home: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(home, ".paseo", "config.json"), "utf8"));
  } catch {
    return [];
  }
  const plugins = (parsed as { plugins?: unknown })?.plugins;
  if (!plugins || typeof plugins !== "object") return [];

  const preferred: string[] = [];
  const rest: string[] = [];
  for (const [id, entry] of Object.entries(plugins as Record<string, unknown>)) {
    const dir = (entry as { path?: unknown })?.path;
    if (typeof dir !== "string" || !dir.trim()) continue;
    (SELF_PLUGIN_IDS.includes(id) ? preferred : rest).push(dir);
  }
  return [...preferred, ...rest];
}

/** Managed-install layout: `~/.paseo/plugins/<pluginId>/<commit>/checkout`. */
function managedCandidates(home: string): string[] {
  const out: string[] = [];
  for (const pluginId of SELF_PLUGIN_IDS) {
    const base = path.join(home, ".paseo", "plugins", pluginId);
    if (!fs.existsSync(base)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      out.push(path.join(base, entry.name, "checkout"));
    }
  }
  return out;
}

/**
 * `import.meta.url` exists only when the server runs unbundled. Paseo bundles
 * and inlines plugin servers, so the read is guarded: an unguarded
 * `fileURLToPath(import.meta.url)` throws at module load and takes the plugin
 * down (#926). Kept for tests and any executor that runs the sources directly.
 */
function moduleCandidates(moduleUrl: string | null): string[] {
  if (!moduleUrl) return [];
  try {
    const here = path.dirname(fileURLToPath(moduleUrl));
    return [here, path.join(here, "..")];
  } catch {
    return [];
  }
}

function readModuleUrl(explicit: string | null | undefined): string | null {
  if (explicit !== undefined) return explicit;
  try {
    return (import.meta as unknown as { url?: string })?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Ordered candidate plugin roots, highest-confidence first. A plugin server is
 * bundled and inlined before it runs, so neither `import.meta.url` nor
 * `process.cwd()` identifies the checkout (#926). The dependable locator is the
 * install path the daemon records in `~/.paseo/config.json`, with an explicit
 * env override on top and the managed-checkout / module / cwd layouts below.
 */
export function pluginRootCandidates(options: PluginRootOptions = {}): string[] {
  const env = options.env ?? process.env;
  const home = options.home ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();
  return [
    ...(options.rootDir ? [options.rootDir] : []),
    ...overrideCandidates(env, cwd),
    ...configCandidates(home),
    ...managedCandidates(home),
    ...moduleCandidates(readModuleUrl(options.moduleUrl)),
    cwd,
    path.join(cwd, ".."),
  ];
}

/** Plugin root that actually holds `examples/skills`, or null when none does. */
export function resolvePluginRoot(options: PluginRootOptions = {}): string | null {
  for (const root of pluginRootCandidates(options)) {
    if (fs.existsSync(path.join(root, BUNDLED_SKILLS_DIR))) return root;
  }
  return null;
}

export interface FleetSkillDefinition {
  id: FleetSkillId;
  title: string;
  description: string;
  /** Bundled skill location, relative to the plugin root. */
  bundledRelPath: string;
}

/**
 * The skills the fleet ships and uses. The bundled copies are the
 * authoritative defaults for third parties; an operator override saved on the
 * Settings surface shadows the bundled copy without ever touching the checkout.
 */
export const FLEET_SKILL_DEFINITIONS: readonly FleetSkillDefinition[] = [
  {
    id: "orchestrator",
    title: "Orchestrator skill",
    description:
      "Workflow, pre-flight audits, agent synchronization, and human-in-the-loop signoff protocols for the orchestrating agent",
    bundledRelPath: "examples/skills/orchestrator/SKILL.md",
  },
  {
    id: "front-desk",
    title: "Front Desk skill",
    description:
      "Onboarding, operational workflow, operator liaison protocol, triage intake, and orchestrator coordination for the Front Desk agent",
    bundledRelPath: "examples/skills/front-desk/SKILL.md",
  },
  {
    id: "coding-agent",
    title: "Coding agent skill",
    description:
      "Workflow, CLI tool usage, self-stamping, and task lifecycle for coding agents executing issues assigned by the Orchestrator on Forgejo",
    bundledRelPath: "examples/skills/coding-agent/SKILL.md",
  },
] as const;

const FLEET_SKILL_IDS: ReadonlySet<string> = new Set(FLEET_SKILL_DEFINITIONS.map((def) => def.id));

export function isFleetSkillId(value: string): value is FleetSkillId {
  return FLEET_SKILL_IDS.has(value);
}

export interface SkillStorageOptions extends PluginRootOptions {
  /** Overrides the plugin-data base directory (used by tests). */
  baseDir?: string;
}

let skillsBaseDirOverride: string | null = null;

/** Test seam: redirect override storage away from the operator's real plugin-data. */
export function setSkillsBaseDirForTest(baseDir: string | null): void {
  skillsBaseDirOverride = baseDir;
}

function resolveStorageBaseDir(options?: SkillStorageOptions): string | undefined {
  if (options?.baseDir) return options.baseDir;
  if (skillsBaseDirOverride !== null) return skillsBaseDirOverride;
  if (process.env.NODE_ENV === "test") {
    return path.join(os.tmpdir(), `paseo-uppidi-fleet-test-${process.pid}`);
  }
  return undefined;
}

/**
 * `PluginStorage` scoped to `<plugin-data>/uppidi-fleet/skills/<id>.md`. Only its
 * namespace-aware path resolution is used: the file holds raw Markdown, so it is
 * written and read directly rather than through the JSON document API.
 */
export function getSkillOverrideStorage(
  skillId: string,
  options?: SkillStorageOptions,
): PluginStorage<Record<string, unknown>> {
  const baseDir = resolveStorageBaseDir(options);
  return new PluginStorage<Record<string, unknown>>("uppidi-fleet", `skills/${skillId}.md`, {
    ...(baseDir ? { baseDir } : {}),
  });
}

function getDefinition(skillId: string): FleetSkillDefinition {
  const def = FLEET_SKILL_DEFINITIONS.find((candidate) => candidate.id === skillId);
  if (!def) throw new Error(`Unknown skill id: ${skillId}`);
  return def;
}

/**
 * Absolute path of a bundled skill's default file, or null when no resolved
 * plugin root holds it. Never throws: a missing bundled copy falls back to the
 * operator override, and an empty default rather than a load-time crash (#926).
 */
export function getBundledSkillPath(
  skillId: string,
  options: PluginRootOptions = {},
): string | null {
  const def = getDefinition(skillId);
  for (const root of pluginRootCandidates(options)) {
    const candidate = path.join(root, def.bundledRelPath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function readBundledSkillContent(
  skillId: string,
  options: PluginRootOptions = {},
): string {
  const bundledPath = getBundledSkillPath(skillId, options);
  if (!bundledPath) return "";
  try {
    return fs.readFileSync(bundledPath, "utf8");
  } catch {
    return "";
  }
}

export interface EffectiveSkill {
  id: FleetSkillId;
  title: string;
  description: string;
  content: string;
  origin: "override" | "bundled";
  updatedAt?: string;
  /** Filesystem path a spawned agent should read (override file or bundled copy). */
  effectivePath: string;
}

/**
 * Resolves the effective skill text: the saved override when one exists,
 * otherwise the bundled default. Never reads or writes the repo checkout or
 * `~/.agents`.
 */
export function resolveEffectiveSkill(
  skillId: string,
  options?: SkillStorageOptions,
): EffectiveSkill {
  const def = getDefinition(skillId);
  const storage = getSkillOverrideStorage(skillId, options);

  if (fs.existsSync(storage.filePath)) {
    try {
      const content = fs.readFileSync(storage.filePath, "utf8");
      const stat = fs.statSync(storage.filePath);
      return {
        ...def,
        content,
        origin: "override",
        updatedAt: stat.mtime.toISOString(),
        effectivePath: storage.filePath,
      };
    } catch {
      // Unreadable override falls back to the bundled copy below.
    }
  }

  const bundledPath = getBundledSkillPath(skillId, options);
  return {
    ...def,
    content: readBundledSkillContent(skillId, options),
    origin: "bundled",
    effectivePath: bundledPath ?? "",
  };
}

/**
 * Path a spawn prompt should point at for a role's skill. Resolves the override
 * when the operator saved one, so spawned agents read the effective text.
 */
export function getEffectiveSkillPath(skillId: string): string {
  return resolveEffectiveSkill(skillId).effectivePath;
}

function toFleetSkill(skill: EffectiveSkill): FleetSkill {
  return {
    id: skill.id,
    title: skill.title,
    description: skill.description,
    content: skill.content,
    origin: skill.origin,
    updatedAt: skill.updatedAt,
  };
}

export function listFleetSkills(options?: SkillStorageOptions): FleetSkill[] {
  return FLEET_SKILL_DEFINITIONS.map((def) =>
    toFleetSkill(resolveEffectiveSkill(def.id, options)),
  );
}

/**
 * Saves an override as raw Markdown under plugin-data, or removes it when
 * `content` is null to restore the bundled default.
 */
export function setSkillContent(
  skillId: string,
  content: string | null,
  options?: SkillStorageOptions,
): FleetSkill {
  const def = getDefinition(skillId);
  const storage = getSkillOverrideStorage(skillId, options);

  if (content === null) {
    try {
      if (fs.existsSync(storage.filePath)) {
        fs.unlinkSync(storage.filePath);
      }
    } catch (err) {
      throw new Error(
        `Failed to reset ${def.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return toFleetSkill(resolveEffectiveSkill(def.id, options));
  }

  const dir = path.dirname(storage.filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${storage.filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, storage.filePath);

  return toFleetSkill(resolveEffectiveSkill(def.id, options));
}

export async function handleUppidiSkills(
  _input: Record<string, never>,
  _context: PluginHandlerContext,
): Promise<UppidiSkillsOutput> {
  try {
    return { ok: true, skills: listFleetSkills() };
  } catch (err: any) {
    return { ok: false, skills: [], error: err?.message || String(err) };
  }
}

export async function handleUppidiSetSkill(
  input: UppidiSetSkillInput,
  _context: PluginHandlerContext,
): Promise<UppidiSetSkillOutput> {
  const id = input.id?.trim();
  if (!id) {
    return { ok: false, error: "Skill id is required" };
  }
  if (!isFleetSkillId(id)) {
    return { ok: false, error: `Unknown skill id: ${id}` };
  }

  try {
    const skill = setSkillContent(id, input.content ?? null);
    return {
      ok: true,
      skill,
      message:
        input.content === null
          ? `Reset "${skill.title}" to the bundled default`
          : `Saved override for "${skill.title}"`,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
