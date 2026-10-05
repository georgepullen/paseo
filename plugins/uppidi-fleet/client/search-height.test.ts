import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getFleetHarness } from "./testing/fleet-harness.js";
import { agentsPayload, installPayloads } from "./testing/fleet-fixtures.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const surface = readFileSync(join(HERE, "surface.tsx"), "utf8");
const tree = readFileSync(join(HERE, "tree-view.tsx"), "utf8");
const bar = readFileSync(join(HERE, "metrics-bar.tsx"), "utf8");
const searchInputSource = readFileSync(join(HERE, "host-ui.tsx"), "utf8");

/**
 * The filter row's search box was taller than the chips and preset buttons it
 * shares a row with, so it set the row height for the whole surface (#645).
 * The operator's follow-ups asked for the box to match the neighbouring pills
 * exactly, and for the same compact look "across the Agents & Fleet tab and
 * the rest of it".
 *
 * Matching by eye is how these rows drifted in the first place, so this pins
 * the compact anatomy: one font-size class, one painted box height, and a real
 * render whose search box is measured against the pills it shares the row with.
 */

describe("search input height matches the filter-row pills (#645)", () => {
  it("opts the fleet filter rows in — without redefining the shared default", () => {
    // The change is opt-in by design: the local kit keeps its original
    // `isCompact ? 36 : 40` default so call sites that do not pass a height
    // render exactly as they did before this fix. The compact 26 — the painted
    // box of a compact ghost size="sm" button — must come from the fleet call
    // sites, not from the shared kit.
    assert.ok(
      /height \?\? \(isCompact \? 36 : 40\)/.test(searchInputSource),
      "SearchInput without height must keep the original isCompact ? 36 : 40 box",
    );
    assert.ok(
      !/height = 26\b/.test(searchInputSource),
      "SearchInput must not ship 26 as the default — the other plugins were never reviewed",
    );
    for (const [name, src] of [["surface", surface], ["tree-view", tree]] as const) {
      const blocks = [...src.matchAll(/<SearchInput([\s\S]*?)\/>/g)];
      assert.ok(blocks.length > 0, `${name} must still render its SearchInput`);
      for (const m of blocks) {
        const height = m[1].match(/height=\{(\d+)\}|height:\s*(\d+)/);
        const heightValue = height ? Number(height[1] ?? height[2]) : undefined;
        assert.ok(
          heightValue === 26,
          `every fleet SearchInput must pass height={26} (the compact pill box) — ${name} has ${heightValue ?? "no height"}`,
        );
        // The opt-in must be the only re-styling: a bare style override here
        // would recreate the drift the shared prop just fixed.
        assert.ok(
          !m[1].includes("style={"),
          `${name} must use the height prop, not a style override, on SearchInput`,
        );
      }
    }
  });

  it("keeps the neighbouring chips and preset buttons in their compact anatomy", () => {
    // If either side grows, the height match below would let the search box
    // grow with it — so the chips themselves are pinned first. The chip
    // anatomy lives in the shared bar both surfaces render.
    for (const token of [
      "fontSize: 11",
      'fontWeight: "700", fontSize: 12',
      "paddingHorizontal: 8",
      "paddingVertical: 3",
      "gap: 5",
    ]) {
      assert.ok(bar.includes(token), `queue chip is missing ${token}`);
    }
    assert.ok(
      surface.includes('size="sm"'),
      "the queue preset buttons must stay size sm",
    );
  });

  it("resolves the rendered fleet search box at the neighbour pill height", async () => {
    const h = await getFleetHarness();
    installPayloads(h.payloads, agentsPayload());

    // 650px is the desktop-class width where the operator inspected the row.
    const { tree: rendered } = await h.renderPanelAtWidth(650, 0);

    function styleOf(node: any): Record<string, unknown> {
      const flatten = (s: unknown): Record<string, unknown> => {
        if (Array.isArray(s)) return Object.assign({}, ...s.map(flatten));
        return s && typeof s === "object" ? { ...s } : {};
      };
      const style = node?.props?.style;
      if (typeof style === "function") {
        return flatten(style({ pressed: false, hovered: false }));
      }
      return flatten(style);
    }

    // The rendered SearchInput container is the row-directed View holding a
    // TextInput; find it by shape the way flex-measure locates children.
    function searchBoxes(node: any): any[] {
      const out: any[] = [];
      const walk = (n: any): void => {
        if (!n || typeof n !== "object") return;
        const kids = (Array.isArray(n.children) ? n.children : []).filter(
          (c: unknown) => c && typeof c === "object",
        );
        if (
          n.type === "View" &&
          styleOf(n).flexDirection === "row" &&
          kids.some((k: any) => k?.type === "TextInput")
        ) {
          out.push(n);
        }
        for (const k of kids) walk(k);
      };
      walk(node);
      return out;
    }

    // The neighbouring pills are SearchInput's row peers: the compact
    // row-directed chips with padding 8/3 that grew this row in the first place.
    function pillBoxes(node: any): any[] {
      const out: any[] = [];
      const walk = (n: any): void => {
        if (!n || typeof n !== "object") return;
        const style = styleOf(n);
        if (
          n.type === "Pressable" &&
          style.flexDirection === "row" &&
          style.paddingHorizontal === 8 &&
          style.paddingVertical === 3
        ) {
          out.push(n);
        }
        for (const k of (Array.isArray(n.children) ? n.children : []).filter(
          (c: unknown) => c && typeof c === "object",
        )) {
          walk(k);
        }
      };
      walk(node);
      return out;
    }

    const boxes = searchBoxes(rendered);
    assert.ok(boxes.length >= 1, "the fleet tab search box must render");
    const pills = pillBoxes(rendered);
    assert.ok(pills.length >= 1, "the fleet chip row must render for comparison");
    // The operator's brief: the box must sit *exactly* at the pill height, not
    // merely somewhere below the old 36-40.
    for (const box of boxes) {
      const height = styleOf(box).height;
      assert.ok(
        typeof height === "number",
        "the search box must declare an explicit height (the pills are content-sized)",
      );
      assert.equal(
        height,
        26,
        `the search box must sit at the compact pill height, saw ${height}`,
      );
    }
  });
});
