import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Pressable, Text } from "react-native";
import { initClientHelpers } from "../core/host.js";
import { HostCopyButton } from "../ui/controls.js";
import { HostThemeProvider } from "../ui/theme.js";
import { alpha } from "../ui/color.js";
import type { PluginTheme } from "../shared/types.js";

/**
 * Regression coverage for the `ui/` copy pill (xpufx-org/paseo#952).
 *
 * The #847 migration replaced the frozen client/ `CopyButton` (which had
 * size-scaled padding/font, a pressed/hover tint, and copy-on-click feedback)
 * with `HostCopyButton`, but the adapter kept only the icon scale, dimmed the
 * whole control on press, and always rendered a `<Text>` even for the
 * documented icon-only (`label=""`) form. These tests pin the restored
 * contract: small-size styling, a real desktop hover state, and copy-on-click.
 */

const theme: PluginTheme = {
  colors: {
    surface0: "#18181b",
    surface1: "#27272a",
    surface2: "#3f3f46",
    border: "#3f3f46",
    foreground: "#fafafa",
    foregroundMuted: "#a1a1aa",
    accent: "#3b82f6",
    accentForeground: "#ffffff",
    statusSuccess: "#22c55e",
    statusWarning: "#eab308",
    statusDanger: "#ef4444",
  },
};

const copyText = vi.fn(async () => {});
const toastShow = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  copyText.mockClear();
  copyText.mockResolvedValue(undefined);
  toastShow.mockClear();
  initClientHelpers({
    Icon: (props: { name?: string }) => React.createElement("mock-icon", { name: props.name }),
    Modal: Object.assign(() => null, { Content: () => null }),
    useRpc: () => async () => ({}),
    useToast: () => ({ show: toastShow }),
    copyText,
  } as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<HostThemeProvider theme={theme}>{el}</HostThemeProvider>);
  });
  return renderer;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  return (style as Record<string, unknown>) ?? {};
}

function copyPressable(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
  return renderer.root.findByType(Pressable as any);
}

function textOf(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text as any)
    .map((node) => node.props.children)
    .flat()
    .join("");
}

function labelStyle(renderer: TestRenderer.ReactTestRenderer): Record<string, unknown> {
  return flattenStyle(renderer.root.findAllByType(Text as any)[0].props.style);
}

describe("HostCopyButton size and hover (xpufx-org/paseo#952)", () => {
  it("scales padding, font, and radius with size so the small pill stays small", () => {
    const small = flattenStyle(copyPressable(render(<HostCopyButton text="x" size="sm" />)).props.style({ pressed: false }));
    const medium = flattenStyle(copyPressable(render(<HostCopyButton text="x" size="md" />)).props.style({ pressed: false }));

    expect(small.paddingHorizontal).toBe(8);
    expect(small.paddingVertical).toBe(3);
    expect(small.borderRadius).toBe(6);
    expect(medium.paddingHorizontal).toBe(10);
    expect(medium.paddingVertical).toBe(5);
    expect(medium.borderRadius).toBe(8);

    const smallText = labelStyle(render(<HostCopyButton text="x" size="sm" />));
    const mediumText = labelStyle(render(<HostCopyButton text="x" size="md" />));
    expect(smallText.fontSize).toBe(11);
    expect(mediumText.fontSize).toBe(12);
  });

  it("tints the background on hover and on press, not just on press", () => {
    const renderer = render(<HostCopyButton text="x" />);
    const button = copyPressable(renderer);
    const resting = flattenStyle(button.props.style({ pressed: false }));
    expect(resting.backgroundColor).toBe("transparent");
    expect(resting.cursor).toBe("pointer");

    act(() => button.props.onMouseEnter());
    const hovered = flattenStyle(button.props.style({ pressed: false }));
    expect(hovered.backgroundColor).toBe(alpha(theme.colors.surface2, 0.7));

    act(() => button.props.onMouseLeave());
    const pressed = flattenStyle(button.props.style({ pressed: true }));
    expect(pressed.backgroundColor).toBe(alpha(theme.colors.surface2, 0.7));
  });

  it("uses the secondary surface fill and a bolder hover tint for the bordered variant", () => {
    const renderer = render(<HostCopyButton text="x" variant="secondary" />);
    const button = copyPressable(renderer);
    const resting = flattenStyle(button.props.style({ pressed: false }));
    expect(resting.backgroundColor).toBe(theme.colors.surface1);
    expect(resting.borderWidth).toBe(1);

    act(() => button.props.onMouseEnter());
    const hovered = flattenStyle(button.props.style({ pressed: false }));
    expect(hovered.backgroundColor).toBe(alpha(theme.colors.surface2, 1));
  });

  it("does not hover or tint when disabled", () => {
    const renderer = render(<HostCopyButton text="x" disabled />);
    const button = copyPressable(renderer);
    act(() => button.props.onMouseEnter());
    const style = flattenStyle(button.props.style({ pressed: false }));
    expect(style.backgroundColor).toBe("transparent");
    expect(style.opacity).toBe(0.45);
  });
});

describe("HostCopyButton copy-on-click (xpufx-org/paseo#952)", () => {
  it("copies on press and flips Copy -> Check, then reverts after the feedback window", async () => {
    const renderer = render(<HostCopyButton text="hello" feedbackDurationMs={1000} />);
    expect(textOf(renderer)).toBe("Copy");

    await act(async () => {
      await copyPressable(renderer).props.onPress();
    });
    expect(copyText).toHaveBeenCalledWith("hello");
    expect(textOf(renderer)).toBe("Copied!");
    const copiedBackground = flattenStyle(
      copyPressable(renderer).props.style({ pressed: false }),
    ).backgroundColor;
    expect(copiedBackground).toBe("transparent");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(textOf(renderer)).toBe("Copy");
  });

  it("keeps the Check feedback up when pressed again before it reverts", async () => {
    const renderer = render(<HostCopyButton text="hello" feedbackDurationMs={1000} />);
    await act(async () => {
      await copyPressable(renderer).props.onPress();
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    await act(async () => {
      await copyPressable(renderer).props.onPress();
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    // The first timer would have fired at 1000ms; the re-press must reset it.
    expect(textOf(renderer)).toBe("Copied!");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(textOf(renderer)).toBe("Copy");
  });

  it("renders no label text for the icon-only form", () => {
    const renderer = render(<HostCopyButton text="x" label="" copiedLabel="" />);
    expect(renderer.root.findAllByType(Text as any)).toHaveLength(0);
  });
});
