import { describe, expect, it, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ScrollView } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initClientHelpers, ModalBodyScrollOwnerContext } from "paseo-plugin-helper/client";
import { PermissionAuditView } from "permission-audit/client";
import type { PermissionAuditEntry } from "permission-audit/shared";

vi.mock("@getpaseo/plugin/client", () => ({
  useWorkspace: (_id: string, sel: (w: unknown) => unknown) => sel({ directory: "/tmp/ws" }),
  useAgent: (_id: string, sel: (a: unknown) => unknown) => sel({}),
  useRpc: () => async () => ({}),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENTRIES: PermissionAuditEntry[] = [
  {
    id: "r1",
    timestamp: "2026-09-28T10:00:00.000Z",
    agentId: "agent-1",
    kind: "tool",
    name: "bash",
    input: { command: "ls" },
    decision: "allow",
  },
  {
    id: "r2",
    timestamp: "2026-09-28T10:05:00.000Z",
    agentId: "agent-2",
    kind: "tool",
    name: "read",
    input: { path: "/etc/hosts" },
    decision: "deny",
  },
];

function installHost() {
  initClientHelpers({
    Icon: (props: { name?: string }) => React.createElement("mock-icon", { name: props.name }),
    Modal: Object.assign(() => null, { Content: () => null }),
    useRpc: () => async () => ({ entries: ENTRIES, total: ENTRIES.length }),
    useToast: () => ({}),
  } as unknown as Parameters<typeof initClientHelpers>[0]);
}

function renderView(
  props: React.ComponentProps<typeof PermissionAuditView>,
  scrollOwner: "helper" | "required" = "helper",
) {
  installHost();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <ModalBodyScrollOwnerContext.Provider value={scrollOwner}>
          <PermissionAuditView {...props} />
        </ModalBodyScrollOwnerContext.Provider>
      </QueryClientProvider>,
    );
  });
  return renderer;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node && typeof node === "object") {
    const el = node as { type?: unknown; children?: unknown };
    if (el.type === "mock-icon") return "";
    if ("children" in el) return textOf(el.children);
  }
  return "";
}

describe("PermissionAuditView inside top", () => {
  it("page variant owns a scroll container and renders audit rows", async () => {
    const renderer = renderView({ variant: "page" }, "required");
    await settle();
    expect(renderer.root.findAllByType(ScrollView).length).toBeGreaterThan(0);
    const text = textOf(renderer.toJSON());
    expect(text).toContain("bash");
    expect(text).toContain("read");
  });

  it("compact variant renders rows without nesting its own scroller", async () => {
    const renderer = renderView({ variant: "compact" });
    await settle();
    expect(renderer.root.findAllByType(ScrollView)).toHaveLength(0);
    const text = textOf(renderer.toJSON());
    expect(text).toContain("bash");
    expect(text).toContain("Denied");
  });

  it("scopes rows to the selected agent", async () => {
    const renderer = renderView({ variant: "compact", agentId: "agent-2" });
    await settle();
    const text = textOf(renderer.toJSON());
    expect(text).toContain("read");
    expect(text).not.toContain("bash");
  });
});
