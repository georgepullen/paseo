import { beforeEach, describe, expect, it } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { View } from "react-native";
import { initClientHelpers } from "../core/host.js";
import { registerSidebarSurface } from "../lifecycle/surface.js";
import { registerAgentPanel, registerWorkspacePanel } from "../lifecycle/panel.js";
import { registerComposerPill } from "../lifecycle/pill.js";
import { useHostTheme } from "../ui/theme.js";
import type { PluginTheme } from "../shared/types.js";

/**
 * Regression coverage for #923 / Fix A on #867: every helper registration
 * wrapper must mount `HostThemeProvider` so `paseo-plugin-helper/ui` adapters
 * read the forwarded host `theme` instead of the static dark fallback.
 */

const LIGHT: PluginTheme = {
  colors: {
    surface0: "#ffffff",
    surface1: "#f4f4f5",
    surface2: "#e4e4e7",
    border: "#d4d4d8",
    foreground: "#18181b",
    foregroundMuted: "#71717a",
    accent: "#2563eb",
    accentForeground: "#ffffff",
    statusSuccess: "#16a34a",
    statusWarning: "#ca8a04",
    statusDanger: "#dc2626",
  },
};

// The static `ui/theme.tsx` fallback `surface0`; if a registration wrapper
// forgets its provider, the probe below renders this instead of LIGHT.
const FALLBACK_SURFACE0 = "#18181b";

const layout = { compact: false, platform: "web" } as const;
const host = { id: "h", label: "H" };

beforeEach(() => {
  initClientHelpers({
    Icon: () => null,
    Modal: Object.assign((props: any) => <>{props.open ? props.children : null}</>, {
      Content: (props: any) => <>{props.children}</>,
    }),
    useRpc: () => async () => ({}),
    useToast: () => ({}),
  } as any);
});

function flatten(style: unknown): Record<string, any> {
  if (Array.isArray(style)) return Object.assign({}, ...(style.flat(Infinity) as any[]));
  if (style && typeof style === "object") return style as Record<string, any>;
  return {};
}

/** A `ui/` consumer that paints the host token it resolves. */
function HostConsumer() {
  const { colors } = useHostTheme();
  return <View testID="host-theme-probe" style={{ backgroundColor: colors.surface0 }} />;
}

function renderComponent(Component: any, props: Record<string, unknown>) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Component {...props} />);
  });
  return renderer;
}

function probeSurface0(renderer: TestRenderer.ReactTestRenderer): string | undefined {
  const probe = renderer.root.findByProps({ testID: "host-theme-probe" });
  return flatten(probe.props.style).backgroundColor;
}

function expectLight(subtree: TestRenderer.ReactTestRenderer) {
  const surface0 = probeSurface0(subtree);
  expect(surface0).toBe(LIGHT.colors.surface0);
  expect(surface0).not.toBe(FALLBACK_SURFACE0);
}

describe("ui/ host theme through helper registrations (#923)", () => {
  it("documents the fallback a missing provider degrades to", () => {
    // Without a wrapper the ui/ adapter silently paints the static fallback:
    // visible, but wrong on a light desktop. That silence is the bug.
    const bare = renderComponent(HostConsumer, {});
    expect(probeSurface0(bare)).toBe(FALLBACK_SURFACE0);
  });

  it("registerSidebarSurface forwards the host theme to ui/ consumers", () => {
    let registered: any;
    registerSidebarSurface(
      {
        addSurface: (_id: string, Component: any) => {
          registered = Component;
          return () => {};
        },
        addSidebarItem: () => () => {},
      } as any,
      { id: "surface-923", title: "S", icon: "Square", Component: HostConsumer },
    );

    expectLight(renderComponent(registered, { theme: LIGHT, layout, host }));
  });

  it("registerWorkspacePanel forwards the host theme to ui/ consumers", () => {
    let registered: any;
    registerWorkspacePanel(
      {
        addWorkspacePanel: (contribution: any) => {
          registered = contribution.Component;
          return () => {};
        },
      } as any,
      { id: "panel-923", title: "P", icon: "PanelsTopLeft", Component: HostConsumer },
    );

    expectLight(renderComponent(registered, { theme: LIGHT, layout, host }));
  });

  it("registerAgentPanel forwards the host theme to ui/ consumers", () => {
    let registered: any;
    registerAgentPanel(
      {
        addWorkspacePanel: (contribution: any) => {
          registered = contribution.Component;
          return () => {};
        },
      } as any,
      { id: "agent-panel-923", title: "P", icon: "PanelsTopLeft", Component: HostConsumer },
    );

    expectLight(
      renderComponent(registered, {
        context: "agent",
        agentId: "a1",
        workspaceId: "w1",
        theme: LIGHT,
        layout,
        host,
      }),
    );
  });

  it("registerComposerPill popover forwards the host theme to ui/ consumers", async () => {
    let Content: any;
    const client = {
      addComposerPill: (contribution: any) => {
        Content = contribution.button.behavior.Content;
        return { update: () => {}, remove: () => {} };
      },
      paseo: {
        agents: {
          subscribe: () => () => {},
          list: async () => ({ entries: [{ agent: { id: "a1", workspaceId: "w1" } }] }),
        },
      },
    } as any;

    act(() => {
      registerComposerPill(client, {
        id: "popover-923",
        title: "P",
        renderModal: () => <HostConsumer />,
      } as any);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(Content).toBeDefined();

    expectLight(
      renderComponent(Content, {
        context: "agent",
        agentId: "a1",
        workspaceId: "w1",
        theme: LIGHT,
        layout,
        host,
        close: () => {},
      }),
    );
  });

  it("registerComposerPill centered modal forwards the host theme to ui/ consumers", async () => {
    let PillIcon: any;
    let openModal: (() => void) | undefined;
    const client = {
      addComposerPill: (contribution: any) => {
        PillIcon = contribution.button.icon;
        openModal = contribution.button.behavior.onPress;
        return { update: () => {}, remove: () => {} };
      },
      paseo: {
        agents: {
          subscribe: () => () => {},
          list: async () => ({ entries: [{ agent: { id: "a1", workspaceId: "w1" } }] }),
        },
      },
    } as any;

    act(() => {
      registerComposerPill(client, {
        id: "centered-923",
        title: "P",
        presentation: "centered",
        renderModal: () => <HostConsumer />,
      } as any);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(PillIcon).toBeDefined();

    act(() => {
      openModal?.();
    });

    expectLight(
      renderComponent(PillIcon, {
        context: "agent",
        agentId: "a1",
        workspaceId: "w1",
        theme: LIGHT,
        layout,
        host,
        size: 14,
        color: "",
      }),
    );
  });
});
