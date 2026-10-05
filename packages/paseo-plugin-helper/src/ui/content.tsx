import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView as FallbackScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollView as ScrollViewInstance,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { getClientHost } from "../core/host.js";
import type { StatusVariant, ThemeColors } from "../shared/types.js";
import { resolveMetricStatus, type MetricThresholds } from "../shared/formatters.js";
import { useHostTheme } from "./theme.js";
import { alpha } from "./color.js";
import { spacing } from "./layout.js";
import { HostButton } from "./controls.js";

/**
 * Paseo Plugin Helper — UI content adapters (`paseo-plugin-helper/ui`).
 *
 * Thin, host-delegating content adapters (Card, Tabs, Badge, …). Contract
 * shared by everything here:
 *
 * - Colors come from the host `theme` prop via {@link useHostTheme} — never
 *   from DOM CSS variables, flair, or a density scale.
 * - Scroll ownership stays with the host: these components render plain
 *   content and add no helper-owned scroller (see `ui/modal.tsx`).
 * - No width caps, no `minWidth` floors, no design-system machinery. The host
 *   owns the design language; these adapters only compose its color tokens.
 */

/** Surface variants shared by HostCard / HostCollapsible. */
export type HostSurfaceVariant = "flat" | "elevated" | "tinted";

/**
 * Resolves a surface variant to host theme colors. Single source of truth for
 * the "flat / elevated / tinted" vocabulary.
 */
export function resolveHostSurface(
  colors: ThemeColors,
  variant: HostSurfaceVariant = "flat",
): { backgroundColor: string; borderColor: string } {
  switch (variant) {
    case "elevated":
      return { backgroundColor: colors.surface1, borderColor: colors.border };
    case "tinted":
      return {
        backgroundColor: alpha(colors.accent, 0.04),
        borderColor: alpha(colors.accent, 0.2),
      };
    case "flat":
    default:
      return { backgroundColor: colors.surface0, borderColor: colors.border };
  }
}

// --- Card -----------------------------------------------------------------

export interface HostCardProps {
  children: ReactNode;
  variant?: HostSurfaceVariant;
  style?: StyleProp<ViewStyle>;
  noPadding?: boolean;
}

export interface HostCardHeaderProps {
  title: string;
  subtitle?: string;
  value?: string | number | ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
}

/** Surface card. Thin: host theme colors + border + padding, nothing else. */
export function HostCard({ children, variant, style, noPadding = false }: HostCardProps) {
  const { colors } = useHostTheme();
  const surface = resolveHostSurface(colors, variant);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: surface.backgroundColor,
          borderColor: surface.borderColor,
          padding: noPadding ? 0 : spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Card header row: title/subtitle on the left, value/badge/action on the right. */
export function HostCardHeader({
  title,
  subtitle,
  value,
  badge,
  action,
  icon,
  style,
  titleStyle,
  subtitleStyle,
}: HostCardHeaderProps) {
  const { Icon } = getClientHost();
  const { colors } = useHostTheme();
  return (
    <View style={[styles.cardHeader, style]}>
      <View style={styles.cardHeaderLeft}>
        {icon ? <Icon name={icon} size={15} color={colors.foregroundMuted} /> : null}
        <View style={styles.titleColumn}>
          <Text
            style={[styles.cardHeaderTitle, { color: colors.foreground }, titleStyle]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.cardHeaderSubtitle, { color: colors.foregroundMuted }, subtitleStyle]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.cardHeaderRight}>
        {badge ? <View style={{ marginRight: spacing.xs }}>{badge}</View> : null}
        {typeof value === "string" || typeof value === "number" ? (
          <Text style={[styles.cardHeaderValue, { color: colors.foreground }]}>{value}</Text>
        ) : (
          value
        )}
        {action}
      </View>
    </View>
  );
}

HostCard.Header = HostCardHeader;

// --- Section header -------------------------------------------------------

export interface HostSectionHeaderProps {
  title: string;
  count?: number;
  badgeVariant?: StatusVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/** Section title with an optional count badge. */
export function HostSectionHeader({
  title,
  count,
  badgeVariant,
  style,
  textStyle,
}: HostSectionHeaderProps) {
  const { colors } = useHostTheme();
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.sectionTitle, { color: colors.foregroundMuted }, textStyle]}
      >
        {title}
      </Text>
      {count !== undefined ? (
        <HostBadge
          label={String(count)}
          variant={badgeVariant ?? (count > 0 ? "warning" : "neutral")}
          styleVariant={count > 0 ? "solid" : "tinted"}
          size="sm"
        />
      ) : null}
    </View>
  );
}

// --- Badge ----------------------------------------------------------------

export type HostBadgeStyle = "tinted" | "outline" | "solid";
export type HostBadgeSize = "sm" | "md";

export interface HostBadgeProps {
  label: string;
  variant?: StatusVariant;
  styleVariant?: HostBadgeStyle;
  size?: HostBadgeSize;
  icon?: string | ReactNode;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/** Status pill. Colors derive from the host theme via `getVariantPalette`. */
export function HostBadge({
  label,
  variant = "neutral",
  styleVariant = "tinted",
  size = "md",
  icon,
  dot = false,
  style,
  textStyle,
}: HostBadgeProps) {
  const { Icon } = getClientHost();
  const { colors, getVariantPalette, getStatusColor } = useHostTheme();

  const fontSize = size === "sm" ? 10 : 11;
  const lineHeight = size === "sm" ? 12 : 15;
  const paddingVertical = size === "sm" ? 1 : 2;
  const paddingHorizontal = size === "sm" ? 5 : 8;
  const iconSize = size === "sm" ? 10 : 11;

  const palette = getVariantPalette(variant);
  const solidColor = getStatusColor(variant);

  let bg = palette.bg;
  let border = palette.border;
  let textColor = palette.text;

  if (styleVariant === "outline") {
    bg = "transparent";
    border = palette.border;
    textColor = palette.text;
  } else if (styleVariant === "solid") {
    bg = solidColor;
    border = "transparent";
    textColor = colors.accentForeground;
  }

  const renderIcon = () => {
    if (dot) {
      return <View style={[styles.dot, { backgroundColor: textColor }]} />;
    }
    if (!icon) return null;
    if (typeof icon === "string") {
      return <Icon name={icon} size={iconSize} color={textColor} />;
    }
    return icon;
  };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderColor: border,
          paddingVertical,
          paddingHorizontal,
        },
        style,
      ]}
    >
      {renderIcon()}
      <Text
        accessibilityLabel={label}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[
          styles.badgeText,
          {
            color: textColor,
            fontSize,
            lineHeight,
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// --- Status dot -----------------------------------------------------------

export interface HostStatusDotProps {
  variant?: StatusVariant;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Small status indicator dot. */
export function HostStatusDot({
  variant = "neutral",
  size = "md",
  pulse = false,
  style,
}: HostStatusDotProps) {
  const { getStatusColor } = useHostTheme();
  const color = getStatusColor(variant);
  const dimension = size === "sm" ? 6 : size === "lg" ? 10 : 8;
  return (
    <View
      style={[
        styles.statusDot,
        {
          width: dimension,
          height: dimension,
          backgroundColor: color,
          opacity: pulse ? 0.6 : 1,
        },
        style,
      ]}
    />
  );
}

// --- Progress bar ---------------------------------------------------------

export interface HostProgressBarProps {
  value: number; // 0 to 100
  color?: string;
  autoStatusColor?: boolean;
  thresholds?: MetricThresholds;
  label?: string;
  showValueText?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/** Horizontal progress bar with optional status coloring. */
export function HostProgressBar({
  value,
  color,
  autoStatusColor = true,
  thresholds,
  label,
  showValueText = false,
  height = 8,
  style,
}: HostProgressBarProps) {
  const { colors } = useHostTheme();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  let barColor = color || colors.accent;
  if (!color && autoStatusColor) {
    const status = resolveMetricStatus(clamped, thresholds);
    if (status === "danger") {
      barColor = colors.statusDanger;
    } else if (status === "warning") {
      barColor = colors.statusWarning;
    } else {
      barColor = colors.statusSuccess;
    }
  }

  return (
    <View style={[styles.progressContainer, style]}>
      {(label || showValueText) && (
        <View style={styles.progressLabelRow}>
          {label ? (
            <Text style={[styles.progressLabel, { color: colors.foregroundMuted }]}>{label}</Text>
          ) : null}
          {showValueText ? (
            <Text style={[styles.progressValue, { color: colors.foreground }]}>
              {Math.round(clamped)}%
            </Text>
          ) : null}
        </View>
      )}
      <View
        style={[
          styles.progressTrack,
          {
            backgroundColor: colors.surface2,
            height,
            borderRadius: height / 2,
          },
        ]}
      >
        <View
          style={[
            styles.progressFill,
            {
              width: `${clamped}%`,
              backgroundColor: barColor,
              borderRadius: height / 2,
            },
          ]}
        />
      </View>
    </View>
  );
}

// --- Metric gauge ---------------------------------------------------------

export interface HostMetricGaugeProps {
  value: number; // 0 - 100
  size?: number;
  strokeWidth?: number;
  thresholds?: MetricThresholds;
  color?: string;
  autoStatusColor?: boolean;
  label?: string;
  showPercent?: boolean;
  centerSlot?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Radial metric gauge. Web paints a conic-gradient ring; native falls back to a track ring. */
export function HostMetricGauge({
  value,
  size = 76,
  strokeWidth = 7,
  thresholds,
  color,
  autoStatusColor = true,
  label,
  showPercent = true,
  centerSlot,
  style,
}: HostMetricGaugeProps) {
  const { colors } = useHostTheme();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  let gaugeColor = color || colors.accent;
  if (!color && autoStatusColor) {
    const status = resolveMetricStatus(clamped, thresholds);
    if (status === "danger") {
      gaugeColor = colors.statusDanger;
    } else if (status === "warning") {
      gaugeColor = colors.statusWarning;
    } else {
      gaugeColor = colors.statusSuccess;
    }
  }

  const radius = size / 2;
  const innerSize = Math.max(0, size - strokeWidth * 2);
  const innerRadius = innerSize / 2;
  const trackColor = colors.surface2;

  if (Platform.OS === "web") {
    const webBackground = `conic-gradient(${gaugeColor} 0% ${clamped}%, ${trackColor} ${clamped}% 100%)`;
    return (
      <View style={[styles.gaugeWrapper, style]}>
        <View
          style={[
            styles.gaugeBox,
            { width: size, height: size, borderRadius: radius },
            { background: webBackground } as any,
          ]}
        >
          <View
            style={[
              styles.gaugeCenterHole,
              {
                width: innerSize,
                height: innerSize,
                borderRadius: innerRadius,
                backgroundColor: colors.surface0,
              },
            ]}
          >
            {centerSlot ? (
              centerSlot
            ) : showPercent ? (
              <Text style={[styles.gaugePercent, { color: colors.foreground }]}>
                {Math.round(clamped)}%
              </Text>
            ) : null}
          </View>
        </View>
        {label ? (
          <Text style={[styles.gaugeLabel, { color: colors.foregroundMuted }]}>{label}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.gaugeWrapper, style]}>
      <View
        style={[
          styles.gaugeBox,
          { width: size, height: size, borderRadius: radius },
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: radius,
              borderWidth: strokeWidth,
              borderColor: trackColor,
            },
          ]}
        />
        <View
          style={[
            styles.gaugeFill,
            {
              width: innerSize,
              height: innerSize,
              borderRadius: innerRadius,
              backgroundColor: gaugeColor,
              opacity: 0.25 + 0.75 * (clamped / 100),
            },
          ]}
        />
      </View>
      {label ? (
        <Text style={[styles.gaugeLabel, { color: colors.foregroundMuted }]}>{label}</Text>
      ) : null}
    </View>
  );
}

// --- Key-value ------------------------------------------------------------

export type HostKeyValueTruncateMode = "end" | "middle" | "path";

export interface HostKeyValueProps {
  label: string;
  value: string | number | null | undefined;
  subValue?: string;
  mono?: boolean;
  copyable?: boolean;
  truncate?: boolean | HostKeyValueTruncateMode;
  truncateMaxLength?: number;
  layout?: "stacked" | "inline";
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
}

/** Label/value row with optional copy-to-clipboard (host `copyText`). */
export function HostKeyValue({
  label,
  value,
  subValue,
  mono = false,
  copyable = false,
  truncate: truncateProp = false,
  truncateMaxLength = 32,
  layout = "stacked",
  style,
  labelStyle,
  valueStyle,
}: HostKeyValueProps) {
  const { Icon, useToast } = getClientHost();
  const { colors } = useHostTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const rawString = value === null || value === undefined ? "" : String(value);

  let displayValue = rawString || "-";
  if (truncateProp && rawString.length > truncateMaxLength) {
    const mode: HostKeyValueTruncateMode =
      typeof truncateProp === "string" ? truncateProp : "middle";
    if (mode === "path") {
      displayValue = rawString.length > truncateMaxLength
        ? `…${rawString.slice(-truncateMaxLength)}`
        : rawString;
    } else if (mode === "end") {
      displayValue = `${rawString.slice(0, truncateMaxLength)}…`;
    } else {
      const half = Math.floor(truncateMaxLength / 2);
      displayValue = `${rawString.slice(0, half)}…${rawString.slice(-half)}`;
    }
  }

  const handleCopy = async () => {
    if (!copyable || !rawString) return;
    const copyText = getClientHost().copyText;
    if (!copyText) return;
    try {
      await copyText(rawString);
      toast?.copied?.(label);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.error?.("Copy failed");
    }
  };

  const copyButton = copyable && value ? (
    <Pressable
      onPress={handleCopy}
      hitSlop={8}
      style={styles.kvCopyBtn}
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
    >
      <Icon
        name={copied ? "Check" : "Copy"}
        size={13}
        color={copied ? colors.statusSuccess : colors.foregroundMuted}
      />
    </Pressable>
  ) : null;

  const valueText = (
    <Text
      selectable
      numberOfLines={1}
      ellipsizeMode="middle"
      style={[
        styles.kvValue,
        {
          color: colors.foreground,
          fontFamily: mono ? "monospace" : undefined,
        },
        valueStyle,
      ]}
    >
      {displayValue}
    </Text>
  );

  if (layout === "inline") {
    return (
      <View style={[styles.kvContainer, styles.kvInline, style]}>
        <Text
          numberOfLines={1}
          style={[styles.kvInlineLabel, { color: colors.foregroundMuted }, labelStyle]}
        >
          {label}
        </Text>
        <View style={styles.kvInlineValue}>
          {valueText}
          {copyButton}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.kvContainer, style]}>
      <Text
        numberOfLines={1}
        style={[styles.kvLabel, { color: colors.foregroundMuted }, labelStyle]}
      >
        {label}
      </Text>
      <View style={styles.kvValueRow}>
        {valueText}
        {copyButton}
      </View>
      {subValue ? (
        <Text numberOfLines={1} style={[styles.kvSubValue, { color: colors.foregroundMuted }]}>
          {subValue}
        </Text>
      ) : null}
    </View>
  );
}

// --- Empty state ----------------------------------------------------------

export interface HostEmptyStateProps {
  icon?: string | ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Centered empty-state block. */
export function HostEmptyState({
  icon = "Inbox",
  title,
  description,
  actionLabel,
  onAction,
  style,
}: HostEmptyStateProps) {
  const { Icon } = getClientHost();
  const { colors } = useHostTheme();
  return (
    <View style={[styles.emptyContainer, style]}>
      {icon ? (
        typeof icon === "string" ? (
          <View style={[styles.emptyIconWrapper, { backgroundColor: colors.surface1 }]}>
            <Icon name={icon} size={32} color={colors.foregroundMuted} />
          </View>
        ) : (
          icon
        )
      ) : null}
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.emptyDescription, { color: colors.foregroundMuted }]}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.emptyActionRow}>
          <HostButton label={actionLabel} onPress={onAction} variant="secondary" size="sm" />
        </View>
      ) : null}
    </View>
  );
}

// --- Collapsible ----------------------------------------------------------

export interface HostCollapsibleProps {
  title?: string | ReactNode;
  subtitle?: string | ReactNode;
  children: ReactNode;
  initiallyExpanded?: boolean;
  isExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  badge?: ReactNode;
  headerRight?: ReactNode;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  headerStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  variant?: HostSurfaceVariant;
}

/** Expandable section with a host-themed header row. */
export function HostCollapsible({
  title,
  subtitle,
  children,
  initiallyExpanded = false,
  isExpanded: controlledExpanded,
  onToggle,
  badge,
  headerRight,
  icon,
  style,
  headerStyle,
  contentStyle,
  variant = "flat",
}: HostCollapsibleProps) {
  const { Icon } = getClientHost();
  const { colors } = useHostTheme();
  const [internalExpanded, setInternalExpanded] = useState(initiallyExpanded);

  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const surface = resolveHostSurface(colors, variant);

  const handlePress = () => {
    const next = !isExpanded;
    if (controlledExpanded === undefined) {
      setInternalExpanded(next);
    }
    onToggle?.(next);
  };

  return (
    <View
      style={[
        styles.collapsibleContainer,
        {
          borderColor: surface.borderColor,
          backgroundColor: surface.backgroundColor,
        },
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        style={({ pressed }) => [
          styles.collapsibleHeader,
          {
            backgroundColor: pressed ? colors.surface1 : "transparent",
          },
          headerStyle,
        ]}
      >
        {icon ? (
          <Icon name={icon} size={14} color={colors.foregroundMuted} />
        ) : null}
        <View style={styles.collapsibleTitleColumn}>
          {title ? (
            <Text style={[styles.collapsibleTitle, { color: colors.foreground }]}>
              {typeof title === "string" ? title : null}
            </Text>
          ) : null}
          {typeof title !== "string" ? title : null}
          {subtitle ? (
            <Text style={[styles.collapsibleSubtitle, { color: colors.foregroundMuted }]}>
              {typeof subtitle === "string" ? subtitle : null}
            </Text>
          ) : null}
          {typeof subtitle !== "string" ? subtitle : null}
        </View>
        {badge}
        {headerRight}
        <Icon
          name={isExpanded ? "ChevronDown" : "ChevronRight"}
          size={14}
          color={colors.foregroundMuted}
        />
      </Pressable>
      {isExpanded ? (
        <View style={[styles.collapsibleContent, contentStyle]}>{children}</View>
      ) : null}
    </View>
  );
}

// --- Tabs -----------------------------------------------------------------

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

interface WheelScrollEvent {
  deltaX?: number;
  deltaY?: number;
  preventDefault(): void;
}

interface WheelScrollNode {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  addEventListener(type: "wheel", listener: (event: WheelScrollEvent) => void, options?: { passive?: boolean }): void;
  removeEventListener(type: "wheel", listener: (event: WheelScrollEvent) => void): void;
}

interface WheelScrollInstance {
  getScrollableNode?(): WheelScrollNode | null;
}

/**
 * Tab strip. `mode="auto"` fits the track when there are few tabs and scrolls
 * otherwise; the strip itself is a plain horizontal scroller (never the host
 * sheet-gesture scroller, #219).
 */
export function HostTabs({
  tabs,
  activeTab,
  onTabChange,
  mode = "auto",
  style,
}: HostTabsProps) {
  const { Icon } = getClientHost();
  const { colors, alpha: alphaColor } = useHostTheme();
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

  // Translate vertical mouse-wheel motion into horizontal tab-strip scrolling
  // on web, while allowing the surrounding modal to scroll at either edge.
  useEffect(() => {
    if (shouldFit || Platform.OS !== "web") return;
    const instance = scrollRef.current as unknown as WheelScrollInstance | null;
    const node = instance?.getScrollableNode?.() ?? (instance as unknown as WheelScrollNode | null);
    if (!node || typeof node.addEventListener !== "function") return;
    const onWheel = (event: WheelScrollEvent) => {
      const deltaX = event.deltaX ?? 0;
      const deltaY = event.deltaY ?? 0;
      if (Math.abs(deltaY) <= Math.abs(deltaX)) return;
      const max = node.scrollWidth - node.clientWidth;
      const next = Math.min(Math.max(0, node.scrollLeft + deltaY), max);
      if (next === node.scrollLeft) return;
      event.preventDefault();
      node.scrollLeft = next;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [shouldFit]);

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
                ? alphaColor(colors.surface2, 0.5)
                : "transparent",
            paddingHorizontal: shouldFit ? spacing.sm : spacing.md,
            paddingVertical: spacing.xs,
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
              styles.tabBadge,
              {
                backgroundColor: isActive ? colors.accent : alphaColor(colors.foregroundMuted, 0.2),
              },
            ]}
          >
            <Text
              style={[
                styles.tabBadgeText,
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
          styles.tabsFrame,
          {
            backgroundColor: colors.surface1,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        <View style={styles.tabsTrackFit}>{tabs.map((tab) => renderTab(tab))}</View>
      </View>
    );
  }

  return (
    <View
      onLayout={handleContainerLayout}
      style={[
        styles.tabsFrame,
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
        style={styles.tabsScrollView}
        contentContainerStyle={styles.tabsScrollContent}
      >
        {tabs.map((tab) => renderTab(tab))}
      </FallbackScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
    width: "100%",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  titleColumn: {
    gap: 1,
    flexShrink: 1,
  },
  cardHeaderTitle: {
    fontWeight: "600",
    fontSize: 13,
  },
  cardHeaderSubtitle: {
    fontWeight: "400",
    fontSize: 11,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  cardHeaderValue: {
    fontWeight: "600",
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    width: "100%",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    gap: 4,
    flexShrink: 1,
    maxWidth: "100%",
  },
  badgeText: {
    fontWeight: "600",
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDot: {
    borderRadius: 9999,
  },
  progressContainer: {
    gap: 4,
    width: "100%",
  },
  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontSize: 11,
  },
  progressValue: {
    fontSize: 11,
    fontWeight: "600",
  },
  progressTrack: {
    width: "100%",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  gaugeWrapper: {
    alignItems: "center",
    gap: 4,
  },
  gaugeBox: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  gaugeCenterHole: {
    alignItems: "center",
    justifyContent: "center",
  },
  gaugeFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  gaugePercent: {
    fontSize: 13,
    fontWeight: "700",
  },
  gaugeLabel: {
    fontSize: 11,
  },
  kvContainer: {
    gap: 2,
    width: "100%",
  },
  kvInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  kvLabel: {
    fontSize: 11,
  },
  kvInlineLabel: {
    fontSize: 11,
    flexShrink: 1,
  },
  kvValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  kvInlineValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "flex-end",
  },
  kvValue: {
    fontSize: 12,
    flexShrink: 1,
    minWidth: 0,
  },
  kvSubValue: {
    fontSize: 11,
  },
  kvCopyBtn: {
    padding: 2,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 12,
    textAlign: "center",
  },
  emptyActionRow: {
    marginTop: spacing.xs,
  },
  collapsibleContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    width: "100%",
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    minHeight: 40,
  },
  collapsibleTitleColumn: {
    flex: 1,
    flexShrink: 1,
    gap: 1,
  },
  collapsibleTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  collapsibleSubtitle: {
    fontSize: 11,
  },
  collapsibleContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  tabsFrame: {
    width: "100%",
    maxWidth: "100%",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
  },
  tabsTrackFit: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    width: "100%",
    padding: 3,
    gap: 2,
  },
  tabsScrollView: {
    width: "100%",
    maxWidth: "100%",
  },
  tabsScrollContent: {
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
    borderRadius: 8,
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
  tabBadge: {
    borderRadius: 9999,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
