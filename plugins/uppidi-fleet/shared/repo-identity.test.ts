import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalRepoKey,
  candidateRepoKeys,
  canonicalRepoName,
  compactRepoName,
  normalizeRepoKey,
  repoCoordinates,
  resolveCanonicalRepo,
} from "./repo-identity.js";

const KNOWN = [
  "forge.mrs.uppidi.com/xpufx-org/paseo",
  "forge.mrs.uppidi.com/xpufx-org/agent-mux",
  "forge.mrs.uppidi.com/xpufx-org/2fado",
];

describe("Issue #888: one canonical repo identity", () => {
  it("normalizes raw keys (protocol, scp, port, .git)", () => {
    assert.equal(
      normalizeRepoKey("https://forge.mrs.uppidi.com/xpufx-org/paseo.git"),
      "forge.mrs.uppidi.com/xpufx-org/paseo",
    );
    assert.equal(
      normalizeRepoKey("git@forge.mrs.uppidi.com:xpufx-org/paseo.git"),
      "forge.mrs.uppidi.com/xpufx-org/paseo",
    );
    assert.equal(
      normalizeRepoKey("ssh://git@forge.mrs.uppidi.com:222/xpufx-org/paseo.git"),
      "forge.mrs.uppidi.com/xpufx-org/paseo",
    );
    assert.equal(normalizeRepoKey(""), null);
  });

  it("keeps the existing candidate/canonical key helpers", () => {
    assert.deepEqual(candidateRepoKeys("xpufx-org/paseo"), [
      "xpufx-org/paseo",
      "forge.mrs.uppidi.com/xpufx-org/paseo",
    ]);
    assert.equal(canonicalRepoKey("xpufx-org/paseo"), "forge.mrs.uppidi.com/xpufx-org/paseo");
    assert.equal(
      canonicalRepoKey("https://forge.mrs.uppidi.com/xpufx-org/paseo.git"),
      "forge.mrs.uppidi.com/xpufx-org/paseo",
    );
  });

  it("splits coordinates from any fully-qualified form", () => {
    for (const input of [
      "xpufx-org/paseo",
      "forge.mrs.uppidi.com/xpufx-org/paseo",
      "https://forge.mrs.uppidi.com/xpufx-org/paseo",
      "https://forge.mrs.uppidi.com/xpufx-org/paseo.git",
      "git@forge.mrs.uppidi.com:xpufx-org/paseo.git",
    ]) {
      assert.deepEqual(
        repoCoordinates(input),
        { host: "forge.mrs.uppidi.com", owner: "xpufx-org", repo: "paseo" },
        `${input} must split into coordinates`,
      );
    }
  });

  it("resolves every fully-qualified input form to the same canonical name", () => {
    const expected = "forge.mrs.uppidi.com/xpufx-org/paseo";
    for (const input of [
      "xpufx-org/paseo",
      "forge.mrs.uppidi.com/xpufx-org/paseo",
      "https://forge.mrs.uppidi.com/xpufx-org/paseo",
      "https://forge.mrs.uppidi.com/xpufx-org/paseo.git",
      "git@forge.mrs.uppidi.com:xpufx-org/paseo.git",
      "ssh://git@forge.mrs.uppidi.com:222/xpufx-org/paseo.git",
    ]) {
      const resolved = resolveCanonicalRepo(input, { knownRepos: KNOWN });
      assert.equal(resolved?.key, expected, `${input} must resolve to the canonical name`);
      assert.equal(resolved?.compact, "xpufx-org/paseo");
      assert.equal(canonicalRepoName(input, { knownRepos: KNOWN }), expected);
      assert.equal(compactRepoName(input, { knownRepos: KNOWN }), "xpufx-org/paseo");
    }
  });

  it("resolves a bare repo name to its own canonical repo, never the current repo", () => {
    assert.equal(
      resolveCanonicalRepo("agent-mux", { knownRepos: KNOWN })?.key,
      "forge.mrs.uppidi.com/xpufx-org/agent-mux",
    );
    // A bare name that is not one of the known repos must not be scoped to paseo.
    assert.equal(resolveCanonicalRepo("agent-mux", { knownRepos: ["xpufx-org/paseo"] }), null);
  });

  it("resolves a URL whose path is only a known bare repo name", () => {
    assert.equal(
      resolveCanonicalRepo("https://forge.mrs.uppidi.com/agent-mux", { knownRepos: KNOWN })?.key,
      "forge.mrs.uppidi.com/xpufx-org/agent-mux",
    );
    assert.equal(resolveCanonicalRepo("https://forge.mrs.uppidi.com/agent-mux"), null);
  });

  it("returns null (explicit unknown) for unresolvable input", () => {
    for (const input of [
      "all",
      "",
      "   ",
      "forge.mrs.uppidi.com",
      "https://forge.mrs.uppidi.com",
      null,
      undefined,
    ]) {
      assert.equal(
        resolveCanonicalRepo(input as string | null | undefined, { knownRepos: KNOWN }),
        null,
        `${String(input)} must be unresolvable`,
      );
    }
  });

  it("returns null when a bare name is ambiguous across owners", () => {
    assert.equal(
      resolveCanonicalRepo("agent-mux", {
        knownRepos: ["xpufx-org/agent-mux", "other-org/agent-mux"],
      }),
      null,
    );
  });

  it("keeps non-default hosts intact", () => {
    assert.equal(
      resolveCanonicalRepo("https://github.com/someone/other-repo")?.key,
      "github.com/someone/other-repo",
    );
  });
});
