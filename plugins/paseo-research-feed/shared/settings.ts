import { z } from "zod";
import { defineSettingsContract } from "paseo-plugin-helper/shared";

/**
 * Settings for the research feed. Everything the pipeline needs is
 * settings-overridable; the defaults are generic and source-pinned:
 *
 * - three public inspiration sources (Hugging Face daily papers, arXiv
 *   newest-by-category Atom, OpenReview notes search), each with a default
 *   endpoint and per-source enable flag;
 * - the relevance lens: plain text steering ranking + tailoring. The default
 *   is deliberately generic — describe what YOU want the feed weighted
 *   toward;
 * - feed sizing (feedSize capture cards per refresh, eagerDigests of the top
 *   cards get their long digest generated immediately, the rest lazily);
 * - the agent vendor + timeout used by every reasoning call (one ACP seam).
 */

export const DEFAULT_HF_ENDPOINT = "https://huggingface.co/api/daily_papers";
export const DEFAULT_ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";
export const DEFAULT_ARXIV_CATEGORIES = "cs.LG, cs.AI, cs.RO, cs.CV";
export const DEFAULT_OPENREVIEW_ENDPOINT = "https://api2.openreview.net/notes";
export const DEFAULT_OPENREVIEW_TERMS =
  "continual learning, weight-space merging, LoRA merging, task vectors, model editing";

/**
 * Generic default relevance lens. Ranking and tailoring prompts fold this in;
 * override it to re-aim the whole feed without touching code.
 */
export const DEFAULT_LENS =
  "Weight toward research a solo practitioner can read, reproduce, and run end-to-end on a " +
  "single consumer GPU: continual learning, parameter-efficient fine-tuning, weight-space " +
  "methods (LoRA merging, task vectors, model editing), memory and on-device learning, and " +
  "small-scale agentic systems. Down-weight giant-cluster-only results and pure benchmark " +
  "papers with no learning-method angle.";

export const AGENT_VENDORS = ["claude", "codex"] as const;
export const agentVendorSchema = z.enum(AGENT_VENDORS);
export type AgentVendor = (typeof AGENT_VENDORS)[number];

export const researchFeedSettingsSchema = z.object({
  hfEnabled: z.boolean().default(true).describe("Hugging Face daily papers"),
  hfEndpoint: z.string().default(DEFAULT_HF_ENDPOINT).describe("Hugging Face daily papers endpoint"),
  arxivEnabled: z.boolean().default(true).describe("arXiv newest-by-category"),
  arxivEndpoint: z.string().default(DEFAULT_ARXIV_ENDPOINT).describe("arXiv Atom query endpoint"),
  arxivCategories: z
    .string()
    .default(DEFAULT_ARXIV_CATEGORIES)
    .describe("arXiv categories, comma-separated"),
  openreviewEnabled: z.boolean().default(true).describe("OpenReview notes search"),
  openreviewEndpoint: z.string().default(DEFAULT_OPENREVIEW_ENDPOINT).describe("OpenReview notes endpoint"),
  openreviewTerms: z
    .string()
    .default(DEFAULT_OPENREVIEW_TERMS)
    .describe("OpenReview search terms, comma-separated"),
  lens: z.string().default(DEFAULT_LENS).describe("Relevance lens steering ranking and tailoring"),
  feedSize: z
    .number()
    .int()
    .min(5)
    .max(200)
    .default(50)
    .describe("Capture cards per refresh"),
  eagerDigests: z
    .number()
    .int()
    .min(0)
    .max(50)
    .default(10)
    .describe("Top-ranked cards that get their digest eagerly; the rest generate on open"),
  vendor: agentVendorSchema.default("claude").describe("ACP agent vendor for every reasoning call"),
  agentTimeoutMs: z
    .number()
    .int()
    .min(15_000)
    .max(1_800_000)
    .default(300_000)
    .describe("Timeout for one agent turn"),
});
export type ResearchFeedSettings = z.infer<typeof researchFeedSettingsSchema>;

/**
 * The settings get/update/reset RPCs. Handlers live in server/settings.ts and
 * register in index.server.ts (demo pattern), so the host's AST-based client
 * compiler can strip server registrations from the client bundle.
 */
export const researchFeedSettings = defineSettingsContract<ResearchFeedSettings>({
  name: "research-feed.settings",
  schema: researchFeedSettingsSchema,
  description: "Research feed sources, lens, sizing, and agent seam",
});

/** "a, b , c" -> ["a", "b", "c"] with empties dropped. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
