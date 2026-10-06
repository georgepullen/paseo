import { z } from "zod";
import { createPluginLogger } from "paseo-plugin-helper/server";
import { ask } from "./llm.ts";
import { Ledger } from "./ledger.ts";
import { fetchCandidates } from "./sources.ts";
import { reelIdFor, type Candidate, type Reel } from "../shared/model.ts";
import type { ResearchFeedSettings } from "../shared/settings.ts";

/**
 * SCOUT — the inspiration curator, decoupled from the idea flow. Its job:
 * turn the day's fetched candidates into jargon-free, lens-tailored REELS.
 * Discovery is BOUNDED: sources.ts deterministically fetches candidates from
 * pinned endpoints; the model only ranks the fixed list and writes cards. It
 * cannot search the open web or invent papers — authoritative metadata comes
 * from our fetch, keyed by candidate id.
 *
 *   rankAndCard()  -> up to feedSize 30-second capture cards (the daily skim)
 *   digestReel()   -> a 10-minute read + open-ended questions, LAZY (on open)
 *   scoutLedger()  -> operator steering notes biasing the next refresh
 */

const log = createPluginLogger("paseo-research-feed", { subsystem: "scout" });

export function scoutLedger(settings: ResearchFeedSettings): Ledger {
  return new Ledger("scout", { budgetTokens: 4000, vendor: settings.vendor });
}

export interface IngestResult {
  reels: Reel[];
  candidates: number;
  errors: string[];
}

interface CardDraft {
  id: string;
  card: { hook?: string; whyItMatters?: string; tags?: string[] };
  relevance?: number;
}

const cardDraftSchema = z.object({
  id: z.string(),
  card: z
    .object({
      hook: z.string().optional(),
      whyItMatters: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  relevance: z.number().optional(),
});
const cardListSchema = z.array(cardDraftSchema);

/**
 * Deterministic fetch from pinned sources, then the model ranks + tailors the
 * fixed list. New reels are stored by the caller (handlers) via the store.
 */
export async function rankAndCard(
  settings: ResearchFeedSettings,
  { now, date }: { now: string; date: string },
): Promise<IngestResult> {
  const { candidates, errors } = await fetchCandidates(settings, {
    perArxivCat: Math.max(10, Math.ceil(settings.feedSize / 2)),
    date,
  });
  if (candidates.length === 0) {
    log.warn("no candidates fetched from pinned sources", { errors: errors.length });
    return { reels: [], candidates: 0, errors };
  }

  const memory = scoutLedger(settings).read();
  const drafts = await askRankedCards(settings, candidates, memory);

  // Stitch cards onto OUR fetched papers — metadata is authoritative, the
  // model cannot fabricate entries it was not handed.
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const cards: Array<{
    source: Candidate["source"];
    candidate: Candidate;
    card: { hook: string; whyItMatters: string; tags: string[] };
    relevance: number;
  }> = [];
  for (const draft of drafts) {
    const candidate = byId.get(draft.id);
    if (!candidate) continue;
    cards.push({
      source: candidate.source,
      candidate,
      card: {
        hook: draft.card?.hook ?? candidate.paper.title,
        whyItMatters: draft.card?.whyItMatters ?? "",
        tags: (draft.card?.tags ?? []).slice(0, 6),
      },
      relevance: draft.relevance ?? fallbackRelevance(candidate),
    });
  }

  const reels = cards.slice(0, settings.feedSize).map((entry, index) => buildReel(entry, index + 1, now, date));
  return { reels, candidates: candidates.length, errors };
}

async function askRankedCards(settings: ResearchFeedSettings, candidates: Candidate[], memory: string): Promise<CardDraft[]> {
  const result = await ask({
    vendor: settings.vendor,
    expectJson: true,
    timeoutMs: 300_000,
    system:
      "You are the inspiration scout. You are handed a FIXED list of candidate papers already fetched from " +
      "trusted sources — work ONLY from what's provided, never look anything else up. Relevance lens: " +
      settings.lens,
    prompt:
      (memory ? `WHAT THE OPERATOR HAS STEERED / ENGAGED WITH (bias toward this):\n${memory}\n\n` : "") +
      `From these ${candidates.length} candidates, pick the ${settings.feedSize} most relevant and write a capture card for each.\n` +
      "Return ONLY a JSON array of up to " + settings.feedSize + " items in a ```json block, each:\n" +
      '{ "id": "<echo the id exactly>", "card": {"hook": "one punchy 30-second sentence", ' +
      '"whyItMatters": "one line on why it matters under the relevance lens", "tags": ["..."]}, "relevance": 0.0-1.0 }\n' +
      "Reference papers ONLY by their given id. Do not invent papers.\n\nCANDIDATES:\n" +
      candidates
        .map((candidate) => `- [${candidate.source}] ${candidate.id} :: ${candidate.paper.title} :: ${candidate.paper.abstract.slice(0, 400)}`)
        .join("\n"),
  });
  if (!("data" in result)) throw new Error("SCOUT_EXPECTED_JSON");
  const parsed = cardListSchema.safeParse(result.data);
  return parsed.success ? parsed.data : [];
}

function fallbackRelevance(candidate: Candidate): number {
  // Upvote-scaled for HF, neutral midpoint otherwise.
  return candidate.upvotes > 0 ? Math.min(1, candidate.upvotes / 100) : 0.5;
}

function buildReel(
  entry: {
    source: Candidate["source"];
    candidate: Candidate;
    card: { hook: string; whyItMatters: string; tags: string[] };
    relevance: number;
  },
  n: number,
  now: string,
  date: string,
): Reel {
  return {
    id: reelIdFor(date, n, entry.candidate.paper.title),
    date,
    source: entry.source,
    title: entry.candidate.paper.title,
    authors: entry.candidate.paper.authors,
    url: entry.candidate.paper.url,
    abstract: entry.candidate.paper.abstract,
    published: entry.candidate.paper.published,
    hook: entry.card.hook,
    whyItMatters: entry.card.whyItMatters,
    tags: entry.card.tags,
    relevance: Math.min(1, Math.max(0, entry.relevance)),
    status: "new",
    digest: null,
    questions: null,
    ideaId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface DigestResult {
  digest: string;
  questions: string[];
}

/** Lazily produce the 10-minute digest + open-ended questions for one reel. */
export async function digestReel(settings: ResearchFeedSettings, reel: Reel): Promise<DigestResult> {
  const result = await ask({
    vendor: settings.vendor,
    expectJson: true,
    timeoutMs: 240_000,
    system:
      "Convert a research paper into a 10-minute, jargon-free read, tailored to the relevance lens. Lens: " +
      settings.lens,
    prompt:
      `PAPER: ${reel.title}\nABSTRACT: ${reel.abstract}\nURL: ${reel.url}\nHOOK: ${reel.hook}\n\n` +
      'Reply JSON: { "digest": "a tight, plain-English 10-min read: core idea, why it works, and what it would ' +
      "mean for a practitioner on a single consumer GPU — no jargon, no equations\", " +
      '"questions": ["3-4 OPEN-ENDED questions to think about and discuss with the agent — provoke judgment and cost/benefit, not recall"] }',
  });
  if (!("data" in result)) throw new Error("SCOUT_DIGEST_PARSE_FAILED: no JSON object in reply");
  const parsed = digestReplySchema.safeParse(result.data);
  if (!parsed.success) throw new Error("SCOUT_DIGEST_PARSE_FAILED: malformed digest JSON");
  return {
    digest: parsed.data.digest ?? "",
    questions: (parsed.data.questions ?? []).slice(0, 4),
  };
}

const digestReplySchema = z.object({
  digest: z.string().optional(),
  questions: z.array(z.string()).optional(),
});
