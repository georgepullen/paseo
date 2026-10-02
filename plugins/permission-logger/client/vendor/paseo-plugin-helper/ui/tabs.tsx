import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView as FallbackScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollView as ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { getClientHost } from "../host";
import { useHostTheme } from "./theme";

export interface HostTabItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: string;
  badge?: string | number;
}

export interface HostTabsProps {
  tabs: HostTabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  mode?: "auto" | "fit" | "scroll";
  style?: StyleProp<ViewStyle>;
}

/**
 * Host-delegating tabs for `paseo-plugin-helper/ui`.
 *
 * Thin wrapper that paints a tab strip with host theme colors. The tab strip
 * scrolls horizontally via a plain React Native ScrollView (not the host
 * ScrollView, which is a vertical sheet-gesture controller). No scroll
 * ownership state machine — the tab strip's horizontal scroll is independent
 * of modal/surface scroll ownership.
 */
export function HostTabs({
  tabs,
  activeTab,
  onTabChange,
  mode = "auto",
  style,
}: HostTabsProps) {
  const { Icon } = getClientHost();
  const { colors, alpha } = useHostTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [viewportWidth, setViewportWidth] = useState<number>(0);

  const shouldFit = mode === "fit" || (mode === "auto" && tabs.length <= 4);

  const prevActiveTab = useRef<string>(activeTab);
  useEffect(() => {
    if (!shouldFit && scrollRef.current && tabLayouts.current[activeTab] && viewportWidth > 0) {
      if (prevActiveTab.current !== activeTab) {
        prevActiveTab.current = activeTab;
        const { x, width } = tabLayouts.current[activeTab];
        const targetX = Math.max(0, x - (viewportWidth - width) / 2);
        scrollRef.current.scrollTo({
          x: targetX,
          animated: true,
        });
      }
    }
  }, [activeTab, shouldFit, viewportWidth]);

  const handleTabLayout = (tabId: string, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    tabLayouts.current[tabId] = { x, width };
  };

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setViewportWidth(width);
  };

  const renderTab = (tab: HostTabItem) => {
    const isActive = tab.id === activeTab;

    return (
      <Pressable
        key={tab.id}
        onPress={() => {
          onTabChange(tab.id);
        }}
        onLayout={(e) => handleTabLayout(tab.id, e)}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        style={({ pressed }) => [
          styles.tab,
          shouldFit ? styles.tabFit : styles.tabScroll,
          {
            backgroundColor: isActive
              ? colors.surface2
              : pressed
                ? alpha(colors.surface2, 0.5)
                : "transparent",
            paddingHorizontal: shouldFit ? 12 : 16,
            paddingVertical: 6,
          },
        ]}
      >
        {tab.icon ? (
          <Icon
            name={tab.icon}
            size={13}
            color={isActive ? colors.foreground : colors.foregroundMuted}
          />
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            styles.tabText,
            {
              color: isActive ? colors.foreground : colors.foregroundMuted,
              fontWeight: isActive ? "600" : "500",
            },
          ]}
        >
          {tab.label}
        </Text>
        {tab.badge !== undefined ? (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isActive ? colors.accent : alpha(colors.foregroundMuted, 0.2),
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color: isActive ? colors.accentForeground : colors.foregroundMuted,
                },
              ]}
            >
              {tab.badge}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  if (shouldFit) {
    return (
      <View
        style={[
          styles.frame,
          {
            backgroundColor: colors.surface1,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        <View style={styles.trackFit}>
          {tabs.map((tab) => renderTab(tab))}
        </View>
      </View>
    );
  }

  return (
    <View
      onLayout={handleContainerLayout}
      style={[
        styles.frame,
        {
          backgroundColor: colors.surface1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <FallbackScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={true}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map((tab) => renderTab(tab))}
      </FallbackScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    maxWidth: "100%",
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
  },
  trackFit: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    width: "100%",
    padding: 3,
    gap: 2,
  },
  scrollView: {
    width: "100%",
    maxWidth: "100%",
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 3,
    gap: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  tabFit: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  tabScroll: {
    flexShrink: 0,
  },
  tabText: {
    textAlign: "center",
    fontSize: 12,
    flexShrink: 1,
    minWidth: 0,
  },
  badge: {
    borderRadius: 9999,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
