import { z } from "zod";
import { createPluginLogger } from "paseo-plugin-helper/server";
import { splitList, type ResearchFeedSettings } from "../shared/settings.ts";
import type { Candidate, ReelSource } from "../shared/model.ts";
import { errorMessage } from "./errors.ts";

/**
 * Deterministic discovery. This module fetches the day's candidate papers
 * from the CONFIGURED source endpoints and returns structured candidates,
 * each with a stable id the scout references. The model never searches the
 * open web for discovery; it only ranks + tailors the fixed list it is
 * handed. That is what keeps the feed bounded instead of freeroam.
 *
 * Security posture: a fetch allowlist is DERIVED from the configured
 * endpoints — only requests to the enabled sources' own hosts are permitted,
 * and every fetch goes through `assertAllowed` + a hard timeout. One failing
 * source (or one failing category/term) never fails the whole refresh.
 */

const log = createPluginLogger("paseo-research-feed", { subsystem: "sources" });

export interface SourceConfig {
  id: ReelSource;
  label: string;
  enabled: boolean;
  /** The only URL this source may fetch. */
  endpoint: string;
  arxivCategories?: string[];
  openreviewTerms?: string[];
  openreviewPerTerm?: number;
}

/** Resolve the three source configs from settings (defaults are source-pinned). */
export function resolveSources(settings: ResearchFeedSettings): SourceConfig[] {
  return [
    {
      id: "hf-daily",
      label: "Hugging Face Daily Papers",
      enabled: settings.hfEnabled,
      endpoint: settings.hfEndpoint,
    },
    {
      id: "arxiv",
      label: "arXiv (most recent by category)",
      enabled: settings.arxivEnabled,
      endpoint: settings.arxivEndpoint,
      arxivCategories: splitList(settings.arxivCategories),
    },
    {
      id: "openreview",
      label: "OpenReview (topic search)",
      enabled: settings.openreviewEnabled,
      endpoint: settings.openreviewEndpoint,
      openreviewTerms: splitList(settings.openreviewTerms),
      openreviewPerTerm: 5,
    },
  ];
}

/** Hostname of an http(s) URL, or null when the URL is unusable for fetching. */
export function hostOf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return parsed.host.toLowerCase();
}

/**
 * The fetch allowlist: the hosts of the configured endpoints of enabled
 * sources, and nothing else. Derived, never hardcoded — repointing a source
 * in settings repoints its allowlist entry too.
 */
export function allowlistFor(sources: SourceConfig[]): Set<string> {
  const hosts = new Set<string>();
  for (const source of sources) {
    if (!source.enabled) continue;
    const host = hostOf(source.endpoint);
    if (host) hosts.add(host);
  }
  return hosts;
}

export class DisallowedEndpointError extends Error {
  constructor(url: string, allowed: string[]) {
    super(`endpoint not on the fetch allowlist (${allowed.join(", ") || "empty"}): ${url}`);
    this.name = "DisallowedEndpointError";
  }
}

/** Guard every fetch: the URL's host must be on the allowlist. */
export function assertAllowed(url: string, allowlist: Set<string>): void {
  const host = hostOf(url);
  if (!host || !allowlist.has(host)) {
    throw new DisallowedEndpointError(url, [...allowlist]);
  }
}

const FETCH_TIMEOUT_MS = 20_000;

/** fetch + JSON with a hard timeout. The caller enforces the allowlist first. */
async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** fetch + text with a hard timeout. The caller enforces the allowlist first. */
async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

const clean = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();

// ---- Hugging Face daily papers ----------------------------------------------

const hfPaperSchema = z.object({
  id: z.string().optional(),
  arxivId: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  authors: z.array(z.union([z.string(), z.object({ name: z.string().optional() })])).optional(),
  upvotes: z.number().optional(),
  url: z.string().optional(),
});

const hfRowSchema = z.object({
  paper: hfPaperSchema.optional(),
  publishedAt: z.string().optional(),
});

async function fetchHfDaily(source: SourceConfig, allowlist: Set<string>, date?: string): Promise<Candidate[]> {
  const suffix = date ? `?date=${encodeURIComponent(date)}` : "";
  assertAllowed(source.endpoint + suffix, allowlist);
  const rows = await fetchJson(source.endpoint + suffix);
  if (!Array.isArray(rows)) return [];
  const out: Candidate[] = [];
  for (const row of rows) {
    // HF nests the paper under `paper`; a flat row is the paper itself.
    const rowParsed = hfRowSchema.parse(row);
    const paper = hfPaperSchema.parse(rowParsed.paper ?? row);
    const id = clean(paper.id ?? paper.arxivId);
    const title = clean(paper.title);
    if (!id || !title) continue;
    const authors = (paper.authors ?? [])
      .map((author) => (typeof author === "string" ? clean(author) : clean(author.name)))
      .filter((author) => author.length > 0)
      .join(", ");
    out.push({
      source: source.id,
      id,
      upvotes: paper.upvotes ?? 0,
      paper: {
        title,
        authors,
        url: `https://arxiv.org/abs/${id}`,
        abstract: clean(paper.summary),
        published: rowParsed.publishedAt ?? null,
      },
    });
  }
  return out;
}

// ---- arXiv Atom -------------------------------------------------------------

function textOfTag(entry: string, tag: string): string {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? clean(match[1]) : "";
}

/**
 * Parse an arXiv Atom feed (dependency-free). Extracted for tests: fixture
 * XML in tests/fixtures/arxiv-atom.xml.
 */
export function parseAtomXml(xml: string): Candidate[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map((match) => match[1])
    .map((entry) => {
      const idField = textOfTag(entry, "id");
      const idRaw = (idField.match(/abs\/(.+)$/) ?? [])[1] ?? idField;
      const id = idRaw.replace(/v\d+$/, "");
      const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)]
        .map((author) => clean(author[1]))
        .join(", ");
      return {
        source: "arxiv" as const,
        id,
        upvotes: 0,
        paper: {
          title: textOfTag(entry, "title"),
          authors,
          url: `https://arxiv.org/abs/${id}`,
          abstract: textOfTag(entry, "summary"),
          published: textOfTag(entry, "published") || null,
        },
      };
    })
    .filter((candidate) => candidate.id.length > 0 && candidate.paper.title.length > 0);
}

async function fetchArxiv(source: SourceConfig, allowlist: Set<string>, perCategory: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const category of source.arxivCategories ?? []) {
    const url =
      `${source.endpoint}?search_query=cat:${encodeURIComponent(category)}` +
      `&sortBy=submittedDate&sortOrder=descending&max_results=${perCategory}`;
    try {
      assertAllowed(url, allowlist);
      out.push(...parseAtomXml(await fetchText(url)));
    } catch (error) {
      log.warn(`[arxiv ${category}] fetch failed`, { message: errorMessage(error) });
    }
  }
  return out;
}

// ---- OpenReview -------------------------------------------------------------

const openreviewNoteSchema = z.object({
  id: z.string().optional(),
  forum: z.string().optional(),
  pdate: z.number().optional(),
  cdate: z.number().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

const openreviewResponseSchema = z.object({
  notes: z.array(openreviewNoteSchema).optional(),
});

/** OpenReview content fields arrive either as plain values or {value} wrappers. */
function contentValue(value: unknown): unknown {
  if (value && typeof value === "object" && "value" in value) {
    return value.value;
  }
  return value;
}

function dayOf(timestamp: unknown): string | null {
  if (typeof timestamp !== "number") return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

async function fetchOpenReview(source: SourceConfig, allowlist: Set<string>): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const term of source.openreviewTerms ?? []) {
    const url =
      `${source.endpoint}/search?term=${encodeURIComponent(term)}` +
      `&limit=${source.openreviewPerTerm ?? 5}&source=forum`;
    try {
      assertAllowed(url, allowlist);
      const payload = openreviewResponseSchema.parse(await fetchJson(url));
      for (const note of payload.notes ?? []) {
        const content = note.content ?? {};
        const title = clean(contentValue(content.title));
        const abstract = clean(contentValue(content.abstract));
        // Keep only paper-like notes.
        if (!title || !abstract) continue;
        const authorsRaw = contentValue(content.authors);
        const authors = Array.isArray(authorsRaw)
          ? authorsRaw.map((author) => clean(author)).filter((author) => author.length > 0).join(", ")
          : clean(authorsRaw);
        const forum = note.forum ?? note.id ?? "";
        out.push({
          source: source.id,
          id: `or:${forum}`,
          upvotes: 0,
          paper: {
            title,
            authors,
            url: `https://openreview.net/forum?id=${forum}`,
            abstract,
            published: dayOf(note.pdate) ?? dayOf(note.cdate),
          },
        });
      }
    } catch (error) {
      log.warn(`[openreview ${term}] failed`, { message: errorMessage(error) });
    }
  }
  return out;
}

export interface FetchOutcome {
  candidates: Candidate[];
  /** One human-readable line per source-level failure; partial failure is tolerated. */
  errors: string[];
}

/**
 * Fetch + dedupe candidates from every enabled source. One source failing
 * (network, timeout, allowlist rejection) is reported in `errors` and never
 * fails the refresh.
 */
export async function fetchCandidates(
  settings: ResearchFeedSettings,
  { perArxivCat = 20, date }: { perArxivCat?: number; date?: string } = {},
): Promise<FetchOutcome> {
  const enabled = resolveSources(settings).filter((source) => source.enabled);
  const allowlist = allowlistFor(enabled);

  const outcomes = await Promise.allSettled(
    enabled.map((source): Promise<Candidate[]> => {
      switch (source.id) {
        case "hf-daily":
          return fetchHfDaily(source, allowlist, date);
        case "arxiv":
          return fetchArxiv(source, allowlist, perArxivCat);
        case "openreview":
          return fetchOpenReview(source, allowlist);
      }
    }),
  );

  const candidates: Candidate[] = [];
  const errors: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled") {
      candidates.push(...outcome.value);
    } else {
      const message = errorMessage(outcome.reason);
      log.warn("[source] failed", { message });
      errors.push(message);
    }
  }

  const seen = new Set<string>();
  const unique: Candidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.id || candidate.paper.title;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return { candidates: unique, errors };
}
