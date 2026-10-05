import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Guard for xpufx-org/paseo#937: plugin-updates must render from its own local
 * composition over the host SDK, never the frozen helper client UI kit. A
 * new import here would silently resurrect the bespoke design system #847
 * removed it for, so it fails rather than being caught by review.
 */
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = "paseo-plugin-helper/" + "client";
const IMPORT_RE = new RegExp(`from\\s+["']${FORBIDDEN}["']`);
const SKIP_DIRS = new Set(["vendor", "node_modules", "test"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(full);
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) return [];
    return [full];
  });
}

test("no non-vendored plugin-updates source imports the frozen helper client kit", () => {
  const offenders = sourceFiles(PLUGIN_ROOT)
    .filter((file) => IMPORT_RE.test(readFileSync(file, "utf8")))
    .map((file) => relative(PLUGIN_ROOT, file));
  assert.deepEqual(offenders, []);
});
