import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feedListRpc,
  feedRefreshRpc,
  ideaDiscussRpc,
  ideaPromoteRpc,
  reelActionRpc,
  reelDigestRpc,
  runQueuedRpc,
  STAGE_ORDER,
} from "../shared/registry.ts";
import {
  ideaSchema,
  reelSchema,
  REEL_STATUSES,
  IDEA_STAGES,
} from "../shared/model.ts";
import { researchFeedSettingsSchema, splitList } from "../shared/settings.ts";

/**
 * Wire-contract tests: malformed RPC input must be rejected by the zod
 * schemas before a handler ever runs, and valid payloads must round-trip
 * through the output schemas.
 */

test("feed.list rejects a bogus status and an out-of-range limit", () => {
  assert.throws(() => feedListRpc.input.parse({ status: "bogus" }));
  assert.throws(() => feedListRpc.input.parse({ limit: 0 }));
  assert.throws(() => feedListRpc.input.parse({ limit: 501 }));
  assert.deepEqual(feedListRpc.input.parse({}).status, undefined);
  assert.equal(feedListRpc.input.parse({ status: "saved" }).status, "saved");
  assert.equal(feedListRpc.name, "feed.list");
});

test("reel.action requires a known action and a non-empty reel id", () => {
  assert.throws(() => reelActionRpc.input.parse({ reelId: "r1" }));
  assert.throws(() => reelActionRpc.input.parse({ reelId: "r1", action: "promote" }));
  assert.throws(() => reelActionRpc.input.parse({ reelId: "", action: "save" }));
  assert.throws(() => reelActionRpc.input.parse({ action: "save" }));
  assert.deepEqual(reelActionRpc.input.parse({ reelId: "r1", action: "dismiss" }), {
    reelId: "r1",
    action: "dismiss",
  });
});

test("reel.digest and idea.promote require non-empty ids", () => {
  assert.throws(() => reelDigestRpc.input.parse({ reelId: "" }));
  assert.throws(() => reelDigestRpc.input.parse({}));
  assert.throws(() => ideaPromoteRpc.input.parse({ reelId: "" }));
  assert.deepEqual(ideaPromoteRpc.input.parse({ reelId: "r1" }), { reelId: "r1" });
});

test("idea.discuss requires a message within the size cap", () => {
  assert.throws(() => ideaDiscussRpc.input.parse({ ideaId: "i1" }));
  assert.throws(() => ideaDiscussRpc.input.parse({ ideaId: "i1", message: "" }));
  assert.throws(() => ideaDiscussRpc.input.parse({ ideaId: "i1", message: "x".repeat(8001) }));
  assert.equal(ideaDiscussRpc.input.parse({ ideaId: "i1", message: "why does this hold?" }).message, "why does this hold?");
});

test("run.queued takes an optional idea id and feed.refresh an empty object", () => {
  assert.deepEqual(runQueuedRpc.input.parse({}), {});
  assert.deepEqual(runQueuedRpc.input.parse({ ideaId: "i1" }), { ideaId: "i1" });
  assert.deepEqual(feedRefreshRpc.input.parse({}), {});
});

test("the reel output schema rejects a fabricated payload with a bad source", () => {
  const base = {
    id: "2026-07-28-r01-x",
    date: "2026-07-28",
    source: "arxiv",
    title: "T",
    authors: "A",
    url: "https://arxiv.org/abs/2607.0001",
    abstract: "s",
    published: null,
    hook: "h",
    whyItMatters: "w",
    tags: [],
    relevance: 0.5,
    status: "new",
    digest: null,
    questions: null,
    ideaId: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
  assert.equal(reelSchema.safeParse(base).success, true);
  assert.equal(reelSchema.safeParse({ ...base, source: "reddit" }).success, false, "an unknown source id must not validate");
  assert.equal(reelSchema.safeParse({ ...base, relevance: 7 }).success, false, "relevance is bounded to 0..1");
});

test("the idea output schema rejects an unknown stage", () => {
  const idea = {
    id: "2026-07-28-i-x",
    fromReel: "2026-07-28-r01-x",
    title: "T",
    seed: "s",
    discussion: [],
    experiment: null,
    execution: null,
    debrief: null,
    stage: "exploring",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
  assert.equal(ideaSchema.safeParse(idea).success, true);
  assert.equal(ideaSchema.safeParse({ ...idea, stage: "approved-by-committee" }).success, false);
});

test("stage order and status vocabularies are the pipeline's own", () => {
  assert.deepEqual(STAGE_ORDER, IDEA_STAGES);
  assert.deepEqual([...IDEA_STAGES], ["exploring", "shaped", "queued", "running", "debriefed"]);
  assert.deepEqual([...REEL_STATUSES], ["new", "opened", "saved", "dismissed", "promoted"]);
});

test("settings round-trip with defaults and reject out-of-range numbers", () => {
  const settings = researchFeedSettingsSchema.parse({});
  assert.equal(settings.feedSize, 50);
  assert.equal(settings.eagerDigests, 10);
  assert.equal(settings.vendor, "claude");
  assert.ok(settings.lens.length > 0);
  assert.deepEqual(splitList("a, b ,, c"), ["a", "b", "c"]);
  assert.throws(() => researchFeedSettingsSchema.parse({ feedSize: 1 }));
  assert.throws(() => researchFeedSettingsSchema.parse({ vendor: "gpt" }));
  assert.equal(researchFeedSettingsSchema.parse({ feedSize: 80 }).feedSize, 80);
});
