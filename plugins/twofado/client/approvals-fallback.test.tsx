import { describe, expect, it, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
// `ApprovalSurface` re-enters helper hooks (`usePluginSettings`), so the
// helper barrel must be required after `initClientHelpers` below — a top-level
// import would evaluate it before the host seam exists.
const { initClientHelpers } = await import("paseo-plugin-helper/client");
import { ApprovalSurface } from "./approvals";

// The real `react-native` entrypoint carries Flow syntax Vite cannot parse;
// the `@getpaseo/plugin/client/*` modules ship as `export {}` — the *host*
// injects their runtime bindings. `import { Icon }` therefore compiles but
// evaluates to `undefined` (xpufx-org/paseo#555), so there is no SDK mock
// here: every SDK specifier stays undefined, which is the mobile failure
// mode this file pins.
vi.mock("react-native", () => {
  const stub = (name: string) => {
    const Component = (props: Record<string, unknown>) =>
      React.createElement(name, props, (props?.children as React.ReactNode) ?? null);
    Object.defineProperty(Component, "name", { value: name });
    return Component;
  };
  return {
    View: stub("View"),
    Text: stub("Text"),
    StyleSheet: {
      create: <T,>(styles: T): T => styles,
      flatten: (style: unknown) => style,
      hairlineWidth: 1,
      compose: (a: unknown, b: unknown) => [a, b],
    },
    Platform: {
      OS: "web" as const,
      select: <T,>(options: { web?: T; default?: T }): T | undefined =>
        options.web ?? options.default,
    },
    Appearance: {
      getColorScheme: () => "dark" as const,
      addChangeListener: () => ({ remove: () => {} }),
    },
    useColorScheme: () => "dark" as const,
    useWindowDimensions: () => ({ width: 900, height: 700, scale: 1, fontScale: 1 }),
    Easing: {
      linear: (v: number) => v,
      ease: (v: number) => v,
      inOut: (v: unknown) => v,
    },
    ScrollView: stub("ScrollView"),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

/** Flatten the rendered tree to its concatenated text content. */
function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "children" in node) {
    return textOf((node as { children?: unknown }).children);
  }
  return "";
}

const surfaceProps = {
  theme: {
    colors: {
      surface0: "#101014",
      surface1: "#17171d",
      surface2: "#1f1f26",
      border: "#2c2c34",
      foreground: "#e8e8ee",
      foregroundMuted: "#9a9aa6",
      accent: "#7aa2f7",
      accentForeground: "#101014",
      statusSuccess: "#9ece6a",
      statusWarning: "#e0af68",
      statusDanger: "#f7768e",
    },
  },
  layout: { compact: false, platform: "web" as const },
};

describe("2fado ApprovalSurface survives undefined host bindings (#555)", () => {
  it("renders the degraded fallback surface with no host SDK bindings", () => {
    initClientHelpers({
      Icon: undefined,
      Modal: undefined,
      useRpc: () => async () => ({}),
      useToast: () => ({ show() {}, error() {}, copied() {} }),
    } as unknown as Parameters<typeof initClientHelpers>[0]);
    const renderer = render(
      React.createElement(ApprovalSurface, surfaceProps as never),
    );
    const text = textOf(renderer.toJSON());
    expect(text).toContain("2fado panel hit a render error");
    expect(text).toContain("Re-open the panel to retry.");
  });
});
