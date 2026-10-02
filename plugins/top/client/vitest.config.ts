import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// This file sits under `client/` so the published plugin root keeps only the
// `client/`, `server/`, and `shared/` trees the v0.8 compiler accepts (the UI
// conformance audit rejects a code module at the plugin root). The test root is
// still the plugin directory so the `node:test` suites and JSX tests resolve
// across client/server/shared.
const root = path.resolve(here, "..");

/**
 * Single vitest runner for the top plugin.
 *
 * The existing `node:test` suites run unchanged through a small `node:test`
 * shim alias, and the JSX regression tests render the real pill path against a
 * stubbed React Native. The helper resolves through the workspace link to its
 * built `dist`, so tests exercise the same helper bundle the plugin ships.
 *
 * `paseo-plugin-helper/client` and `paseo-plugin-helper/ui` alias to the helper
 * *source* instead: the `ui/` adapters resolve their host dependencies
 * (`getClientHost`, `initClientHelpers`) through the client bundle, and the
 * published `dist` builds each entry as a separate bundle with its own host
 * state. A test that calls `initClientHelpers` from the client entry would
 * never reach the `ui/` entry's copy, so surfaces rendered from `ui/` (the
 * shared permission-audit view) would throw "used before initClientHelpers".
 * Aliasing both entries to one source graph gives tests the same single host
 * instance the esbuild-bundled plugin has in production.
 */
export default defineConfig({
  root,
  resolve: {
    alias: {
      "node:test": path.resolve(root, "server/__node-test-shim.ts"),
      "react-native": path.resolve(root, "client/test-utils/react-native.ts"),
      "paseo-plugin-helper/client": path.resolve(
        root,
        "../../packages/paseo-plugin-helper/src/client/index.ts",
      ),
      "paseo-plugin-helper/ui": path.resolve(
        root,
        "../../packages/paseo-plugin-helper/src/ui/index.ts",
      ),
    },
  },
  test: {
    include: [
      "client/**/*.test.ts",
      "client/**/*.test.tsx",
      "server/**/*.test.ts",
      "shared/**/*.test.ts",
    ],
    testTimeout: 30_000,
  },
});
