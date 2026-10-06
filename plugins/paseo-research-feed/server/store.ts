import { mkdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PluginStorage } from "paseo-plugin-helper/server";
import { ideaSchema, reelSchema, type Idea, type Reel, type ReelStatus } from "../shared/model.ts";

/**
 * Two decoupled collections in one JSON document under the plugin state dir
 * (~/.paseo/plugin-data/xpufx/paseo-research-feed/), persisted through the
 * helper's atomic PluginStorage — the same mechanism x-comms uses.
 *
 *   REELS — the inspiration feed. Fetched papers ranked into capture cards.
 *     Upstream, many per day. Produces; never decides.
 *   IDEAS — the tracks the operator chooses. Created by promoting a reel.
 *     THERE IS NO GRADED GATE: queueing is the only thing between an idea
 *     and a run.
 *
 * The coupling between the layers is the operator selecting a reel — nothing
 * flows automatically. A fresh storage instance per call keeps paths honest
 * under test HOME sandboxing.
 */

const storeDocSchema = z.object({
  reels: z.array(reelSchema),
  ideas: z.array(ideaSchema),
});
export type StoreDoc = z.infer<typeof storeDocSchema>;

const PLUGIN_ID = "paseo-research-feed";
const STATE_FILENAME = "state.json";

/** The plugin-scoped state dir: ledger files and per-idea run dirs live here too. */
export function pluginStateDir(): string {
  return new PluginStorage(PLUGIN_ID, STATE_FILENAME).pluginDir;
}

export function runsDir(): string {
  return path.join(pluginStateDir(), "runs");
}

export function runDirFor(ideaId: string): string {
  const dir = path.join(runsDir(), ideaId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface ListReelsOptions {
  status?: ReelStatus;
  limit?: number;
}

export class ResearchStore {
  readonly storage: PluginStorage<StoreDoc>;

  constructor() {
    this.storage = new PluginStorage<StoreDoc>(PLUGIN_ID, STATE_FILENAME, {
      defaultData: { reels: [], ideas: [] },
      schema: storeDocSchema,
    });
  }

  private readDoc(): StoreDoc {
    return this.storage.read();
  }

  private writeDoc(doc: StoreDoc): void {
    this.storage.write(doc);
  }

  // ---- REELS ----------------------------------------------------------------

  /** Skim order: most relevant first, newest tiebreak. */
  listReels({ status, limit }: ListReelsOptions = {}): Reel[] {
    let reels = this.readDoc().reels;
    if (status) reels = reels.filter((reel) => reel.status === status);
    reels.sort((a, b) => b.relevance - a.relevance || (a.createdAt < b.createdAt ? 1 : -1));
    return limit !== undefined ? reels.slice(0, limit) : reels;
  }

  getReel(id: string): Reel | null {
    return this.readDoc().reels.find((reel) => reel.id === id) ?? null;
  }

  /**
   * Merge newly fetched cards; stored ids win (a paper already in the feed is
   * never re-inserted). Returns the reels that were actually added.
   */
  upsertReels(incoming: Reel[]): Reel[] {
    const doc = this.readDoc();
    const known = new Set(doc.reels.map((reel) => reel.id));
    const added: Reel[] = [];
    for (const reel of incoming) {
      if (known.has(reel.id)) continue;
      known.add(reel.id);
      doc.reels.push(reel);
      added.push(reel);
    }
    this.writeDoc(doc);
    return added;
  }

  updateReel(id: string, mutate: (reel: Reel) => Reel): Reel | null {
    const doc = this.readDoc();
    const index = doc.reels.findIndex((reel) => reel.id === id);
    if (index < 0) return null;
    const updated = mutate(doc.reels[index]);
    doc.reels[index] = { ...updated, updatedAt: new Date().toISOString() };
    this.writeDoc(doc);
    return doc.reels[index];
  }

  // ---- IDEAS ----------------------------------------------------------------

  /** Most recently updated first. */
  listIdeas(): Idea[] {
    const ideas = this.readDoc().ideas;
    return ideas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  getIdea(id: string): Idea | null {
    return this.readDoc().ideas.find((idea) => idea.id === id) ?? null;
  }

  addIdea(idea: Idea): Idea {
    const doc = this.readDoc();
    doc.ideas.push(idea);
    this.writeDoc(doc);
    return idea;
  }

  updateIdea(id: string, mutate: (idea: Idea) => Idea): Idea | null {
    const doc = this.readDoc();
    const index = doc.ideas.findIndex((idea) => idea.id === id);
    if (index < 0) return null;
    const updated = mutate(doc.ideas[index]);
    doc.ideas[index] = { ...updated, updatedAt: new Date().toISOString() };
    this.writeDoc(doc);
    return doc.ideas[index];
  }
}
