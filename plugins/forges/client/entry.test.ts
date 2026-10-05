import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");

function readSource(relative: string): string {
  return fs.readFileSync(path.join(pluginDir, relative), "utf8");
}

describe("forges client entry contract (#783)", () => {
  it("initializes client helpers with required host dependencies", () => {
    const source = readSource("index.client.tsx");
    assert.match(
      source,
      /initClientHelpers\s*\(\s*\{[\s\S]*\}\s*\)/,
      "index.client.tsx must call initClientHelpers()",
    );
    for (const dep of ["Icon", "Modal", "useRpc", "useToast", "copyText", "ScrollView", "FlatList", "TextInput"]) {
      assert.ok(source.includes(dep), `initClientHelpers() must inject host dependency '${dep}'`);
    }
  });

  it("registers the workspace panel via registerWorkspacePanel (issue #783)", () => {
    const source = readSource("index.client.tsx");

    // Must import registerWorkspacePanel from paseo-plugin-helper/lifecycle
    assert.match(
      source,
      /import\s*\{[^}]*registerWorkspacePanel[^}]*\}\s*from\s*["']paseo-plugin-helper\/lifecycle["']/,
      "index.client.tsx must import registerWorkspacePanel from paseo-plugin-helper/lifecycle",
    );

    // Must call registerWorkspacePanel(client, { ... })
    assert.match(
      source,
      /registerWorkspacePanel\s*\(\s*client\s*,\s*\{[\s\S]*\}\s*\)/,
      "index.client.tsx must register the workspace panel via registerWorkspacePanel(client, { ... })",
    );

    // Must NOT call raw client.addWorkspacePanel directly, which bypasses <PluginThemeProvider>
    assert.doesNotMatch(
      source,
      /client\.addWorkspacePanel\s*\(/,
      "must not register panel with raw client.addWorkspacePanel; use registerWorkspacePanel to wrap in PluginThemeProvider",
    );

    // Verify registration options
    assert.match(source, /id:\s*["']forges-issues["']/, "panel id must be 'forges-issues'");
    assert.match(source, /title:\s*["']Forge Issues["']/, "panel title must be 'Forge Issues'");
    assert.match(source, /icon:\s*["']GitPullRequest["']/, "panel icon must be 'GitPullRequest'");
    assert.match(
      source,
      /locations:\s*\[\s*["']workspace["']\s*,\s*["']explorer["']\s*\]/,
      "panel locations must include ['workspace', 'explorer']",
    );
    assert.match(source, /Component:\s*ForgeIssuesPanel/, "panel Component must be ForgeIssuesPanel");
  });

  it("registers the composer pill via registerComposerPill", () => {
    const source = readSource("index.client.tsx");
    assert.match(
      source,
      /registerComposerPill\s*\(\s*client\s*,\s*\{[\s\S]*\}\s*\)/,
      "index.client.tsx must register the composer pill",
    );
    assert.match(source, /id:\s*ISSUES_PILL_ID/, "composer pill must use ISSUES_PILL_ID");
  });

  it("cleans up removePanel teardown on unmount", () => {
    const source = readSource("index.client.tsx");
    assert.match(
      source,
      /const removePanel = registerWorkspacePanel\(/,
      "must store return value of registerWorkspacePanel as removePanel",
    );
    assert.match(
      source,
      /return\s*\(\)\s*=>\s*\{[\s\S]*removePanel\(\);/,
      "contribute() cleanup must call removePanel()",
    );
  });

  it("exports ForgeIssuesPanel and associated components", () => {
    const source = readSource("index.client.tsx");
    assert.match(source, /export\s*\{[^}]*ForgeIssuesPanel[^}]*\}/, "must export ForgeIssuesPanel");
    assert.match(source, /export\s*\{[^}]*ForgeIssuesModal[^}]*\}/, "must export ForgeIssuesModal");
    assert.match(source, /export\s*\{[^}]*ForgeIssuesView[^}]*\}/, "must export ForgeIssuesView");
    assert.match(source, /export\s*\{[^}]*ISSUES_PILL_ID[^}]*\}/, "must export ISSUES_PILL_ID");

    const issuesPillSource = readSource("client/issues-pill.tsx");
    assert.match(
      issuesPillSource,
      /export function ForgeIssuesPanel\(/,
      "client/issues-pill.tsx must export ForgeIssuesPanel",
    );
  });
});
