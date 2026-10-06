import { readdirSync } from "node:fs";
import { z } from "zod";
import { createPluginLogger } from "paseo-plugin-helper/server";
import { isRunnable, type Idea } from "../shared/model.ts";
import type { ResearchFeedSettings } from "../shared/settings.ts";
import { runAgent } from "./agent-client.ts";
import { errorMessage } from "./errors.ts";
import { ask } from "./llm.ts";
import { scoutLedger } from "./scout.ts";
import { runDirFor, type ResearchStore } from "./store.ts";

/**
 * RUN QUEUED — the execution half of the pipeline. No grading: an idea runs
 * only because the operator shaped it into an experiment and queued it.
 * Each queued idea executes in its own per-idea workspace directory under
 * the plugin state dir, then is debriefed; the debrief nudges the next feed
 * via the scout's ledger.
 *
 * SCOPE: execution happens on the daemon host. Remote-GPU dispatch is out of
 * scope for this plugin.
 */

const log = createPluginLogger("paseo-research-feed", { subsystem: "runs" });

export interface RunOutcome {
  ideaId: string;
  ok: boolean;
  error: string | null;
}

const debriefReplySchema = z.object({
  whatHappened: z.string().optional(),
  frontierVsReality: z.string().optional(),
  next: z.string().optional(),
});

/** Run every queued idea (or one specific idea), then debrief. Never throws per-idea. */
export async function runQueuedIdeas(
  settings: ResearchFeedSettings,
  store: ResearchStore,
  { ideaId }: { ideaId?: string },
): Promise<RunOutcome[]> {
  const candidates = ideaId ? [store.getIdea(ideaId)].filter((idea): idea is Idea => idea !== null) : store.listIdeas();
  const queued = candidates.filter(isRunnable);
  if (queued.length === 0) return [];

  const outcomes: RunOutcome[] = [];
  for (const idea of queued) {
    outcomes.push(await runOne(settings, store, idea));
  }
  return outcomes;
}

async function runOne(settings: ResearchFeedSettings, store: ResearchStore, idea: Idea): Promise<RunOutcome> {
  const now = new Date().toISOString();
  const experiment = idea.experiment!;
  const dir = runDirFor(idea.id);
  const budgetMinutes = Math.max(1, Math.floor(experiment.gpuBudgetMin || 90));
  // A run is never allowed to outlive its configured ceiling either.
  const timeoutMs = Math.min(Math.max(settings.agentTimeoutMs, budgetMinutes * 60_000), 3_600_000);

  store.updateIdea(idea.id, (current) => ({
    ...current,
    stage: "running",
    execution: {
      dispatchedAt: now,
      vendor: settings.vendor,
      cwd: dir,
      resultText: "",
      stopReason: "",
      artifacts: [],
      finishedAt: null,
    },
  }));

  log.info("executing queued idea", { ideaId: idea.id, budgetMinutes, dir });

  const prompt = [
    `Run this experiment end-to-end in THIS directory within ~${budgetMinutes} minutes of compute.`,
    "",
    `HYPOTHESIS: ${experiment.hypothesis}`,
    `METHOD: ${experiment.method}`,
    `SUCCESS METRIC: ${experiment.successMetric}`,
    `FRONTIER CLAIM TO REALITY-CHECK ON A CONSUMER GPU: ${experiment.frontierClaim}`,
    "",
    "Build the minimal code, run it, and report the measured number vs the metric, " +
      "and whether the frontier claim held on this hardware.",
  ].join("\n");

  let resultText = "";
  let stopReason = "";
  try {
    const run = await runAgent({ vendor: settings.vendor, prompt, cwd: dir, timeoutMs });
    resultText = run.text;
    stopReason = run.stopReason;
  } catch (error) {
    const message = errorMessage(error);
    log.error("queued run failed", { ideaId: idea.id, message });
    store.updateIdea(idea.id, (current) => ({
      ...current,
      stage: "queued",
      execution: current.execution
        ? { ...current.execution, resultText: message, stopReason: "error", finishedAt: new Date().toISOString() }
        : current.execution,
    }));
    return { ideaId: idea.id, ok: false, error: message };
  }

  const finishedAt = new Date().toISOString();
  let artifacts: string[] = [];
  try {
    artifacts = readdirSync(dir).filter((name) => !name.startsWith("."));
  } catch {
    artifacts = [];
  }

  store.updateIdea(idea.id, (current) => ({
    ...current,
    execution: current.execution
      ? { ...current.execution, resultText, stopReason, finishedAt, artifacts }
      : current.execution,
  }));

  const debrief = await debriefRun(settings, experiment, resultText, finishedAt);
  store.updateIdea(idea.id, (current) => ({ ...current, stage: "debriefed", debrief }));

  // Nudge the next feed toward what actually got run + found.
  const ledger = scoutLedger(settings);
  ledger.append(`ran "${idea.title}": ${debrief.whatHappened} | next: ${debrief.next}`, finishedAt);
  await ledger.maybeConsolidate({ now: finishedAt });

  log.info("queued idea debriefed", { ideaId: idea.id });
  return { ideaId: idea.id, ok: true, error: null };
}

async function debriefRun(
  settings: ResearchFeedSettings,
  experiment: NonNullable<Idea["experiment"]>,
  resultText: string,
  at: string,
): Promise<NonNullable<Idea["debrief"]>> {
  try {
    const result = await ask({
      vendor: settings.vendor,
      expectJson: true,
      timeoutMs: 180_000,
      system: "Debrief this research run for the operator, who will curate the next feed from it. Be honest about what the numbers showed.",
      prompt:
        `EXPERIMENT: ${experiment.method}\nRESULT:\n${resultText.slice(0, 8000)}\n\n` +
        'Reply JSON: { "whatHappened": "...", "frontierVsReality": "did the claim survive on consumer hardware? by how much?", "next": "the natural next question" }',
    });
    if ("data" in result) {
      const parsed = debriefReplySchema.safeParse(result.data);
      if (parsed.success) {
        return {
          whatHappened: parsed.data.whatHappened ?? "run completed",
          frontierVsReality: parsed.data.frontierVsReality ?? "?",
          next: parsed.data.next ?? "?",
          at,
        };
      }
    }
    throw new Error("malformed debrief JSON");
  } catch (error) {
    return { whatHappened: `debrief failed: ${errorMessage(error)}`, frontierVsReality: "?", next: "?", at };
  }
}
