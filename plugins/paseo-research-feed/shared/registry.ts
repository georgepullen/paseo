import { defineRpc } from "paseo-plugin-helper/shared";
import { z } from "zod";
import {
  ideaSchema,
  ideaStageSchema,
  reelSchema,
  reelStatusSchema,
} from "./model.ts";

/**
 * The plugin's RPC vocabulary. Handlers live in server/handlers.ts +
 * server/settings.ts and are registered in index.server.ts. Settings live in
 * the researchFeedSettings contract (shared/settings.ts): get / update /
 * reset.
 */

const emptyInput = z.object({});

export const feedRefreshRpc = defineRpc({
  name: "feed.refresh",
  input: emptyInput,
  output: z.object({
    candidates: z.number(),
    reels: z.array(reelSchema),
    eagerDigests: z.number(),
    errors: z.array(z.string()),
  }),
});

export const feedListRpc = defineRpc({
  name: "feed.list",
  input: z.object({
    status: reelStatusSchema.optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  output: z.object({
    reels: z.array(reelSchema),
  }),
});

export const reelDigestRpc = defineRpc({
  name: "reel.digest",
  input: z.object({
    reelId: z.string().min(1),
  }),
  output: z.object({
    reel: reelSchema,
  }),
});

export const reelActionRpc = defineRpc({
  name: "reel.action",
  input: z.object({
    reelId: z.string().min(1),
    action: z.enum(["save", "dismiss"]),
  }),
  output: z.object({
    reel: reelSchema,
  }),
});

export const ideaListRpc = defineRpc({
  name: "idea.list",
  input: emptyInput,
  output: z.object({
    ideas: z.array(ideaSchema),
  }),
});

export const ideaPromoteRpc = defineRpc({
  name: "idea.promote",
  input: z.object({
    reelId: z.string().min(1),
    seed: z.string().max(4000).optional(),
  }),
  output: z.object({
    idea: ideaSchema,
  }),
});

export const ideaDiscussRpc = defineRpc({
  name: "idea.discuss",
  input: z.object({
    ideaId: z.string().min(1),
    message: z.string().min(1).max(8000),
  }),
  output: z.object({
    idea: ideaSchema,
    reply: z.string(),
  }),
});

export const ideaShapeRpc = defineRpc({
  name: "idea.shape",
  input: z.object({
    ideaId: z.string().min(1),
  }),
  output: z.object({
    idea: ideaSchema,
  }),
});

export const ideaQueueRpc = defineRpc({
  name: "idea.queue",
  input: z.object({
    ideaId: z.string().min(1),
  }),
  output: z.object({
    idea: ideaSchema,
  }),
});

export const runQueuedRpc = defineRpc({
  name: "run.queued",
  input: z.object({
    ideaId: z.string().min(1).optional(),
  }),
  output: z.object({
    runs: z.array(
      z.object({
        ideaId: z.string(),
        ok: z.boolean(),
        error: z.string().nullable(),
      }),
    ),
  }),
});

/** Stage badge text for the ideas tab, in pipeline order. */
export const STAGE_ORDER = ideaStageSchema.options;
