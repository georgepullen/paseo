import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
import { HostThemeProvider, useHostTheme } from "../ui/theme.js";
import { HostCard } from "../ui/content.js";
import type { PluginTheme } from "../shared/types.js";

const hostTheme: PluginTheme = {
  colors: {
    surface0: "#0d1117",
    surface1: "#161b22",
    surface2: "#30363d",
    border: "#30363d",
    foreground: "#e6edf3",
    foregroundMuted: "#8b949e",
    accent: "#58a6ff",
    accentForeground: "#ffffff",
    statusSuccess: "#3fb950",
    statusWarning: "#d29922",
    statusDanger: "#f85149",
  },
};

function render(el: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer;
}

function flatten(style: unknown): Record<string, any> {
  if (Array.isArray(style)) return Object.assign({}, ...style.flat(Infinity) as any[]);
  if (style && typeof style === "object") return style as Record<string, any>;
  return {};
}

function findView(root: TestRenderer.ReactTestRenderer, predicate: (style: Record<string, any>) => boolean) {
  const found = root.root.findAllByType(View as any).find((v) => predicate(flatten(v.props.style)));
  if (!found) throw new Error("no View matched");
  return found;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ui/theme HostThemeProvider", () => {
  it("provides the host theme colors to adapters via useHostTheme", () => {
    let observed: any;
    function Probe() {
      const theme = useHostTheme();
      observed = theme.colors;
      return <Text>probe</Text>;
    }
    render(
      <HostThemeProvider theme={hostTheme}>
        <Probe />
      </HostThemeProvider>,
    );
    expect(observed.accent).toBe("#58a6ff");
    expect(observed.surface0).toBe("#0d1117");
  });

  it("binds alpha/getStatusColor/getVariantPalette to the provided colors", () => {
    let observed: any;
    function Probe() {
      const theme = useHostTheme();
      observed = theme;
      return <Text>probe</Text>;
    }
    render(
      <HostThemeProvider theme={hostTheme}>
        <Probe />
      </HostThemeProvider>,
    );
    expect(observed.alpha("#58a6ff", 0.5)).toBe("#58a6ff80");
    expect(observed.getStatusColor("danger")).toBe("#f85149");
    expect(observed.getVariantPalette("success").text).toBe("#3fb950");
  });

  it("applies the provided theme colors to rendered adapters", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostCard />
      </HostThemeProvider>,
    );
    const card = findView(r, (s) => s.backgroundColor === "#0d1117");
    expect(card).toBeTruthy();
  });
});

describe("ui/theme no-scraping conformance", () => {
  it("renders with the provided theme when the DOM is unavailable", () => {
    // Execution proof of no theme scraping: with no `document` on
    // globalThis there is nothing to scrape, and the adapter must still
    // render with the colors from the host theme prop.
    const globalObj = globalThis as any;
    const originalDocument = globalObj.document;
    const originalGetComputedStyle = globalObj.getComputedStyle;
    delete globalObj.document;
    delete globalObj.getComputedStyle;
    try {
      const r = render(
        <HostThemeProvider theme={hostTheme}>
          <HostCard />
        </HostThemeProvider>,
      );
      const card = findView(r, (s) => s.backgroundColor === "#0d1117");
      expect(card).toBeTruthy();
    } finally {
      if (originalDocument !== undefined) globalObj.document = originalDocument;
      if (originalGetComputedStyle !== undefined) {
        globalObj.getComputedStyle = originalGetComputedStyle;
      }
    }
  });

  it("does not call getComputedStyle even when the DOM is present", () => {
    const globalObj = globalThis as any;
    const originalGetComputedStyle = globalObj.getComputedStyle;
    const spy = vi.fn(() => ({ getPropertyValue: () => "#000000" }));
    globalObj.getComputedStyle = spy;
    try {
      render(
        <HostThemeProvider theme={hostTheme}>
          <HostCard />
        </HostThemeProvider>,
      );
      expect(spy).not.toHaveBeenCalled();
    } finally {
      if (originalGetComputedStyle !== undefined) {
        globalObj.getComputedStyle = originalGetComputedStyle;
      } else {
        delete globalObj.getComputedStyle;
      }
    }
  });

  it("ignores scraped DOM variables even when they disagree with the host theme", () => {
    // A DOM scraper would pick up the document's CSS variables; the ui/ layer
    // must prefer the host theme prop even when the DOM says something else.
    const globalObj = globalThis as any;
    const originalDocument = globalObj.document;
    globalObj.document = {
      documentElement: {},
      defaultView: {
        getComputedStyle: () => ({
          getPropertyValue: (name: string) =>
            name === "--accent" ? "#ff0000" : "#000000",
        }),
      },
    };
    try {
      const r = render(
        <HostThemeProvider theme={hostTheme}>
          <HostCard />
        </HostThemeProvider>,
      );
      // Card uses surface0 from the host theme prop, not the DOM's #000000.
      const card = findView(r, (s) => s.backgroundColor === "#0d1117");
      expect(card).toBeTruthy();
    } finally {
      if (originalDocument !== undefined) globalObj.document = originalDocument;
      else delete globalObj.document;
    }
  });
});
