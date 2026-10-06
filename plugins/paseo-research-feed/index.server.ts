import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  feedListRpc,
  feedRefreshRpc,
  ideaDiscussRpc,
  ideaListRpc,
  ideaPromoteRpc,
  ideaQueueRpc,
  ideaShapeRpc,
  reelActionRpc,
  reelDigestRpc,
  runQueuedRpc,
} from "./shared/registry";
import { researchFeedSettings } from "./shared/settings";
import {
  handleFeedList,
  handleFeedRefresh,
  handleIdeaDiscuss,
  handleIdeaList,
  handleIdeaPromote,
  handleIdeaQueue,
  handleIdeaShape,
  handleReelAction,
  handleReelDigest,
  handleRunQueued,
} from "./server/handlers";
import { settingsHandlers } from "./server/settings";

export default function contribute(server: PluginServerContext) {
  server.handle(researchFeedSettings.get, settingsHandlers.get);
  server.handle(researchFeedSettings.update, settingsHandlers.update);
  server.handle(researchFeedSettings.reset, settingsHandlers.reset);
  server.handle(feedRefreshRpc, handleFeedRefresh);
  server.handle(feedListRpc, handleFeedList);
  server.handle(reelDigestRpc, handleReelDigest);
  server.handle(reelActionRpc, handleReelAction);
  server.handle(ideaListRpc, handleIdeaList);
  server.handle(ideaPromoteRpc, handleIdeaPromote);
  server.handle(ideaDiscussRpc, handleIdeaDiscuss);
  server.handle(ideaShapeRpc, handleIdeaShape);
  server.handle(ideaQueueRpc, handleIdeaQueue);
  server.handle(runQueuedRpc, handleRunQueued);
  return () => {};
}
