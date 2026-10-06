import { z } from "zod";
import { createPluginLogger } from "paseo-plugin-helper/server";
import { ask } from "./llm.ts";
import { Ledger } from "./ledger.ts";
import { experimentSchema, type Experiment, type Idea } from "../shared/model.ts";
import type { ResearchFeedSettings } from "../shared/settings.ts";

/**
 * MENTOR — the thinking partner the operator discusses a promoted idea with,
 * and who shapes it into a runnable experiment when asked. It does NOT gate
 * anything: queueing (the operator's only gate) is a separate decision. Its
 * memory adapts to what the operator is drawn to and how they think — fed by
 * selections and discussion, not by grades.
 */

const log = createPluginLogger("paseo-research-feed", { subsystem: "mentor" });

export function mentorLedger(settings: ResearchFeedSettings): Ledger {
  return new Ledger("mentor", { budgetTokens: 6000, vendor: settings.vendor });
}

function ideaContext(idea: Idea): string {
  const discussion = idea.discussion.map((turn) => `${turn.role.toUpperCase()}: ${turn.text}`).join("\n");
  return `IDEA: ${idea.title}\nSEED (why it appealed): ${idea.seed}${discussion ? `\nCONVERSATION SO FAR:\n${discussion}` : ""}`;
}

/** Open-ended discussion. Returns the mentor's reply text; caller appends both turns + saves. */
export async function mentorReply(settings: ResearchFeedSettings, idea: Idea, message: string, now: string): Promise<string> {
  const memory = mentorLedger(settings).read();
  const result = await ask({
    vendor: settings.vendor,
    timeoutMs: 200_000,
    system:
      "You are the operator's research thinking partner. Be a sharp, plain-spoken sounding board — " +
      "help them reason about the idea, weigh approaches and cost/benefit, and see how it bears on their " +
      "actual hardware and goals. Do not lecture; provoke good decisions. Relevance lens: " +
      settings.lens +
      (memory ? `\nWhat you know about the operator's interests: ${memory}` : ""),
    prompt: `${ideaContext(idea)}\n\nOPERATOR: ${message}\n\nReply conversationally (a few sentences).`,
  });
  if (!("text" in result)) throw new Error("MENTOR_EXPECTED_TEXT");
  // Adapt to what the operator engages with.
  const ledger = mentorLedger(settings);
  ledger.append(`discussed "${idea.title}": ${message.slice(0, 120)}`, now);
  await ledger.maybeConsolidate({ now });
  return result.text.trim();
}

const experimentReplySchema = z.object({
  hypothesis: z.string().optional(),
  method: z.string().optional(),
  gpuBudgetMin: z.number().optional(),
  successMetric: z.string().optional(),
  frontierClaim: z.string().optional(),
});

/** Shape the idea into a concrete experiment that runs on one consumer GPU in a real time budget. */
export async function shapeExperiment(settings: ResearchFeedSettings, idea: Idea, now: string): Promise<Experiment> {
  const result = await ask({
    vendor: settings.vendor,
    expectJson: true,
    timeoutMs: 240_000,
    system:
      "Turn a discussed idea into a concrete experiment a coding agent can build and run on ONE consumer GPU " +
      "within a real afternoon budget, explicitly measuring how the paper's frontier claim survives on that " +
      "hardware. Relevance lens: " +
      settings.lens,
    prompt:
      `${ideaContext(idea)}\n\nReply JSON: { "hypothesis": "falsifiable, one sentence", ` +
      `"method": "what the coding agent builds and runs on the GPU — concrete enough to execute", "gpuBudgetMin": 120, ` +
      `"successMetric": "the number/threshold that settles it", "frontierClaim": "the claim being reality-checked" }`,
  });
  if (!("data" in result)) throw new Error("MENTOR_SHAPE_PARSE_FAILED: no JSON in reply");
  const parsed = experimentReplySchema.safeParse(result.data);
  if (!parsed.success || !parsed.data.hypothesis || !parsed.data.method) {
    log.warn("experiment reply missing required fields", {});
    throw new Error("MENTOR_SHAPE_PARSE_FAILED: hypothesis and method are required");
  }
  const experiment: Experiment = {
    hypothesis: parsed.data.hypothesis,
    method: parsed.data.method,
    gpuBudgetMin: parsed.data.gpuBudgetMin ?? 120,
    successMetric: parsed.data.successMetric ?? "",
    frontierClaim: parsed.data.frontierClaim ?? "",
    shapedAt: now,
  };
  // Round-trip through the shared schema so drift fails loudly here.
  return experimentSchema.parse(experiment);
}
