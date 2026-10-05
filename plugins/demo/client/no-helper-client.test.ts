import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression guard for xpufx-org/paseo#937/#924: the demo (non-vendored) must
 * not reach back into the frozen helper `client/` UI kit. The plugin-local
 * `client/host-ui.tsx` is the replacement. Vendored helper trees are exempt
 * (they are not the plugin's import graph).
 */

const CLIENT_DIR = path.resolve(process.cwd(), "client");
const FORBIDDEN = ["paseo-plugin-helper", "client"].join("/");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "vendor" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("demo is off the frozen helper client kit", () => {
  it("has no non-vendored helper `client` import", () => {
    const files = sourceFiles(CLIENT_DIR);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) =>
      new RegExp(`from\\s+["']${FORBIDDEN}["']`).test(fs.readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
