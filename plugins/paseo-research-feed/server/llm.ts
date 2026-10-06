import { createPluginLogger } from "paseo-plugin-helper/server";
import { runAgent } from "./agent-client.ts";
import { errorMessage } from "./errors.ts";
import type { AgentVendor } from "../shared/settings.ts";

/**
 * The reasoning primitive over the single ACP seam. Every "think" call in
 * the plugin — curation, digest writing, discussion, shaping, debriefs —
 * goes through `ask`. It returns plain text, or a parsed JSON value when
 * `expectJson` is set.
 *
 * The clean cost seam: callers don't change if this layer later moves onto a
 * cheap metered model or a local model — swap `ask` internals only.
 */

const log = createPluginLogger("paseo-research-feed", { subsystem: "llm" });

const REASONER_PREAMBLE =
  "You are a reasoning assistant, NOT a coding agent for this task. " +
  "Do NOT create, edit, or run files. Think, then reply in chat only.";

export interface AskOptions {
  vendor: AgentVendor;
  prompt: string;
  /** Extra framing prepended to the prompt. */
  system?: string;
  /** Parse the first JSON value from the reply instead of returning text. */
  expectJson?: boolean;
  timeoutMs?: number;
  onChunk?: (text: string) => void;
}

export interface AskTextResult {
  text: string;
  stopReason: string;
}

export interface AskJsonResult {
  data: unknown;
  text: string;
  stopReason: string;
}

export async function ask(options: AskOptions): Promise<AskTextResult | AskJsonResult> {
  const { vendor, prompt, system = "", expectJson = false, timeoutMs = 240_000, onChunk } = options;
  const framed = [
    REASONER_PREAMBLE,
    system,
    expectJson ? "Reply with ONLY a single JSON value in a ```json fenced block — no prose." : "",
    "",
    prompt,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { text, stopReason } = await runAgent({ vendor, prompt: framed, timeoutMs, onChunk });
    if (!expectJson) return { text, stopReason };
    const parsed = extractJson(text);
    if (parsed === undefined) throw new Error("LLM_JSON_PARSE_FAILED: no JSON found in reply");
    return { data: parsed, text, stopReason };
  } catch (error) {
    log.error("ask failed", { message: errorMessage(error) });
    throw error;
  }
}

/** Pull the first JSON value out of a model reply (fenced block, or first balanced {...} / [...]). */
export function extractJson(text: string): unknown {
  if (!text) return undefined;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: Array<string | null> = [];
  if (fenced) candidates.push(fenced[1]);
  candidates.push(sliceBalanced(text, "{", "}"));
  candidates.push(sliceBalanced(text, "[", "]"));
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate.trim());
    } catch {
      // Try the next candidate shape.
    }
  }
  return undefined;
}

/** The first balanced bracket run, or null when unbalanced / absent. */
function sliceBalanced(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
