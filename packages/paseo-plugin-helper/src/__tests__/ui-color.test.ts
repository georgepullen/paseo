import { describe, it, expect } from "vitest";
import { alpha, getStatusColor, getVariantPalette } from "../ui/color.js";
import type { ThemeColors } from "../shared/types.js";

const colors: ThemeColors = {
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
};

describe("ui/color alpha()", () => {
  it("appends an alpha channel to a 6-digit hex color", () => {
    expect(alpha("#3b82f6", 0.5)).toBe("#3b82f680");
  });

  it("expands a 3-digit hex color before appending alpha", () => {
    expect(alpha("#fff", 1)).toBe("#ffffffff");
    expect(alpha("#000", 0)).toBe("#00000000");
  });

  it("replaces the alpha channel of an 8-digit hex color", () => {
    expect(alpha("#3b82f6ff", 0.25)).toBe("#3b82f640");
  });

  it("converts rgb() to rgba() with the given opacity", () => {
    expect(alpha("rgb(59, 130, 246)", 0.5)).toBe("rgba(59, 130, 246, 0.5)");
  });

  it("converts rgba() to rgba() with the given opacity", () => {
    expect(alpha("rgba(59, 130, 246, 0.9)", 0.1)).toBe("rgba(59, 130, 246, 0.1)");
  });

  it("clamps opacity to [0, 1]", () => {
    expect(alpha("#3b82f6", 2)).toBe("#3b82f6ff");
    expect(alpha("#3b82f6", -1)).toBe("#3b82f600");
  });

  it("degrades an empty color to translucent black", () => {
    expect(alpha("", 0.5)).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("returns non-hex/non-rgb colors unchanged", () => {
    expect(alpha("transparent", 0.5)).toBe("transparent");
    expect(alpha("red", 0.5)).toBe("red");
  });
});

describe("ui/color getStatusColor()", () => {
  it("maps each status variant to its host theme color", () => {
    expect(getStatusColor("success", colors)).toBe(colors.statusSuccess);
    expect(getStatusColor("warning", colors)).toBe(colors.statusWarning);
    expect(getStatusColor("danger", colors)).toBe(colors.statusDanger);
    expect(getStatusColor("accent", colors)).toBe(colors.accent);
    expect(getStatusColor("info", colors)).toBe(colors.accent);
    expect(getStatusColor("neutral", colors)).toBe(colors.foregroundMuted);
  });

  it("honors a custom accent override", () => {
    expect(getStatusColor("accent", colors, "#ff0000")).toBe("#ff0000");
  });
});

describe("ui/color getVariantPalette()", () => {
  it("derives bg/text/border from the variant color via alpha", () => {
    const palette = getVariantPalette("success", colors);
    expect(palette.text).toBe(colors.statusSuccess);
    expect(palette.bg).toBe(alpha(colors.statusSuccess, 0.12));
    expect(palette.border).toBe(alpha(colors.statusSuccess, 0.3));
  });
});
