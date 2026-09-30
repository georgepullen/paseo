import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { getFleetHarness } from "./testing/fleet-harness.js";

interface RenderedNode {
  props?: Record<string, any>;
  children?: RenderedNode[] | string | Array<RenderedNode | string | null>;
}

function flatten(node: RenderedNode | null, out: RenderedNode[] = []): RenderedNode[] {
  if (!node) return out;
  out.push(node);
  for (const child of (Array.isArray(node.children) ? node.children : []) as RenderedNode[]) {
    flatten(child, out);
  }
  return out;
}

function renderedText(tree: RenderedNode | null): string {
  const parts: string[] = [];
  for (const node of flatten(tree)) {
    if (typeof node.props?.label === "string") parts.push(node.props.label);
    if (typeof node.children === "string") parts.push(node.children);
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (typeof child === "string") parts.push(child);
      }
    }
  }
  return parts.join(" ");
}

describe("Issue #791: Uppidi Fleet sidebar issues tab and repo dropdown", () => {
  it("mounts ForgeIssuesView without throwing 'Plugin state hooks must run inside a workspace panel' outside workspace panel", async () => {
    const harness = await getFleetHarness();
    const { ForgeIssuesView } = await import("./forges-tab.js");

    let openIssuesCalledWith: any = null;
    harness.payloads["forge.open-issues"] = (input: any) => {
      openIssuesCalledWith = input;
      return {
        ok: true,
        repo: "xpufx-org/paseo",
        host: "forge.mrs.uppidi.com",
        issues: [
          {
            number: 791,
            title: "Uppidi Fleet when launched from the side navbar issues tab",
            state: "open",
            author: "operator",
            labels: ["state/1-wip"],
            comments: 2,
            url: "https://forge.mrs.uppidi.com/xpufx-org/paseo/issues/791",
            repo: "xpufx-org/paseo",
          },
        ],
        totalOpenCount: 1,
      };
    };

    harness.payloads["forge.context"] = {
      directory: "/home/user/.paseo/worktrees/2h0dw6vb/fix-791-fleet-sidebar-issues-tab",
      derivedRepo: "xpufx-org/paseo",
      derivedHost: "forge.mrs.uppidi.com",
    };

    // Render ForgeIssuesView directly with no workspace panel or PluginClientStateProvider.
    // Pre-fix: this throws "Plugin failed: Plugin state hooks must run inside a workspace panel"
    const { renderer } = await harness.renderWithRoot(
      <ForgeIssuesView
        workspaceId="sidebar-ws-id"
        enrolledRepos={["xpufx-org/paseo", "xpufx-org/2fado"]}
        activeRepo="xpufx-org/paseo"
      />,
    );

    await harness.TestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    const text = renderedText(renderer?.toJSON());
    assert.match(text, /Forge Issues/);
    assert.match(text, /#\s*791/);
    assert.match(text, /Uppidi Fleet when launched from the side navbar issues tab/);
    assert.ok(openIssuesCalledWith, "forge.open-issues query must be called");
  });

  it("defaults repo selector to active workspace repo when active, and supports All Enrolled Repositories", async () => {
    const harness = await getFleetHarness();
    const { ForgeIssuesView } = await import("./forges-tab.js");

    let lastIssuesInput: any = null;
    harness.payloads["forge.open-issues"] = (input: any) => {
      lastIssuesInput = input;
      return {
        ok: true,
        repo: input?.repo || "xpufx-org/paseo",
        host: "forge.mrs.uppidi.com",
        issues: [
          {
            number: 791,
            title: "Paseo issue",
            state: "open",
            author: "alice",
            labels: [],
            comments: 1,
            url: "https://forge.example/791",
            repo: "xpufx-org/paseo",
          },
          {
            number: 800,
            title: "2fado issue",
            state: "open",
            author: "bob",
            labels: [],
            comments: 0,
            url: "https://forge.example/800",
            repo: "xpufx-org/2fado",
          },
        ],
        totalOpenCount: 2,
      };
    };

    let selectedRepoState = "xpufx-org/paseo";
    const res1 = await harness.renderWithRoot(
      <ForgeIssuesView
        workspaceId="ws-1"
        enrolledRepos={["xpufx-org/paseo", "xpufx-org/2fado"]}
        activeRepo="xpufx-org/paseo"
        selectedRepo={selectedRepoState}
        onSelectRepo={(r) => {
          selectedRepoState = r;
        }}
      />,
    );

    await harness.TestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    // When activeRepo is set, only active repo issue is shown (xpufx-org/paseo)
    let text = renderedText(res1.renderer.toJSON());
    assert.match(text, /#\s*791/);
    assert.doesNotMatch(text, /#\s*800/);

    // Now render with "all" (All Enrolled Repositories)
    const res2 = await harness.renderWithRoot(
      <ForgeIssuesView
        workspaceId="ws-1"
        enrolledRepos={["xpufx-org/paseo", "xpufx-org/2fado"]}
        activeRepo="xpufx-org/paseo"
        selectedRepo="all"
        onSelectRepo={(r) => {
          selectedRepoState = r;
        }}
      />,
    );

    await harness.TestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    text = renderedText(res2.renderer.toJSON());
    // In "all" mode, both issues are displayed
    assert.match(text, /#\s*791/);
    assert.match(text, /#\s*800/);
    assert.match(text, /All Enrolled Repositories/);
  });

  it("defaults to 'all' when no active repo is provided", async () => {
    const harness = await getFleetHarness();
    const { ForgeIssuesView } = await import("./forges-tab.js");

    harness.payloads["forge.open-issues"] = {
      ok: true,
      repo: null,
      host: "forge.mrs.uppidi.com",
      issues: [],
      totalOpenCount: 0,
    };
    harness.payloads["forge.context"] = {
      directory: null,
      derivedRepo: null,
      derivedHost: null,
    };

    const { renderer } = await harness.renderWithRoot(
      <ForgeIssuesView
        workspaceId=""
        enrolledRepos={["xpufx-org/paseo", "xpufx-org/2fado"]}
      />,
    );

    await harness.TestRenderer.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const text = renderedText(renderer.toJSON());
    assert.match(text, /All Enrolled Repositories/);
  });
});
