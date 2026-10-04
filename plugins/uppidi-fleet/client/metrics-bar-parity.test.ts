import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const bar = readFileSync(join(HERE, "metrics-bar.tsx"), "utf8");
const tree = readFileSync(join(HERE, "tree-view.tsx"), "utf8");
const surface = readFileSync(join(HERE, "surface.tsx"), "utf8");

/**
 * The operator rejected the first version of the Agents and Fleet state bar for
 * not *looking* like the work-queue one. Matching by eye is exactly how it
 * drifted in the first place, so the shared values are pinned here against the
 * single shared component, and both surfaces are read to prove they both use it.
 */

const FILL = 'backgroundColor: colors.surface1';

function barStyle(source: string): string {
  const at = source.indexOf(FILL);
  assert.ok(at > -1, "the metrics bar container must exist");
  return source.slice(at - 260, at + 320);
}

describe("fleet state bar matches the work-queue metrics bar (#645)", () => {
  it("uses the same container fill, border, radius and padding", () => {
    const a = barStyle(bar);
    for (const token of [
      FILL,
      "paddingHorizontal: 6",
      "paddingVertical: 4",
      "borderRadius: 6",
      "borderWidth: 1",
      "borderColor: colors.border",
    ]) {
      assert.ok(a.includes(token), `fleet bar is missing ${token}`);
    }
  });

  it("uses the same chip anatomy: icon, muted label, bold count", () => {
    // A Badge is not the same as icon + two Texts. That difference is what the
    // operator pointed at.
    assert.ok(
      !/<Badge[\s\S]{0,200}count === 0 && id === "failed"/.test(bar),
      "the failed chip must not be a Badge",
    );
    for (const token of [
      "<Icon name={chip.icon} size={13}",
      "fontSize: 11",
      'fontWeight: "700", fontSize: 12',
      "paddingHorizontal: 8",
      "paddingVertical: 3",
      "pressedOpacity={0.7}",
    ]) {
      assert.ok(bar.includes(token), `fleet chip is missing ${token}`);
    }
  });

  it("keeps every state filter and every surviving control in the bar", () => {
    for (const id of ["all", "working", "idle", "failed"]) {
      assert.ok(tree.includes(`{ id: "${id}" as const`), `state "${id}" is missing from the bar`);
    }
    assert.ok(tree.includes("onSelect={setStateFilter}"), "the bar chips must drive the filter");
    assert.ok(tree.includes("Collapse All"), "Collapse All must survive");
    assert.ok(tree.includes("handleBulkArchive"), "bulk archive must survive");
    assert.ok(
      /<SearchInput[\s\S]{0,200}value=\{query\}/.test(tree),
      "the search input must still be bound to query",
    );
  });

  it("still hides a zero Failed chip", () => {
    assert.ok(
      /hideZeroIds=\{\["failed"\]\}/.test(tree),
      "a zero Failed chip must stay hidden",
    );
    assert.ok(
      /chip\.count === 0 && hideZeroIds\.includes\(chip\.id\)/.test(bar),
      "the shared bar must drop zero-count hidden chips",
    );
  });

  it("both surfaces render the shared bar", () => {
    assert.ok(
      /<MetricsBar[\s\S]*?onSelect=\{\(id\) => setFilter\(id as IssuePreset\)\}/.test(surface),
      "the Work Queue must render the shared MetricsBar",
    );
    assert.ok(
      /<MetricsBar[\s\S]*?onSelect=\{setStateFilter\}/.test(tree),
      "the Agents & Fleet tree must render the shared MetricsBar",
    );
  });
});
