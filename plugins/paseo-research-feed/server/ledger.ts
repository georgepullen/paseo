import fs from "node:fs";
import path from "node:path";
import { ask } from "./llm.ts";
import { pluginStateDir } from "./store.ts";
import type { AgentVendor } from "../shared/settings.ts";

/**
 * Append-then-consolidate agent memory. The scouts' and mentor's long-lived
 * ledgers must NOT grow unbounded: they append one dated line per event, and
 * when the file exceeds a token budget it is CONSOLIDATED back under budget
 * (merge duplicates, drop the superseded, keep durable lessons + evolving
 * interests).
 */

/** Cheap, dependency-free token estimate (~4 chars/token). Good enough to budget. */
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? "").length / 4);
}

export interface LedgerOptions {
  /** Stored as <dir>/<name>.ledger.md; defaults to the plugin state dir. */
  dir?: string;
  budgetTokens?: number;
  vendor?: AgentVendor;
}

export class Ledger {
  readonly file: string;
  readonly budgetTokens: number;
  readonly vendor: AgentVendor;
  readonly name: string;

  constructor(name: string, options: LedgerOptions = {}) {
    this.name = name;
    this.file = path.join(options.dir ?? pluginStateDir(), `${name}.ledger.md`);
    this.budgetTokens = options.budgetTokens ?? 4000;
    this.vendor = options.vendor ?? "claude";
  }

  read(): string {
    try {
      return fs.readFileSync(this.file, "utf8");
    } catch {
      return "";
    }
  }

  tokens(): number {
    return estimateTokens(this.read());
  }

  /** Append one dated entry. `now` is supplied by the caller (pure/testable). */
  append(entry: string, now: string): void {
    const head = fs.existsSync(this.file) ? "" : `# ${this.name} — agent memory ledger\n\n`;
    const line = `- [${now}] ${String(entry).replace(/\n+/g, " ").trim()}\n`;
    fs.appendFileSync(this.file, head + line);
  }

  /**
   * If over budget, ask the model to consolidate the ledger back under
   * budget. Returns {consolidated, before, after}.
   */
  async maybeConsolidate({ now }: { now: string } = { now: new Date().toISOString() }): Promise<{
    consolidated: boolean;
    before: number;
    after: number;
  }> {
    const before = this.tokens();
    if (before <= this.budgetTokens) return { consolidated: false, before, after: before };
    const current = this.read();
    try {
      const result = await ask({
        vendor: this.vendor,
        system:
          `The following is an AI agent's long-lived memory ledger named "${this.name}". ` +
          `It has exceeded its token budget of ~${this.budgetTokens} tokens and must be rewritten more compactly.`,
        prompt:
          `Rewrite this ledger to well under ~${this.budgetTokens} tokens. Rules:\n` +
          "- MERGE duplicate or overlapping notes into single durable statements.\n" +
          "- DROP anything stale, one-off, or superseded by a later note.\n" +
          "- KEEP: durable lessons and the operator's evolving interests/preferences (these are the point of this ledger).\n" +
          "- Preserve chronology only where it matters; prefer a tight thematic summary over a raw log.\n" +
          "- Output ONLY the rewritten markdown ledger, no preamble.\n\n" +
          `--- CURRENT LEDGER ---\n${current}`,
        timeoutMs: 240_000,
      });
      if (!("text" in result)) throw new Error("consolidation expected a text reply");
      const rewritten = `# ${this.name} — agent memory ledger (consolidated ${now})\n\n${result.text.trim()}\n`;
      fs.writeFileSync(this.file, rewritten);
      return { consolidated: true, before, after: estimateTokens(rewritten) };
    } catch {
      // Consolidation is best-effort: an overloaded agent must never lose the ledger.
      return { consolidated: false, before, after: before };
    }
  }
}
