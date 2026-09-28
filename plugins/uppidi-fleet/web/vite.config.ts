import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // @getpaseo/relay#0.9.2 maps bundlers to its unpublished `./src/*.ts`
    // entrypoints; pin the browser build to the shipped dist output instead.
    alias: {
      "@getpaseo/relay/e2ee": fileURLToPath(
        new URL("./node_modules/@getpaseo/relay/dist/e2ee.js", import.meta.url),
      ),
    },
  },
  server: {
    port: 5174,
    host: "127.0.0.1",
  },
  preview: {
    port: 4174,
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
