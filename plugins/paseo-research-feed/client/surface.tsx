import { useState } from "react";
import { View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { HostTabs, spacing } from "paseo-plugin-helper/ui";
import { FeedTab } from "./feed-tab";
import { IdeasTab } from "./ideas-tab";

/**
 * The Research Feed sidebar surface: two tabs mirroring the pipeline's two
 * decoupled layers. FEED is the upstream skim (many per day, produces but
 * never decides); IDEAS are the tracks the operator promotes and gates.
 */
export function ResearchFeedSurface(_props: PluginSurfaceProps) {
  const [tab, setTab] = useState<"feed" | "ideas">("feed");

  return (
    <View style={{ flex: 1, minHeight: 0, width: "100%" }}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
        <HostTabs
          tabs={[
            { id: "feed", label: "Feed", icon: "Newspaper" },
            { id: "ideas", label: "Ideas", icon: "Lightbulb" },
          ]}
          activeTab={tab}
          onTabChange={(id) => setTab(id === "ideas" ? "ideas" : "feed")}
        />
      </View>
      {tab === "feed" ? <FeedTab /> : <IdeasTab />}
    </View>
  );
}
