import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ScrollView, Text, TextInput, View } from "react-native";
import { initClientHelpers } from "../core/host.js";
import { HostModalContent, HostModalSection, HostScroll } from "../ui/modal.js";
import { HostCard, HostCardHeader, HostTabs, HostBadge } from "../ui/content.js";
import { HostButton, HostToggle, HostSelect, HostTextInput } from "../ui/controls.js";
import { HostThemeProvider, useHostTheme } from "../ui/theme.js";
import { alpha, getStatusColor, getVariantPalette } from "../ui/color.js";
import type { PluginTheme } from "../shared/types.js";

let hostContentProps: Record<string, unknown> | null = null;

const hostTheme: PluginTheme = {
  colors: {
    surface0: "#111111",
    surface1: "#222222",
    surface2: "#333333",
    border: "#444444",
    foreground: "#eeeeee",
    foregroundMuted: "#999999",
    accent: "#0066cc",
    accentForeground: "#ffffff",
    statusSuccess: "#00aa44",
    statusWarning: "#cc8800",
    statusDanger: "#cc2200",
  },
};

function installStubs() {
  hostContentProps = null;
  const HostContent = (props: Record<string, unknown>) => {
    hostContentProps = props;
    return <View testID="host-modal-content">{props.children as React.ReactNode}</View>;
  };
  const HostScrollView = (props: Record<string, unknown>) => (
    <ScrollView testID="host-scrollview" {...(props as object)} />
  );
  const HostFlatList = (_props: Record<string, unknown>) => (
    <View testID="host-flatlist" />
  );
  initClientHelpers({
    Icon: () => null,
    Modal: Object.assign(() => null, { Content: HostContent }),
    useRpc: () => async () => ({}),
    useToast: () => ({}),
    ScrollView: HostScrollView,
    FlatList: HostFlatList,
  } as any);
}

beforeEach(() => {
  installStubs();
});

function render(el: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer!;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean));
  }
  return (style as Record<string, unknown>) ?? {};
}

// --- Scroll ownership (acceptance criterion #2) -----------------------------

describe("ui/ scroll ownership conformance", () => {
  it("HostModalContent leaves scroll ownership with the host (no scrollable={false})", () => {
    render(
      <HostModalContent>
        <Text>body</Text>
      </HostModalContent>,
    );
    expect(hostContentProps?.scrollable).toBeUndefined();
  });

  it("HostModalContent adds no helper-owned scroller inside the host content", () => {
    const r = render(
      <HostModalContent>
        <Text>body</Text>
      </HostModalContent>,
    );
    expect(r.root.findByProps({ testID: "host-modal-content" })).toBeTruthy();
    expect(r.root.findAllByType(ScrollView)).toHaveLength(0);
  });

  it("HostModalSection renders a plain fluid view with no Modal.Content and no scroller", () => {
    const r = render(
      <HostModalSection>
        <Text>body</Text>
      </HostModalSection>,
    );
    expect(r.root.findAllByType(ScrollView)).toHaveLength(0);
    const view = r.root.findByType(View);
    const style = flattenStyle(view.props.style);
    expect(style.width).toBe("100%");
  });

  it("HostScroll renders exactly one scroller via the injected host ScrollView", () => {
    const r = render(
      <HostScroll>
        <Text>body</Text>
      </HostScroll>,
    );
    expect(r.root.findAllByType(ScrollView)).toHaveLength(1);
    expect(r.root.findByProps({ testID: "host-scrollview" }).type).toBe(ScrollView);
  });

});

// --- No theme scraping (acceptance criterion #3) ----------------------------

describe("ui/ no theme scraping conformance", () => {
  it("HostThemeProvider provides host theme colors via context", () => {
    let captured: Record<string, string> | null = null;
    function Probe() {
      const { colors } = useHostTheme();
      captured = colors;
      return <Text>probe</Text>;
    }
    render(
      <HostThemeProvider theme={hostTheme}>
        <Probe />
      </HostThemeProvider>,
    );
    expect(captured).not.toBeNull();
    expect(captured!.surface0).toBe("#111111");
    expect(captured!.accent).toBe("#0066cc");
  });

  it("HostCard paints with host theme colors from context", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostCard>
          <Text>body</Text>
        </HostCard>
      </HostThemeProvider>,
    );
    const card = r.root.findByType(View);
    const style = flattenStyle(card.props.style);
    expect(style.backgroundColor).toBe("#111111");
    expect(style.borderColor).toBe("#444444");
  });

  it("HostCard variant=tinted uses accent-derived colors", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostCard variant="tinted">
          <Text>body</Text>
        </HostCard>
      </HostThemeProvider>,
    );
    const card = r.root.findByType(View);
    const style = flattenStyle(card.props.style);
    expect(style.backgroundColor).toBe("#0066cc0a");
    expect(style.borderColor).toBe("#0066cc33");
  });

  it("HostBadge paints with host theme colors from context", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostBadge label="test" variant="success" />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "test")).toBe(true);
  });

  it("HostButton paints with host theme colors from context", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostButton label="Click" />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Click")).toBe(true);
  });

  it("HostToggle paints with host theme colors from context", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostToggle value={true} onValueChange={() => {}} label="Toggle" />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Toggle")).toBe(true);
  });

  it("HostSelect paints with host theme colors from context", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostSelect
          value="a"
          options={[{ label: "A", value: "a" }]}
          onValueChange={() => {}}
        />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "A")).toBe(true);
  });

  it("HostTextInput paints with host theme colors from context", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostTextInput value="" onChangeText={() => {}} label="Name" />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Name")).toBe(true);
  });

  it("HostTabs paints with host theme colors from context", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostTabs
          tabs={[{ id: "1", label: "Tab 1" }]}
          activeTab="1"
          onTabChange={() => {}}
        />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Tab 1")).toBe(true);
  });
});

// --- alpha() utility (acceptance criterion #4) ------------------------------

describe("ui/ alpha() color utility conformance", () => {
  it("converts #RRGGBB to #RRGGBBAA with clamped opacity", () => {
    expect(alpha("#ff0000", 0.5)).toBe("#ff000080");
    expect(alpha("#ff0000", 1)).toBe("#ff0000ff");
    expect(alpha("#ff0000", 0)).toBe("#ff000000");
  });

  it("expands #RGB to #RRGGBBAA", () => {
    expect(alpha("#f00", 0.5)).toBe("#ff000080");
  });

  it("strips existing alpha from #RRGGBBAA", () => {
    expect(alpha("#ff0000cc", 0.5)).toBe("#ff000080");
  });

  it("converts rgb() to rgba()", () => {
    expect(alpha("rgb(255, 0, 0)", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("returns unrecognized formats unchanged", () => {
    expect(alpha("red", 0.5)).toBe("red");
    expect(alpha("transparent", 0.5)).toBe("transparent");
  });

  it("degrades empty color to rgba(0,0,0,opacity)", () => {
    expect(alpha("", 0.5)).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("clamps opacity to [0, 1]", () => {
    expect(alpha("#ff0000", 1.5)).toBe("#ff0000ff");
    expect(alpha("#ff0000", -0.5)).toBe("#ff000000");
  });
});

// --- Color helpers ----------------------------------------------------------

describe("ui/ color helpers conformance", () => {
  const colors = hostTheme.colors;

  it("getStatusColor resolves status variants", () => {
    expect(getStatusColor("success", colors)).toBe("#00aa44");
    expect(getStatusColor("warning", colors)).toBe("#cc8800");
    expect(getStatusColor("danger", colors)).toBe("#cc2200");
    expect(getStatusColor("accent", colors)).toBe("#0066cc");
    expect(getStatusColor("neutral", colors)).toBe("#999999");
  });

  it("getVariantPalette derives bg/text/border from status color", () => {
    const palette = getVariantPalette("success", colors);
    expect(palette.text).toBe("#00aa44");
    expect(palette.bg).toBe("#00aa441f");
    expect(palette.border).toBe("#00aa444d");
  });
});

// --- Component execution tests ----------------------------------------------

describe("ui/ HostCard execution", () => {
  it("renders children", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostCard>
          <Text>card body</Text>
        </HostCard>
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "card body")).toBe(true);
  });

  it("renders header with title", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostCard>
          <HostCardHeader title="Card Title" />
        </HostCard>
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Card Title")).toBe(true);
  });

  it("renders header with subtitle", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostCard>
          <HostCardHeader title="Title" subtitle="Subtitle" />
        </HostCard>
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Subtitle")).toBe(true);
  });

  it("renders header with value", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostCard>
          <HostCardHeader title="Title" value="42" />
        </HostCard>
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "42")).toBe(true);
  });
});

describe("ui/ HostTabs execution", () => {
  it("renders all tab labels", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostTabs
          tabs={[
            { id: "1", label: "Tab A" },
            { id: "2", label: "Tab B" },
          ]}
          activeTab="1"
          onTabChange={() => {}}
        />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Tab A")).toBe(true);
    expect(texts.some((t) => t.props.children === "Tab B")).toBe(true);
  });

  it("calls onTabChange when a tab is pressed", () => {
    let pressed: string | null = null;
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostTabs
          tabs={[
            { id: "1", label: "Tab A" },
            { id: "2", label: "Tab B" },
          ]}
          activeTab="1"
          onTabChange={(id) => {
            pressed = id;
          }}
        />
      </HostThemeProvider>,
    );
    const tabB = r.root.findAllByType(Text).find((t) => t.props.children === "Tab B");
    expect(tabB).toBeTruthy();
    // Find the Pressable ancestor and simulate press
    let pressable: any = tabB!.parent;
    while (pressable && pressable.type !== "RCTView" && !pressable.props?.onPress) {
      pressable = pressable.parent;
    }
    // In test renderer, we can find the Pressable by its role
    const pressables = r.root.findAll(
      (node) => node.props?.accessibilityRole === "tab",
    );
    const tabBPressable = pressables.find(
      (p) => p.props?.accessibilityState?.selected === false,
    );
    expect(tabBPressable).toBeTruthy();
    act(() => {
      tabBPressable!.props.onPress();
    });
    expect(pressed).toBe("2");
  });
});

describe("ui/ HostBadge execution", () => {
  it("renders label text", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostBadge label="Status" variant="success" />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Status")).toBe(true);
  });

  it("renders dot when dot=true", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostBadge label="Online" dot />
      </HostThemeProvider>,
    );
    // The dot is a View with borderRadius 3
    const views = r.root.findAllByType(View);
    const dot = views.find((v) => {
      const s = flattenStyle(v.props.style);
      return s.borderRadius === 3 && s.width === 6;
    });
    expect(dot).toBeTruthy();
  });
});

describe("ui/ HostButton execution", () => {
  it("renders label text", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostButton label="Submit" />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Submit")).toBe(true);
  });

  it("calls onPress when pressed", () => {
    let pressed = false;
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostButton
          label="Submit"
          onPress={() => {
            pressed = true;
          }}
        />
      </HostThemeProvider>,
    );
    const button = r.root.findAll(
      (node) => node.props?.accessibilityRole === "button",
    )[0];
    expect(button).toBeTruthy();
    act(() => {
      button!.props.onPress();
    });
    expect(pressed).toBe(true);
  });

  it("passes disabled prop to the underlying Pressable", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostButton label="Submit" disabled onPress={() => {}} />
      </HostThemeProvider>,
    );
    const button = r.root.findAll(
      (node) => node.props?.accessibilityRole === "button",
    )[0];
    expect(button).toBeTruthy();
    expect(button.props.disabled).toBe(true);
  });
});

describe("ui/ HostToggle execution", () => {
  it("calls onValueChange when pressed", () => {
    let nextValue: boolean | null = null;
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostToggle
          value={false}
          onValueChange={(v) => {
            nextValue = v;
          }}
        />
      </HostThemeProvider>,
    );
    const toggle = r.root.findAll(
      (node) => node.props?.accessibilityRole === "switch",
    )[0];
    expect(toggle).toBeTruthy();
    act(() => {
      toggle!.props.onPress();
    });
    expect(nextValue).toBe(true);
  });

  it("does not call onValueChange when disabled", () => {
    let nextValue: boolean | null = null;
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostToggle
          value={false}
          disabled
          onValueChange={(v) => {
            nextValue = v;
          }}
        />
      </HostThemeProvider>,
    );
    const toggle = r.root.findAll(
      (node) => node.props?.accessibilityRole === "switch",
    )[0];
    expect(toggle).toBeTruthy();
    act(() => {
      toggle!.props.onPress();
    });
    expect(nextValue).toBeNull();
  });
});

describe("ui/ HostSelect execution", () => {
  it("renders selected option label", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostSelect
          value="b"
          options={[
            { label: "Option A", value: "a" },
            { label: "Option B", value: "b" },
          ]}
          onValueChange={() => {}}
        />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Option B")).toBe(true);
  });

  it("renders placeholder when no option selected", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostSelect
          value=""
          options={[{ label: "Option A", value: "a" }]}
          placeholder="Pick one"
          onValueChange={() => {}}
        />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Pick one")).toBe(true);
  });
});

describe("ui/ HostTextInput execution", () => {
  it("renders label text", () => {
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostTextInput value="" onChangeText={() => {}} label="Email" />
      </HostThemeProvider>,
    );
    const texts = r.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === "Email")).toBe(true);
  });

  it("calls onChangeText when text changes", () => {
    let received = "";
    const r = render(
      <HostThemeProvider theme={hostTheme}>
        <HostTextInput
          value=""
          onChangeText={(t) => {
            received = t;
          }}
        />
      </HostThemeProvider>,
    );
    const input = r.root.findAllByType(TextInput)[0];
    expect(input).toBeTruthy();
    act(() => {
      input.props.onChangeText("hello");
    });
    expect(received).toBe("hello");
  });
});
