import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");

function readSource(relative: string): string {
  return fs.readFileSync(path.join(pluginDir, relative), "utf8");
}

describe("permission-logger client entry", () => {
  it("initializes client helpers before registering surfaces", () => {
    const source = readSource("index.client.tsx");
    expect(source).toMatch(/initClientHelpers\s*\(\s*\{[\s\S]*\}\s*\)/);
    for (const dep of ["Icon", "Modal", "useRpc", "useToast", "copyText", "ScrollView", "FlatList"]) {
      expect(source).toContain(dep);
    }
    expect(source).toMatch(/registerSidebarSurface/);
  });
});

describe("permission-logger surface", () => {
  it("renders recent requests via the query contract with search and decision filters", () => {
    const source = readSource("client/surface.tsx");
    expect(source).toContain("permissionLoggerQuery");
    expect(source).toContain("SearchInput");
    expect(source).toContain("DataTable");
    expect(source).toContain("EmptyState");
    expect(source).toContain("permission-logger-search");
    expect(source).toMatch(/All.*Pending.*Allowed.*Denied|decision/);
    expect(source).toContain('"pending"');
    expect(source).toContain('"warning"');
  });
});

describe("permission-logger server entry", () => {
  it("wires the query RPC and permission event subscription", () => {
    const source = readSource("index.server.ts");
    expect(source).toContain("permissionLoggerQuery");
    expect(source).toContain("subscribePermissionEvents");
    expect(source).toContain("PermissionLogStore");
  });

  it("declares the plugin manifest with paseo >=0.9 and npm install build", () => {
    const manifest = JSON.parse(readSource("paseo-plugin.json"));
    expect(manifest.id).toBe("permission-logger");
    expect(manifest.requirements.paseo).toBe(">=0.9.0");
    expect(manifest.build).toContainEqual(["npm", "install"]);
  });
});
