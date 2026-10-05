// Kept as `.mjs` (not `.ts`) so it stays outside this package's
// `**/*.ts`/`**/*.tsx` tsconfig include: any extra un-imported `.ts` root file
// flips the helper mcp `setTimeout`/`NodeJS.Timeout` overload resolution in
// this plugin's DOM+node type environment.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const IGNORED_DIRS = new Set(["vendor", "node_modules", "dist", "build", ".git", ".paseo", "coverage"]);
const SCANNABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function findSources(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) results.push(...findSources(full));
      continue;
    }
    if (!SCANNABLE_EXTENSIONS.has(path.extname(entry.name))) continue;
    // The test files themselves carry the forbidden specifier as a literal.
    if (entry.name.includes(".test.") || entry.name.includes(".spec.")) continue;
    results.push(full);
  }
  return results;
}

describe("helper client kit removal (#937)", () => {
  it("has no non-vendored paseo-plugin-helper/client import", () => {
    const offenders = findSources(pluginRoot).filter((file) =>
      /from\s+["']paseo-plugin-helper\/client["']/.test(fs.readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => path.relative(pluginRoot, file))).toEqual([]);
  });
});
