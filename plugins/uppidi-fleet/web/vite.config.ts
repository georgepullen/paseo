import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host =
    process.env.HOST ||
    process.env.VITE_HOST ||
    env.HOST ||
    env.VITE_HOST ||
    "0.0.0.0";
  const port = Number(process.env.PORT || env.PORT || 5174);
  const previewPort = Number(process.env.PREVIEW_PORT || env.PREVIEW_PORT || 4174);

  return {
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
      port,
      host,
    },
    preview: {
      port: previewPort,
      host,
    },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/__tests__/setup.ts"],
    },
  };
});
