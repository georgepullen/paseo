import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFER_EXPIRY_MS,
  DEFER_MAX_DEPTH_PER_TARGET,
} from "./server/defer-queue.ts";
import { RECIPIENT_INSTRUCTIONS } from "./server/recipient-instructions.ts";
import { AUTH_FIELDS, EnvelopeSchema } from "./shared/envelope.ts";

/**
 * The x-comms guidance that reaches an agent, on all three surfaces, in one
 * place (#709).
 *
 * ## Why one test and three surfaces
 *
 * The same rule — what to do about a busy target — is written down in three
 * shipped places, in three different files, in three different registers:
 *
 *   1. `mcp/paseo-x-comms.mjs`      the MCP server's `INSTRUCTIONS`, which the
 *                                   daemon hands to the client on initialize.
 *   2. `server/recipient-instructions.ts`
 *                                   `RECIPIENT_INSTRUCTIONS`, folded into an
 *                                   agent's `config.systemPrompt`.
 *   3. `skills/recipient-envelope/SKILL.md`
 *                                   the distributable copy of the same
 *                                   contract, for manual installation.
 *
 * #709 is what happens when one of them drifts. The MCP string had been
 * rewritten when the defer queue landed (#598) and said, in as many words, *"Do
 * not call x_comms_wait first to avoid preemption — that is no longer
 * required."* Surfaces 2 and 3 still said *"Before messaging a potentially busy
 * agent, `x_comms_wait`."* Neither transport has a slot for the `instructions`
 * field, so the text that actually reached an agent's system prompt was the
 * stale one: an agent that obeyed it blocked its own turn on every outbound
 * message, to avoid a preemption the queue had already made impossible.
 *
 * `recipient-instructions.test.ts` could not have caught that, and did not try
 * to: it asserts phrases against `RECIPIENT_INSTRUCTIONS` in isolation and never
 * opens the skill. Both files claimed a suite "pins the load-bearing phrases in
 * both", which was true of neither. A contract asserted in prose and enforced
 * nowhere is the actual defect, so this suite enforces it.
 *
 * ## What is pinned, and what is deliberately not
 *
 * The queue is canonical: `defer-queue.ts` is normative and the busy gate in
 * `server/handlers.ts` defers rather than preempts, so a pre-wait cannot change
 * what happens to the message. `x_comms_wait` stays, as the tool for waiting on
 * a *result*. So each surface must state the never-interrupt rule and the queue
 * bounds, must not tell the reader to pre-wait, and must keep pointing at
 * `x_comms_wait` for the thing `x_comms_wait` is for.
 *
 * The bounds are asserted against the exported constants rather than against
 * literals, so changing a bound in `defer-queue.ts` without updating the prose
 * that states it fails here. That link is the point: the constants are the
 * implementation, and three instruction surfaces are the documentation of them.
 *
 * Exact wording is not pinned, deliberately. A test that diffed the surfaces
 * against each other would fail on a harmless rewording and pass on a rewording
 * that inverts the rule, which is the opposite of what a contract test is for.
 * What is pinned is the rule: each surface names it, none of them contradicts
 * it, and no surface may carry the retired advice.
 *
 * ## The second class: field names, checked against the schema
 *
 * #709 is a surface disagreeing with another surface. #713 is worse and is not
 * caught by any surface-to-surface comparison: the MCP instructions told the
 * reader to reply with `daemon=sender.daemon`, and `sender` has no `daemon` —
 * `daemon` is on `target`, and the remote daemon is identified by
 * `sender.daemonServerId`. Every other surface said `daemonServerId`, so a
 * three-way diff would have passed; the two correct surfaces and the one broken
 * one "agree to disagree" only if the comparator is the schema. The reader
 * following the broken one reads `undefined`, and `x_comms_send`'s `daemon` is a
 * required `z.string()`, so the reply fails tool validation before it reaches a
 * handler. Nothing retries it, and the MCP surface — unlike the other two — gave
 * no second daemon value to try: they add `(or sender.host)`, it added nothing.
 *
 * So the last block below pins what a prose rule cannot: every `sender.x` /
 * `target.y` any surface names must be a field `EnvelopeSchema` defines. It is
 * the generalisation of the bug rather than the bug — a rename, a typo, or a
 * field copied off the wrong block all fail identically, on every surface.
 *
 * The MCP surface is read out of the source module rather than by starting a
 * server, for the same reason `protocol.test.mjs` reads `defer-queue.ts` off
 * disk: the string is a template literal, and the bundle that ships it is
 * already guarded byte-for-byte by `bundle-reproducible.test.mjs`, so pinning it
 * here as well would only add a second place for a correct edit to be missed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The MCP server's `INSTRUCTIONS` literal, lifted out of the source module.
 *
 * The template holds no backtick; its one interpolation —
 * `${AUTH_FIELDS.join(", ")}` (#715) — contains neither a backtick nor a `` `; ``
 * of its own, so the first `` `; `` after the opening delimiter still closes the
 * literal. The extracted text therefore shows the interpolation verbatim, which
 * is what the #715 binding below matches. The anchors asserted here exist so a
 * failed extraction fails loudly instead of handing the assertions an empty
 * string.
 */
function readMcpInstructions(): string {
  const source = readFileSync(join(HERE, "mcp", "paseo-x-comms.mjs"), "utf8");
  const open = "const INSTRUCTIONS = `";
  const start = source.indexOf(open);
  assert.notEqual(start, -1, "mcp/paseo-x-comms.mjs no longer declares INSTRUCTIONS");
  const end = source.indexOf("`;", start + open.length);
  assert.notEqual(end, -1, "the INSTRUCTIONS literal is no longer a plain template literal");
  const instructions = source.slice(start + open.length, end);
  assert.match(instructions, /x_comms_send/, "extracted the wrong span out of the MCP module");
  return instructions;
}

function readMcpSource(): string {
  return readFileSync(join(HERE, "mcp", "paseo-x-comms.mjs"), "utf8");
}

function readSkill(): string {
  return readFileSync(join(HERE, "skills", "recipient-envelope", "SKILL.md"), "utf8");
}

const SURFACES = [
  {
    name: "mcp/paseo-x-comms.mjs (INSTRUCTIONS)",
    text: readMcpInstructions(),
    // The MCP string is the one that names the retired advice explicitly, so
    // this is its exact wording rather than a shared shape.
    forbidsPreWait: /Do not call x_comms_wait first to avoid preemption/,
  },
  {
    name: "server/recipient-instructions.ts (RECIPIENT_INSTRUCTIONS)",
    text: RECIPIENT_INSTRUCTIONS,
    forbidsPreWait: /never pre-wait with x_comms_wait to avoid preemption/,
  },
  {
    name: "skills/recipient-envelope/SKILL.md",
    text: readSkill(),
    forbidsPreWait: /\*\*Never pre-wait\.\*\*/,
  },
] as const;

/**
 * The rule, in the one wording all three surfaces are expected to share.
 *
 * The tool-name patterns tolerate a missing `x_comms_` prefix because the MCP
 * surface deliberately drops it: its first line tells the model to "match the
 * tools actually exposed", since a client prefixes the names with its own
 * registration name. That is a difference of register, not of rule, and a
 * contract test must not fail on it.
 */
const SHARED_RULES = [
  { name: "says a send never interrupts a running turn", re: /never interrupts a running turn/i },
  { name: "says a mid-turn target is queued", re: /queue/i },
  { name: "keeps x_comms_wait for waiting on a result", re: /x_comms_wait/ },
  { name: "keeps the permission-stall path", re: /(?:x_comms_)?list_permissions/ },
] as const;

/**
 * The retired advice, in every wording it has shipped in. Each is a phrase that
 * can only be advice to pre-wait: none of them is a substring of a sentence
 * that forbids pre-waiting, which is why a bare `/x_comms_wait first/` match
 * cannot be used here — the MCP string legitimately contains that substring
 * inside its own prohibition.
 */
const RETIRED_ADVICE = [
  { name: "pre-wait before messaging a busy agent", re: /before messaging a (?:potentially )?busy agent/i },
  { name: "pre-wait to avoid preemption", re: /use x_comms_wait first/i },
  { name: "a send is preemptive", re: /x_comms_send is preemptive/i },
  { name: "a target may be busy, so wait first", re: /target may be busy,? (?:use |x_comms_wait )?wait first/i },
] as const;

describe("every agent-facing x-comms surface states the same busy-target rule", () => {
  for (const surface of SURFACES) {
    describe(surface.name, () => {
      for (const rule of SHARED_RULES) {
        it(rule.name, () => {
          assert.match(surface.text, rule.re);
        });
      }

      it("states the queue bounds, and they are the bounds in defer-queue.ts", () => {
        // Spelled out rather than interpolated so a wrong number in the prose
        // cannot be satisfied by a wrong number here.
        assert.match(surface.text, /8 deep per target/);
        assert.match(surface.text, /30[- ]minute window/);
        assert.equal(DEFER_MAX_DEPTH_PER_TARGET, 8, "the depth the prose states");
        assert.equal(DEFER_EXPIRY_MS, 30 * 60 * 1000, "the window the prose states");
      });

      it("forbids pre-waiting, in its own register", () => {
        assert.match(surface.text, surface.forbidsPreWait);
      });

      for (const retired of RETIRED_ADVICE) {
        it(`carries no ${retired.name}`, () => {
          assert.doesNotMatch(surface.text, retired.re);
        });
      }
    });
  }
});

describe("the surfaces cover the same ground, not just the same rule", () => {
  // The contradiction #709 reported was found by reading one surface against
  // another, so the cheap generalisation of that read is pinned here: the load-
  // bearing reply facts every surface states, each asserted on all of them. A
  // surface that stops saying one is no longer mirroring the others.
  const LOAD_BEARING = [
    { name: "x_comms_send", re: /x_comms_send/ },
    { name: "x_comms_list_permissions", re: /(?:x_comms_)?list_permissions/ },
    { name: "x_comms_allow_permission", re: /(?:x_comms_)?allow_permission/ },
    { name: "x_comms_deny_permission", re: /(?:x_comms_)?deny_permission/ },
    { name: "x_comms_add_daemon", re: /(?:x_comms_)?add_daemon/ },
    { name: "sender.agentId", re: /sender\.agentId/ },
  ] as const;

  for (const surface of SURFACES) {
    describe(surface.name, () => {
      for (const fact of LOAD_BEARING) {
        it(`names ${fact.name}`, () => {
          assert.match(
            surface.text,
            fact.re,
            `${surface.name} no longer mentions ${fact.name}, so it has stopped mirroring the others`,
          );
        });
      }
    });
  }
});

/**
 * #715: the signed field set, read from `AUTH_FIELDS`, is what every surface
 * must state.
 *
 * The bug was prose that said the signature covers
 * "the sender/target/messageId/sentAt fields" — a hand-copied 4-field list
 * standing in for the 11-field `AUTH_FIELDS`. The copy was wrong the day it was
 * written and could only drift further, because nothing tied it to the list
 * the signature actually covers.
 *
 * The fix is interpolation, not a copy: RECIPIENT_INSTRUCTIONS and the MCP
 * INSTRUCTIONS both build the sentence from the field list itself, so drift is
 * structurally impossible there. That strength is a testing weakness — a
 * surface that cannot drift also cannot be caught drifting — so the checks
 * below assert what can still be broken:
 *
 *   - the MCP module's JS mirror of AUTH_FIELDS, which cannot be imported
 *     (standalone server, no TypeScript), against the canonical list —
 *     order-sensitive, because payload bytes depend on order;
 *   - the two surfaces' interpolation bindings, since readMcpInstructions()
 *     reads source text and sees `${AUTH_FIELDS.join(", ")}` verbatim rather
 *     than the rendered list; the mirror parity keeps that reference honest;
 *   - SKILL.md, which is prose and stays hand-written, against the canonical
 *     set — by expanding its own globs, not by pinning a second copy;
 *   - the retired claim itself: no surface may state the four-field slash
 *     list, the exact sentence #715 was filed over, whatever else it says.
 */

const MCP_AUTH_FIELDS_MIRROR = /const AUTH_FIELDS = \[\n((?:  "[^"]+",?\n)+)\];/.exec(
  readMcpSource(),
)?.[1];

describe("the MCP JS mirror matches canonical AUTH_FIELDS (#715)", () => {
  it("exists, so this test extracts a real array and always compares fresh data", () => {
    assert.ok(MCP_AUTH_FIELDS_MIRROR, "mcp/paseo-x-comms.mjs no longer declares AUTH_FIELDS");
  });

  it("equals shared/envelope.ts AUTH_FIELDS, in order", () => {
    // Order is part of the contract: canonicalAuthPayload signs one line per
    // field in this order, so a reorder changes every signed payload and a
    // mixed producer/consumer pair then fails verification.
    assert.ok(MCP_AUTH_FIELDS_MIRROR);
    // Each line is a plain double-quoted string literal, so the quoted spans
    // are the entries; no JSON parsing, so a trailing comma or an innocuous
    // reformat cannot crash this — a shape change fails the anchor above.
    const entries = [...MCP_AUTH_FIELDS_MIRROR.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(entries, [...AUTH_FIELDS]);
  });
});

describe("the two interpolated surfaces bind the field list, not a hand-copied set (#715)", () => {
  it("RECIPIENT_INSTRUCTIONS interpolates shared/envelope.ts AUTH_FIELDS", () => {
    const source = readFileSync(join(HERE, "server", "recipient-instructions.ts"), "utf8");
    assert.match(
      source,
      /signature over \$\{AUTH_FIELDS\.join\(", "\)\}/u,
      "the sentence was re-hand-copied; it must come from the canonical list via interpolation",
    );
    assert.ok(
      source.includes('import { AUTH_FIELDS } from "../shared/envelope.ts";'),
      "the interpolation's AUTH_FIELDS import is gone",
    );
  });

  it("RECIPIENT_INSTRUCTIONS renders the canonical list, so a re-copied set diverges loudly", () => {
    // The evaluated string is what lands in an agent's system prompt. It is
    // built from AUTH_FIELDS, so this cannot fail on a canonical rename — the
    // prose re-renders. It fails the moment the sentence stops being built
    // from the list and a hand-copied set goes stale against it.
    assert.ok(
      RECIPIENT_INSTRUCTIONS.includes(AUTH_FIELDS.join(", ")),
      "the rendered instructions no longer state the AUTH_FIELDS set in canonical order",
    );
  });

  it("MCP INSTRUCTIONS interpolates its local mirror, kept honest by the parity test", () => {
    // Matched against the extracted INSTRUCTIONS span, not the whole module,
    // so the binding lives in the string that actually ships to clients. The
    // binding refers to the module's own AUTH_FIELDS mirror; the mirror test
    // above pins that mirror to the canonical source of truth.
    assert.match(
      readMcpInstructions(),
      /signature over \$\{AUTH_FIELDS\.join\(", "\)\}/u,
      "the sentence was re-hand-copied; it must come from the module's AUTH_FIELDS via interpolation",
    );
  });
});

describe("no surface re-ships the retired four-field claim (#715)", () => {
  // The exact drift #715 was filed over: a slash list naming two blocks and
  // two top-level fields as the signed set. Any surface carrying it again is
  // wrong regardless of how the rest of it is worded.
  for (const surface of SURFACES) {
    it(`${surface.name} does not claim only sender/target/messageId/sentAt are signed`, () => {
      assert.doesNotMatch(
        surface.text,
        /sender\/target\/messageId\/sentAt/,
        `${surface.name} states a four-field signed set; the signature covers AUTH_FIELDS (#715)`,
      );
    });
  }
});

describe("SKILL.md states the same signed field set as canonical AUTH_FIELDS (#715)", () => {
  const skill = readSkill();

  /**
   * The skill is the one surface that cannot interpolate, so it is also the one
   * that can drift. Its Verify section groups the set as "`version`, `type`,
   * all `sender.*` and `target.*` fields, `messageId`, and `sentAt`"; that
   * phrasing is accepted as-is rather than rewritten to spell out 11 names.
   * The binding extracts the sentence's backticked tokens, expands its
   * `sender.*`/`target.*` globs against AUTH_FIELDS, and requires the expanded
   * set to equal the canonical list — so a rewritten or stale sentence fails
   * even though each field name also appears elsewhere in the file: the Parse
   * table mentions version, type, messageId, and sentAt no matter what the
   * Verify section says, which is why matching those names anywhere would pin
   * nothing.
   */
  const statedSet = /made over\s+(.+?)\s*\(not over/s.exec(skill)?.[1];

  it("carries a signed-set statement between 'made over' and '(not over'", () => {
    assert.ok(
      statedSet,
      "SKILL.md no longer states what the signature covers between 'made over' and '(not over'",
    );
  });

  it("states the canonical set, its globs expanded against AUTH_FIELDS", () => {
    assert.ok(statedSet);
    const tokens = [...statedSet.matchAll(/`([^`]+)`/g)].map(([, token]) => token);
    const expanded = new Set(tokens.filter((token) => !token.endsWith(".*")));
    for (const glob of tokens.filter((token) => token.endsWith(".*"))) {
      const prefix = glob.slice(0, -1); // `sender.*` -> `sender.`
      for (const field of AUTH_FIELDS) {
        if (field.startsWith(prefix)) expanded.add(field);
      }
    }
    assert.deepEqual(
      [...expanded].sort(),
      [...AUTH_FIELDS].sort(),
      "SKILL.md's stated signed set, globs expanded against AUTH_FIELDS, no longer equals " +
        "AUTH_FIELDS — the skill's sentence and the canonical list have drifted (#715)",
    );
  });
});

/**
 * The two envelope blocks, keyed as the instruction text names them.
 *
 * The schemas are read off `EnvelopeSchema` rather than restated as field-name
 * lists. A hand-copied list is the same class of bug: it would agree with the
 * schema for exactly as long as nobody renamed a field, and the rename is the
 * one change this guard exists to survive. Two surfaces already said
 * `sender.daemonServerId` while the MCP surface said `sender.daemon` — a field
 * that has never existed on the `sender` block, where `daemon` lives on `target`
 * and `daemonServerId` is the only thing identifying the remote daemon at all.
 * An agent following that instruction reads `undefined` and hands it to a
 * required `z.string()`, so the reply dies in tool validation (#713).
 */
const ENVELOPE_BLOCKS = {
  sender: EnvelopeSchema.shape.xComms.shape.sender,
  target: EnvelopeSchema.shape.xComms.shape.target,
} as const;

/**
 * A `sender.x` / `target.y` reference in prose. The dot is required, so a
 * sentence naming the two blocks as a pair with no field — "signature over
 * sender/target... fields" — is not a reference and is not checked.
 */
const ENVELOPE_FIELD_REF = /\b(sender|target)\.([A-Za-z_][A-Za-z0-9_]*)/g;

describe("instruction text names envelope fields the schema actually defines (#713)", () => {
  for (const surface of SURFACES) {
    describe(surface.name, () => {
      it("references no field the envelope schema lacks", () => {
        const refs = [...surface.text.matchAll(ENVELOPE_FIELD_REF)].map(([, block, field]) => ({
          block,
          field,
        }));
        // A rename of the blocks, or a broken extraction, would empty this list
        // and turn the check below into a permanent pass. Fail on the vacuous
        // case instead of trusting it.
        assert.notEqual(
          refs.length,
          0,
          `${surface.name} has no sender.*/target.* references left, so this check is vacuous — ` +
            "the instruction text or the extraction changed shape, not just wording",
        );

        for (const { block, field } of refs) {
          const defined = Object.keys(ENVELOPE_BLOCKS[block as keyof typeof ENVELOPE_BLOCKS].shape);
          assert.ok(
            defined.includes(field),
            `${surface.name} instructs the reader to read ${block}.${field}, which EnvelopeSchema ` +
              `does not define — xComms.${block} has: ${defined.join(", ")}. The schema is the ` +
              "contract; fix the instruction text, not the schema (#713).",
          );
        }
      });
    });
  }
});
