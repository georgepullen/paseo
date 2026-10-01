import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, "handlers.ts"), "utf8");

/**
 * handlers.ts reaches the vendored helper, whose TypeScript parameter
 * properties Node's strip-only loader rejects, so no test can import it. The
 * #842 wiring is asserted on the source instead — the same pattern
 * chat-enabled.test.ts uses for the daemonEnabled call sites.
 */
describe("unresolvable targets are refused, not dispatched (#842)", () => {
  function probeTargetLifecycle(): string {
    return src.slice(
      src.indexOf("async function probeTargetLifecycle"),
      src.indexOf("function busyGate"),
    );
  }

  it("probeTargetLifecycle throws for an unresolvable registry entry", () => {
    const body = probeTargetLifecycle();
    assert.ok(
      /if \(!entry\) throw new UnresolvableTargetError\(target\.daemon, unknownDaemonMessage\(target\.daemon\)\)/.test(
        body,
      ),
      "an unresolvable registry entry must throw the actionable diagnostic, not return null",
    );
    assert.doesNotMatch(body, /if \(!entry\) return null/, "the registry miss must not collapse into the fail-open null");
  });

  it("keeps the fail-open returns for a failed probe and an unreadable status", () => {
    const body = probeTargetLifecycle();
    // No SDK handle, a throwing probe, and an unreadable lifecycle all return
    // null; the registry miss above is the only throw.
    assert.equal(body.split("return null").length - 1, 3, "exactly the three fail-open cases return null");
    assert.ok(/catch \{\s*return null;?\s*\}/.test(body), "the probe's catch block still returns null");
  });

  it("handleConversationSend refuses an unresolvable target before dispatch", () => {
    const body = src.slice(
      src.indexOf("export async function handleConversationSend"),
      src.indexOf("/** Hold a message whose target is mid-turn"),
    );
    assert.ok(body.includes("cause instanceof UnresolvableTargetError"), "the gate call must catch the error");
    assert.ok(body.includes('delivery: "dropped"'), "the send is refused, not dispatched");
    const refusalAt = body.indexOf('delivery: "dropped"');
    const dispatchAt = body.indexOf("deliverConversationMessage");
    assert.ok(refusalAt > 0 && dispatchAt > refusalAt, "the refusal must precede dispatch");
  });

  it("the drain skips an unresolvable target instead of failing the pass", () => {
    const body = src.slice(
      src.indexOf("export async function drainDeferQueue"),
      src.indexOf("/**\n   * A local agent just went idle"),
    );
    assert.ok(body.includes("cause instanceof UnresolvableTargetError"), "the gate call must catch the error");
    assert.ok(body.includes("continue"), "the target is skipped, not dispatched");
    const catchAt = body.indexOf("cause instanceof UnresolvableTargetError");
    const claimAt = body.indexOf("claimNextDefer");
    assert.ok(catchAt > 0 && claimAt > catchAt, "the skip must precede the claim");
  });
});
