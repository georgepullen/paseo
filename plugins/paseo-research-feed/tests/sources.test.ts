import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allowlistFor,
  assertAllowed,
  DisallowedEndpointError,
  hostOf,
  parseAtomXml,
  resolveSources,
} from "../server/sources.ts";
import { researchFeedSettingsSchema } from "../shared/settings.ts";

/**
 * Source-layer unit tests: the arXiv Atom parser on a small fixture, the
 * settings-derived fetch allowlist, and per-source config resolution. No
 * network access anywhere in this suite.
 */

const FIXTURE = readFileSync(
  join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "arxiv-atom.xml"),
  "utf8",
);

const defaultSettings = researchFeedSettingsSchema.parse({});

test("the atom parser extracts papers, strips versions, drops malformed entries", () => {
  const candidates = parseAtomXml(FIXTURE);
  assert.equal(candidates.length, 2, "the title-less entry is dropped");

  const [merged, taskVectors] = candidates;

  assert.equal(merged.source, "arxiv");
  assert.equal(merged.id, "2607.12345", "the version suffix is stripped from the id");
  assert.equal(merged.paper.title, "Merging Low-Rank Adapters in Weight Space");
  assert.equal(merged.paper.authors, "A. Researcher, B. Writer");
  assert.equal(merged.paper.url, "https://arxiv.org/abs/2607.12345");
  assert.equal(merged.paper.published, "2026-07-26T09:00:00Z");
  assert.match(merged.paper.abstract, /rank-aware merge rule/);

  assert.equal(taskVectors.id, "2607.67890", "an unversioned id passes through unchanged");
  assert.equal(taskVectors.paper.authors, "C. Author");
});

test("an empty or entry-less feed parses to no candidates", () => {
  assert.deepEqual(parseAtomXml("<feed></feed>"), []);
  assert.deepEqual(parseAtomXml(""), []);
});

test("hosts parse from http(s) URLs only", () => {
  assert.equal(hostOf("https://export.arxiv.org/api/query?x=1"), "export.arxiv.org");
  assert.equal(hostOf("http://huggingface.co/api/daily_papers"), "huggingface.co");
  assert.equal(hostOf("ftp://huggingface.co/api"), null, "non-http schemes are unusable");
  assert.equal(hostOf("not a url"), null);
});

test("the allowlist is derived from configured, enabled endpoints only", () => {
  const sources = resolveSources(defaultSettings);
  const allowlist = allowlistFor(sources);
  assert.ok(allowlist.has("huggingface.co"));
  assert.ok(allowlist.has("export.arxiv.org"));
  assert.ok(allowlist.has("api2.openreview.net"));
  assert.equal(allowlist.size, 3, "nothing beyond the configured endpoints");

  const partiallyDisabled = resolveSources(
    researchFeedSettingsSchema.parse({ hfEnabled: false, openreviewEnabled: false }),
  );
  const narrowed = allowlistFor(partiallyDisabled);
  assert.deepEqual([...narrowed], ["export.arxiv.org"], "disabled sources contribute no allowlist entry");
});

test("a non-allowlisted endpoint is rejected", () => {
  const allowlist = allowlistFor(resolveSources(defaultSettings));

  assert.throws(
    () => assertAllowed("https://evil.example.com/exfiltrate", allowlist),
    (error: unknown) => error instanceof DisallowedEndpointError,
    "an off-allowlist https host is rejected",
  );
  assert.throws(
    () => assertAllowed("file:///etc/passwd", allowlist),
    (error: unknown) => error instanceof DisallowedEndpointError,
    "a non-http scheme is rejected",
  );
  assert.throws(
    () => assertAllowed("https://huggingface.co.evil.example.com/api", allowlist),
    (error: unknown) => error instanceof DisallowedEndpointError,
    "a suffix-lookalike host is rejected (exact match, not substring)",
  );

  // The happy path: a configured endpoint passes its own allowlist.
  assert.doesNotThrow(() => assertAllowed("https://export.arxiv.org/api/query?search_query=cat:cs.LG", allowlist));
});

test("repointing a source endpoint repoints its allowlist entry", () => {
  const repointed = researchFeedSettingsSchema.parse({
    arxivEnabled: false,
    hfEnabled: false,
    openreviewEnabled: true,
    openreviewEndpoint: "https://mirror.example.org/notes",
  });
  const allowlist = allowlistFor(resolveSources(repointed));
  assert.deepEqual([...allowlist], ["mirror.example.org"]);
  assert.doesNotThrow(() => assertAllowed("https://mirror.example.org/notes/search?term=merging", allowlist));
  assert.throws(
    () => assertAllowed("https://api2.openreview.net/notes/search", allowlist),
    (error: unknown) => error instanceof DisallowedEndpointError,
  );
});

test("source configs carry the settings-resolved categories and terms", () => {
  const sources = resolveSources(defaultSettings);
  const byId = new Map(sources.map((source) => [source.id, source]));
  assert.deepEqual(byId.get("arxiv")?.arxivCategories, ["cs.LG", "cs.AI", "cs.RO", "cs.CV"]);
  assert.ok((byId.get("openreview")?.openreviewTerms ?? []).includes("task vectors"));
  assert.equal(byId.get("hf-daily")?.endpoint, "https://huggingface.co/api/daily_papers");
});
