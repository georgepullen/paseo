import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ideaIdFor, isRunnable, reelIdFor, slugify, type Idea, type Reel } from "../shared/model.ts";
import { pluginStateDir, ResearchStore } from "../server/store.ts";

/**
 * Store round-trip against a fixture home: every write lands inside the
 * plugin state dir under the sandboxed HOME, and a fresh instance reads the
 * same persisted document back.
 */

function withFixtureHome(run: () => void): void {
  const fakeHome = mkdtempSync(join(tmpdir(), "paseo-research-feed-test-"));
  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    run();
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(fakeHome, { recursive: true, force: true });
  }
}

let seq = 0;

function makeReel(overrides: Partial<Reel> = {}): Reel {
  seq++;
  const now = `2026-07-28T0${seq % 10}:00:00.000Z`;
  return {
    id: `2026-07-28-r${String(seq).padStart(2, "0")}-test-reel-${seq}`,
    date: "2026-07-28",
    source: "arxiv",
    title: `Test reel ${seq}`,
    authors: "A. Author",
    url: `https://arxiv.org/abs/2607.0001${seq}`,
    abstract: "An abstract.",
    published: "2026-07-28",
    hook: `Hook ${seq}.`,
    whyItMatters: "Why it matters.",
    tags: ["continual", "lora"],
    relevance: 0.5,
    status: "new",
    digest: null,
    questions: null,
    ideaId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeIdea(overrides: Partial<Idea> = {}): Idea {
  const now = "2026-07-28T05:00:00.000Z";
  return {
    id: "2026-07-28-i-test-idea",
    fromReel: "2026-07-28-r01-test-reel-1",
    title: "Test idea",
    seed: "seed",
    discussion: [],
    experiment: null,
    execution: null,
    debrief: null,
    stage: "exploring",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("the state dir stays inside the fixture home", () => {
  withFixtureHome(() => {
    const stateDir = pluginStateDir();
    assert.ok(stateDir.startsWith(join(tmpdir(), "paseo-research-feed-test-")), `state dir escaped fixture home: ${stateDir}`);
  });
});

test("reels round-trip: upsert, list in skim order, dedupe by id", () => {
  withFixtureHome(() => {
    const store = new ResearchStore();
    const low = makeReel({ relevance: 0.2, title: "Low relevance" });
    const high = makeReel({ relevance: 0.9, title: "High relevance" });
    const added = store.upsertReels([low, high]);
    assert.deepEqual(
      added.map((reel) => reel.id).sort(),
      [low.id, high.id].sort(),
      "both new reels are reported added",
    );

    // Skim order: most relevant first, newest tiebreak.
    assert.deepEqual(
      store.listReels().map((reel) => reel.id),
      [high.id, low.id],
    );

    // Same-day re-ingest must not duplicate a stored id.
    const addedAgain = store.upsertReels([high, makeReel({ relevance: 0.4, title: "Fresh" })]);
    assert.equal(addedAgain.length, 1, "only the genuinely new reel is added");
    assert.equal(store.listReels().length, 3);

    // A fresh instance reads the same persisted document.
    assert.equal(new ResearchStore().listReels().length, 3);
  });
});

test("reel updates mutate one reel and refresh updatedAt", () => {
  withFixtureHome(() => {
    const store = new ResearchStore();
    const reel = makeReel();
    store.upsertReels([reel]);

    const saved = store.updateReel(reel.id, (current) => ({ ...current, status: "saved" }));
    assert.equal(saved?.status, "saved");
    assert.ok(saved && saved.updatedAt >= reel.updatedAt);

    assert.equal(store.getReel("nope"), null);
    assert.equal(store.updateReel("nope", (current) => current), null);

    // Dismiss survives a fresh instance (round-trip through disk).
    store.updateReel(reel.id, (current) => ({ ...current, status: "dismissed" }));
    assert.equal(new ResearchStore().getReel(reel.id)?.status, "dismissed");
  });
});

test("ideas round-trip: add, list newest-first, update stage", () => {
  withFixtureHome(() => {
    const store = new ResearchStore();
    const first = makeIdea({ id: "2026-07-28-i-first", title: "First", updatedAt: "2026-07-28T01:00:00.000Z" });
    const second = makeIdea({ id: "2026-07-28-i-second", title: "Second", updatedAt: "2026-07-28T02:00:00.000Z" });
    store.addIdea(first);
    store.addIdea(second);

    assert.deepEqual(
      store.listIdeas().map((idea) => idea.id),
      [second.id, first.id],
      "most recently updated first",
    );

    const experiment = {
      hypothesis: "Merging beats sequential fine-tuning on the same budget.",
      method: "Merge two LoRA adapters, evaluate on the held-out split.",
      gpuBudgetMin: 90,
      successMetric: "accuracy delta >= 0",
      frontierClaim: "task vectors compose additively",
      shapedAt: "2026-07-28T03:00:00.000Z",
    };
    const queued = store.updateIdea(first.id, (current) => ({ ...current, experiment, stage: "queued" }));
    assert.ok(queued, "updateIdea returns the updated idea");
    assert.equal(queued.stage, "queued");
    assert.ok(isRunnable(queued));
    assert.ok(!isRunnable(second), "an idea without a shaped experiment never runs");

    const fresh = new ResearchStore();
    assert.equal(fresh.getIdea(first.id)?.experiment?.gpuBudgetMin, 90);
    assert.deepEqual(fresh.listIdeas().map((idea) => idea.id), [first.id, second.id]);
  });
});

test("id helpers produce filesystem-safe stable ids", () => {
  assert.equal(slugify("Hello, World: A Study!"), "hello-world-a-study");
  assert.equal(slugify("###"), "x", "degenerate input still yields a usable slug");
  assert.ok(slugify("x".repeat(200)).length <= 48, "slugs are capped");
  assert.equal(
    reelIdFor("2026-07-28", 7, "Merging Low-Rank Adapters in Weight Space"),
    "2026-07-28-r07-merging-low-rank-adapters-in-weight-space",
  );
  assert.match(ideaIdFor("2026-07-28", "Task Vectors, Revisited"), /^2026-07-28-i-task-vectors-revisited$/);
});
