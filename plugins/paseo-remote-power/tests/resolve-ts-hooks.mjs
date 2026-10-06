// Dev-only ESM resolution hook for `node --test` (see package.json test script).
// Maps extensionless relative specifiers to their .ts/index files, which plain
// node (type-stripping, no loader) does not resolve. Mirrors the hook pair in
// plugins/x-comms and plugins/uppidi-fleet. No ".tsx" probe: node's type
// stripping does not transform JSX, so a ".tsx" candidate could not load here
// even when it exists.
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

function tryFile(url) {
  try {
    if (fs.statSync(url, { throwIfNoEntry: false })?.isFile()) return url.href;
  } catch {
    // fall through
  }
  return null;
}

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (
      err?.code !== "ERR_MODULE_NOT_FOUND" ||
      !specifier.startsWith(".") ||
      /\.[a-z]+$/i.test(specifier)
    ) {
      throw err;
    }
    const parentPath = fileURLToPath(context.parentURL);
    const base = new URL(specifier, pathToFileURL(parentPath));
    const basePath = base.pathname;
    for (const ext of [".ts"]) {
      const hit = tryFile(new URL(`file://${basePath}${ext}`));
      if (hit) return { url: hit, shortCircuit: true };
    }
    for (const index of ["index.ts"]) {
      const hit = tryFile(new URL(`file://${basePath}/${index}`));
      if (hit) return { url: hit, shortCircuit: true };
    }
    throw err;
  }
}
