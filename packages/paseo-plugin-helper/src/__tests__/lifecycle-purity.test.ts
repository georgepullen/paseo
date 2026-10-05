import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The `lifecycle` entry is client-safe (React Native, no `node:*`) but must
 * not drag the frozen `client/` design system into a consumer's bundle. It may
 * use the headless host seam (`client/host.ts`) only.
 */
const FORBIDDEN = [
  /from\s+["']node:/,
  /require\(\s*["']node:/,
  /client\/(theme|styles|components|layout|tickets|custom-pills|settings-screen|forge-icon|icon)\b/,
  /from\s+["'][^"']*\/client\/index(?:\.js)?["']/,
] as const;

function stripTypeImports(source: string): string {
  return source.replace(/import\s+type\b[\s\S]*?;/g, "");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

function resolveImport(fromFile: string, spec: string): string | undefined {
  if (!spec.startsWith(".")) return undefined;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  if (base.endsWith(".js")) {
    const stem = base.slice(0, -".js".length);
    candidates.push(stem, `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`, `${stem}/index.tsx`);
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function collectTransitive(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry)) return [];
  seen.add(entry);
  let source: string;
  try {
    source = readFileSync(entry, "utf8");
  } catch {
    return [];
  }
  const out = [entry];
  for (const match of source.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']/g)) {
    const next = resolveImport(entry, match[1]);
    if (next) out.push(...collectTransitive(next, seen));
  }
  return out;
}

describe("lifecycle entry purity (UI-free client runtime)", () => {
  it("does not pull the frozen client design system", () => {
    const files = collectTransitive(resolve(SRC, "lifecycle/index.ts"));
    expect(files.length).toBeGreaterThan(5);
    const violations: string[] = [];
    for (const file of files) {
      const rel = file.slice(SRC.length + 1);
      if (rel === "client/host.ts" || rel.startsWith("shared/")) continue;
      const body = stripComments(stripTypeImports(readFileSync(file, "utf8")));
      for (const pattern of FORBIDDEN) {
        if (pattern.test(body)) violations.push(`${rel}: ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
