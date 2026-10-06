import { createPluginLogger } from "paseo-plugin-helper/server";
import { ideaIdFor, type Idea, type Reel } from "../shared/model.ts";
import { digestReel, rankAndCard } from "./scout.ts";
import { mentorReply, shapeExperiment } from "./mentor.ts";
import { runQueuedIdeas } from "./runs.ts";
import { currentSettings } from "./settings.ts";
import { ResearchStore } from "./store.ts";
import { errorMessage } from "./errors.ts";

/**
 * RPC handlers wiring sources → scout → store → mentor → runs. A fresh store
 * instance per call keeps paths honest under test HOME sandboxing.
 */

const log = createPluginLogger("paseo-research-feed", { subsystem: "handlers" });

function store(): ResearchStore {
  return new ResearchStore();
}

function requireReel(reel: Reel | null, id: string): Reel {
  if (!reel) throw new Error(`no such reel: ${id}`);
  return reel;
}

function requireIdea(idea: Idea | null, id: string): Idea {
  if (!idea) throw new Error(`no such idea: ${id}`);
  return idea;
}

// ---- feed -------------------------------------------------------------------

export async function handleFeedRefresh() {
  const settings = await currentSettings();
  const now = new Date().toISOString();
  const errors: string[] = [];

  const { reels, candidates, errors: fetchErrors } = await rankAndCard(settings, {
    now,
    date: now.slice(0, 10),
  });
  errors.push(...fetchErrors);

  const added = store().upsertReels(reels);

  // The top eager slice gets its 10-minute digest now; the rest stay lazy.
  let eagerDigests = 0;
  for (const reel of added.slice(0, settings.eagerDigests)) {
    try {
      const digest = await digestReel(settings, reel);
      store().updateReel(reel.id, (current) => ({
        ...current,
        digest: { text: digest.digest, at: new Date().toISOString() },
        questions: digest.questions,
      }));
      eagerDigests++;
    } catch (error) {
      errors.push(`digest ${reel.id}: ${errorMessage(error)}`);
    }
  }

  log.info("feed refreshed", { candidates, added: added.length, eagerDigests });
  return {
    candidates,
    reels: store().listReels({ limit: settings.feedSize }),
    eagerDigests,
    errors,
  };
}

export async function handleFeedList(input: { status?: Reel["status"]; limit?: number }) {
  return { reels: store().listReels({ status: input.status, limit: input.limit }) };
}

export async function handleReelDigest(input: { reelId: string }) {
  const settings = await currentSettings();
  const existing = requireReel(store().getReel(input.reelId), input.reelId);
  if (!existing.digest) {
    const digest = await digestReel(settings, existing);
    store().updateReel(existing.id, (current) => ({
      ...current,
      status: current.status === "new" ? "opened" : current.status,
      digest: { text: digest.digest, at: new Date().toISOString() },
      questions: digest.questions,
    }));
  }
  return { reel: requireReel(store().getReel(input.reelId), input.reelId) };
}

export async function handleReelAction(input: { reelId: string; action: "save" | "dismiss" }) {
  const updated = store().updateReel(input.reelId, (current) => {
    if (input.action === "dismiss") return { ...current, status: "dismissed" };
    // A promoted reel stays promoted; saving never demotes it.
    if (current.status === "promoted") return current;
    return { ...current, status: "saved" };
  });
  return { reel: requireReel(updated, input.reelId) };
}

// ---- ideas ------------------------------------------------------------------

export async function handleIdeaList() {
  return { ideas: store().listIdeas() };
}

export async function handleIdeaPromote(input: { reelId: string; seed?: string }) {
  const reel = requireReel(store().getReel(input.reelId), input.reelId);
  const now = new Date().toISOString();
  const idea: Idea = {
    id: ideaIdFor(now.slice(0, 10), reel.title),
    fromReel: reel.id,
    title: reel.title,
    seed: input.seed?.trim() || reel.whyItMatters,
    discussion: [],
    experiment: null,
    execution: null,
    debrief: null,
    stage: "exploring",
    createdAt: now,
    updatedAt: now,
  };
  store().addIdea(idea);
  store().updateReel(reel.id, (current) => ({ ...current, status: "promoted", ideaId: idea.id }));
  return { idea };
}

export async function handleIdeaDiscuss(input: { ideaId: string; message: string }) {
  const settings = await currentSettings();
  const idea = requireIdea(store().getIdea(input.ideaId), input.ideaId);
  const now = new Date().toISOString();
  const reply = await mentorReply(settings, idea, input.message, now);
  const updated = store().updateIdea(idea.id, (current) => ({
    ...current,
    discussion: [
      ...current.discussion,
      { role: "operator", text: input.message, at: now },
      { role: "mentor", text: reply, at: new Date().toISOString() },
    ],
  }));
  return { idea: requireIdea(updated, input.ideaId), reply };
}

export async function handleIdeaShape(input: { ideaId: string }) {
  const settings = await currentSettings();
  const idea = requireIdea(store().getIdea(input.ideaId), input.ideaId);
  const experiment = await shapeExperiment(settings, idea, new Date().toISOString());
  const updated = store().updateIdea(idea.id, (current) => ({ ...current, experiment, stage: "shaped" }));
  return { idea: requireIdea(updated, input.ideaId) };
}

export async function handleIdeaQueue(input: { ideaId: string }) {
  const idea = requireIdea(store().getIdea(input.ideaId), input.ideaId);
  if (!idea.experiment?.method) throw new Error("shape an experiment first");
  const updated = store().updateIdea(idea.id, (current) => ({ ...current, stage: "queued" }));
  return { idea: requireIdea(updated, input.ideaId) };
}

// ---- runs -------------------------------------------------------------------

export async function handleRunQueued(input: { ideaId?: string }) {
  const settings = await currentSettings();
  const runs = await runQueuedIdeas(settings, store(), { ideaId: input.ideaId });
  return { runs };
}
