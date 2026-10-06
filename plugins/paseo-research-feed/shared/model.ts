import { z } from "zod";

/**
 * Shared payload shapes for the research feed. These are plain data
 * descriptions (no node builtins, no server imports) so both the daemon
 * server and the client bundle can validate against them.
 *
 * The two collections mirror the human-gated pipeline this plugin ports:
 *
 *   REELS — the inspiration feed. Public papers fetched from pinned sources,
 *     ranked into 30-second capture cards. Upstream, many per day. Produces;
 *     never decides.
 *   IDEAS — the tracks the operator chooses. Created by promoting a reel,
 *     discussed, shaped into an experiment, queued, run. The operator's
 *     queue action is the ONLY gate between an idea and a run.
 */

export const REEL_STATUSES = ["new", "opened", "saved", "dismissed", "promoted"] as const;
export const reelStatusSchema = z.enum(REEL_STATUSES);
export type ReelStatus = (typeof REEL_STATUSES)[number];

export const IDEA_STAGES = ["exploring", "shaped", "queued", "running", "debriefed"] as const;
export const ideaStageSchema = z.enum(IDEA_STAGES);
export type IdeaStage = (typeof IDEA_STAGES)[number];

/** Where a candidate came from. Source ids are stable settings keys. */
export const REEL_SOURCES = ["hf-daily", "arxiv", "openreview"] as const;
export const reelSourceSchema = z.enum(REEL_SOURCES);
export type ReelSource = (typeof REEL_SOURCES)[number];

export const discussionTurnSchema = z.object({
  role: z.enum(["operator", "mentor"]),
  text: z.string(),
  at: z.string(),
});
export type DiscussionTurn = z.infer<typeof discussionTurnSchema>;

export const experimentSchema = z.object({
  hypothesis: z.string(),
  method: z.string(),
  gpuBudgetMin: z.number(),
  successMetric: z.string(),
  frontierClaim: z.string(),
  shapedAt: z.string(),
});
export type Experiment = z.infer<typeof experimentSchema>;

export const executionSchema = z.object({
  dispatchedAt: z.string(),
  vendor: z.string(),
  cwd: z.string(),
  resultText: z.string(),
  stopReason: z.string(),
  artifacts: z.array(z.string()),
  finishedAt: z.string().nullable(),
});
export type Execution = z.infer<typeof executionSchema>;

export const debriefSchema = z.object({
  whatHappened: z.string(),
  frontierVsReality: z.string(),
  next: z.string(),
  at: z.string(),
});
export type Debrief = z.infer<typeof debriefSchema>;

/** A capture card: the 30-second skim unit. Digest + questions are lazy. */
export const reelSchema = z.object({
  id: z.string(),
  date: z.string(),
  source: reelSourceSchema,
  title: z.string(),
  authors: z.string(),
  url: z.string(),
  abstract: z.string(),
  published: z.string().nullable(),
  /** One punchy sentence. */
  hook: z.string(),
  /** One line on why it matters under the configured relevance lens. */
  whyItMatters: z.string(),
  tags: z.array(z.string()),
  /** 0..1 ranking for the skim. */
  relevance: z.number().min(0).max(1),
  status: reelStatusSchema,
  /** The 10-minute read. Generated lazily on open, eagerly for the top slice. */
  digest: z.object({ text: z.string(), at: z.string() }).nullable(),
  /** Open-ended discussion prompts. Generated with the digest. */
  questions: z.array(z.string()).nullable(),
  ideaId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Reel = z.infer<typeof reelSchema>;

/** An idea track. Multiple alive at once; the operator decides what runs. */
export const ideaSchema = z.object({
  id: z.string(),
  fromReel: z.string(),
  title: z.string(),
  seed: z.string(),
  discussion: z.array(discussionTurnSchema),
  experiment: experimentSchema.nullable(),
  execution: executionSchema.nullable(),
  debrief: debriefSchema.nullable(),
  stage: ideaStageSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Idea = z.infer<typeof ideaSchema>;

/** An idea runs only because the operator shaped it AND queued it. */
export function isRunnable(idea: Idea): boolean {
  return Boolean(idea && idea.stage === "queued" && idea.experiment?.method);
}

/** Candidate a source fetcher hands to the scout. Authoritative metadata. */
export const candidateSchema = z.object({
  source: reelSourceSchema,
  id: z.string(),
  upvotes: z.number(),
  paper: z.object({
    title: z.string(),
    authors: z.string(),
    url: z.string(),
    abstract: z.string(),
    published: z.string().nullable(),
  }),
});
export type Candidate = z.infer<typeof candidateSchema>;

/** Stable, filesystem-safe entity id: <date>-r01-<slug> / <date>-i-<slug>. */
export function slugify(text: string): string {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "x";
}

export function reelIdFor(date: string, n: number, title: string): string {
  return `${date}-r${String(n).padStart(2, "0")}-${slugify(title)}`;
}

export function ideaIdFor(date: string, title: string): string {
  return `${date}-i-${slugify(title)}`;
}
