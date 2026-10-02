import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const helperSrc = path.resolve(root, "..", "paseo-plugin-helper", "src");

export default defineConfig({
  test: {
    alias: {
      // The real react-native entrypoint carries Flow syntax Vite cannot
      // parse; render tests stub it (same approach as the helper's own
      // ui/ conformance suite).
      "react-native": path.resolve(root, "src/__tests__/mocks/react-native.ts"),
      // Alias both helper entries to one source graph: the `ui/` adapters
      // resolve their host dependencies through the client bundle, and the
      // published `dist` builds each entry separately with its own host
      // state. A test calling `initClientHelpers` from the client entry
      // would never reach the `ui/` entry's copy otherwise.
      "paseo-plugin-helper/client": path.resolve(helperSrc, "client/index.ts"),
      "paseo-plugin-helper/ui": path.resolve(helperSrc, "ui/index.ts"),
    },
  },
});
