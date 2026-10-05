import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// This file sits under `client/` so the published plugin root keeps only the
// `client/`, `server/`, and `shared/` trees the v0.8 compiler accepts. The test
// root is the plugin directory so the JSX tests resolve across client/server/shared.
const root = path.resolve(here, "..");
const helperSrc = path.resolve(root, "..", "..", "packages", "paseo-plugin-helper", "src");

/**
 * Single vitest runner for the 2fado plugin.
 *
 * `paseo-plugin-helper/core`, `/lifecycle` and `/client` alias to the helper
 * *source* instead of the published `dist`: the headless hooks, lifecycle
 * registrars and the frozen UI kit all resolve host dependencies through the
 * shared `client/host` module, and each published entry is a separate bundle
 * with its own host state. Aliasing to source gives tests the same single host
 * instance the esbuild-bundled plugin has in production, so a surface that
 * calls `initClientHelpers` from the core entry and renders a client-kit
 * component does not throw "used before initClientHelpers".
 */
export default defineConfig({
  root,
  resolve: {
    alias: {
      "paseo-plugin-helper/core": path.resolve(helperSrc, "core/index.ts"),
      "paseo-plugin-helper/lifecycle": path.resolve(helperSrc, "lifecycle/index.ts"),
      "paseo-plugin-helper/client": path.resolve(helperSrc, "client/index.ts"),
    },
  },
});
