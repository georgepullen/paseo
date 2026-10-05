import React, { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  Icon,
  copyText,
  useToast,
} from "@getpaseo/plugin/client/react-native";
import { useHostTheme } from "paseo-plugin-helper/lifecycle";
import {
  resolveMetricStatus,
  type MetricThresholds,
  type StatusVariant,
  type ThemeColors,
} from "paseo-plugin-helper/shared";

/**
 * Local composition of the presentational pieces plugin-updates used to import
 * from the helper's frozen `client/` kit (xpufx-org/paseo#937, #924).
 *
 * The host SDK owns the design language and provides the primitives that carry
 * host behaviour (`Icon`, `useToast`, `copyText`); everything here is plain
 * React Native layout and color-token composition over the host `theme` prop
 * via `HostThemeProvider` / `useHostTheme` from `paseo-plugin-helper/lifecycle`.
 *
 * Only the components this plugin actually renders are kept, using the same
 * names and prop shapes as the frozen `client/` kit so call sites changed only
 * their import path.
 *
 * The host SDK exposes no button/pressable primitive, so the interactive
 * pieces compose `Pressable` directly — the one exemption recorded in
 * conformance.json.
 */

export { HostThemeProvider, useHostTheme } from "paseo-plugin-helper/lifecycle";

/** Static text metrics for the local composition; the host owns color, not type. */
export const typography = {
  heading: { fontSize: 14, lineHeight: 20, fontWeight: "600" as const },
  body: { fontSize: 13, lineHeight: 19, fontWeight: "400" as const },
  bodyStrong: { fontSize: 13, lineHeight: 19, fontWeight: "600" as const },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: "400" as const },
} as const;

/** Fluid popover padding; the host allocates the dialog frame. */
export const popoverPadding = { horizontal: 12, vertical: 8, gap: 8 } as const;

// --- layout ----------------------------------------------------------------

export interface HostRowProps {
  children: ReactNode;
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}

const alignMap = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
} as const;

const justifyMap = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
} as const;

export function HostRow({
  children,
  gap = 8,
  align = "center",
  justify = "start",
  wrap = false,
  style,
}: HostRowProps) {
  return (
    <View
      style={[
        styles.row,
        {
          gap,
          alignItems: alignMap[align],
          justifyContent: justifyMap[justify],
          flexWrap: wrap ? "wrap" : "nowrap",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// --- card ------------------------------------------------------------------

export type HostSurfaceVariant = "flat" | "elevated" | "tinted";

function resolveHostSurface(
  colors: ThemeColors,
  variant: HostSurfaceVariant = "flat",
): { backgroundColor: string; borderColor: string } {
  switch (variant) {
    case "elevated":
      return { backgroundColor: colors.surface1, borderColor: colors.border };
    case "tinted":
      return { backgroundColor: colors.surface2, borderColor: colors.border };
    case "flat":
    default:
      return { backgroundColor: colors.surface0, borderColor: colors.border };
  }
}

export interface HostCardProps {
  children: ReactNode;
  variant?: HostSurfaceVariant;
  style?: StyleProp<ViewStyle>;
}

export function HostCard({ children, variant = "flat", style }: HostCardProps) {
  const { colors } = useHostTheme();
  const surface = resolveHostSurface(colors, variant);
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surface.backgroundColor, borderColor: surface.borderColor },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// --- section header --------------------------------------------------------

export interface HostSectionHeaderProps {
  title: string;
  count?: number;
  badgeVariant?: StatusVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

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

// --- badge -----------------------------------------------------------------

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
        { backgroundColor: bg, borderColor: border, paddingVertical, paddingHorizontal },
        style,
      ]}
    >
      {renderIcon()}
      <Text
        accessibilityLabel={label}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.badgeText, { color: textColor, fontSize, lineHeight }, textStyle]}
      >
        {label}
      </Text>
    </View>
  );
}

// --- status dot ------------------------------------------------------------

export interface HostStatusDotProps {
  variant?: StatusVariant;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}

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

// --- progress --------------------------------------------------------------

export interface HostProgressBarProps {
  value: number;
  color?: string;
  autoStatusColor?: boolean;
  thresholds?: MetricThresholds;
  label?: string;
  showValueText?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

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
    barColor =
      status === "danger"
        ? colors.statusDanger
        : status === "warning"
          ? colors.statusWarning
          : colors.statusSuccess;
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
          { backgroundColor: colors.surface2, height, borderRadius: height / 2 },
        ]}
      >
        <View
          style={[
            styles.progressFill,
            { width: `${clamped}%`, backgroundColor: barColor, borderRadius: height / 2 },
          ]}
        />
      </View>
    </View>
  );
}

// --- key-value -------------------------------------------------------------

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
  const { colors } = useHostTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const rawString = value === null || value === undefined ? "" : String(value);

  let displayValue = rawString || "-";
  if (truncateProp && rawString.length > truncateMaxLength) {
    const mode: HostKeyValueTruncateMode =
      typeof truncateProp === "string" ? truncateProp : "middle";
    if (mode === "path") {
      displayValue = `…${rawString.slice(-truncateMaxLength)}`;
    } else if (mode === "end") {
      displayValue = `${rawString.slice(0, truncateMaxLength)}…`;
    } else {
      const half = Math.floor(truncateMaxLength / 2);
      displayValue = `${rawString.slice(0, half)}…${rawString.slice(-half)}`;
    }
  }

  const handleCopy = async () => {
    if (!copyable || !rawString) return;
    try {
      await copyText(rawString);
      toast.show(label);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.show("Copy failed", { variant: "error" });
    }
  };

  const copyButton =
    copyable && value ? (
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
        { color: colors.foreground, fontFamily: mono ? "monospace" : undefined },
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

export interface HostKeyValueGroupProps {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fluid key/value grid. Wraps to fewer columns rather than collapsing to one;
 * the host popover allocates the width, so there is no local breakpoint.
 */
export function HostKeyValueGroup({
  children,
  columns = 2,
  gap = 8,
  style,
}: HostKeyValueGroupProps) {
  const childArray = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.groupContainer, { gap }, style]}>
      {childArray.map((child, index) => (
        <View
          key={index}
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: `${Math.floor(100 / columns) - 2}%`,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

// --- empty state -----------------------------------------------------------

export interface HostEmptyStateProps {
  icon?: string | ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function HostEmptyState({
  icon = "Inbox",
  title,
  description,
  actionLabel,
  onAction,
  style,
}: HostEmptyStateProps) {
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

// --- controls --------------------------------------------------------------

export type HostButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type HostButtonSize = "sm" | "md" | "lg";

export interface HostButtonProps {
  label?: string;
  children?: ReactNode;
  variant?: HostButtonVariant;
  size?: HostButtonSize;
  icon?: string | ReactNode;
  iconPosition?: "left" | "right";
  onPress?: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
}

export function HostButton({
  label,
  children,
  variant = "secondary",
  size = "md",
  icon,
  iconPosition = "left",
  onPress,
  disabled = false,
  loading = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityRole = "button",
}: HostButtonProps) {
  const { colors, alpha } = useHostTheme();

  const py = size === "sm" ? 6 : size === "lg" ? 12 : 10;
  const px = size === "sm" ? 10 : size === "lg" ? 18 : 14;
  const fontSize = size === "sm" ? 12 : size === "lg" ? 15 : 13;
  const iconSize = size === "sm" ? 12 : size === "lg" ? 16 : 14;

  let bg = "transparent";
  let border = "transparent";
  let textColor = colors.foreground;

  switch (variant) {
    case "primary":
      bg = colors.accent;
      textColor = colors.accentForeground;
      break;
    case "danger":
      bg = alpha(colors.statusDanger, 0.15);
      border = alpha(colors.statusDanger, 0.4);
      textColor = colors.statusDanger;
      break;
    case "ghost":
      bg = "transparent";
      textColor = colors.foregroundMuted;
      break;
    case "secondary":
    default:
      bg = colors.surface1;
      border = colors.border;
      textColor = colors.foreground;
      break;
  }

  const renderIcon = () => {
    if (!icon) return null;
    if (typeof icon === "string") {
      return <Icon name={icon} size={iconSize} color={textColor} />;
    }
    return icon;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.buttonBase,
        {
          backgroundColor: pressed && !disabled ? alpha(bg, 0.8) : bg,
          borderColor: border,
          borderWidth: border !== "transparent" ? 1 : 0,
          borderRadius: 10,
          paddingVertical: py,
          paddingHorizontal: px,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.buttonContent}>
          {iconPosition === "left" ? renderIcon() : null}
          <Text style={[styles.buttonText, { color: textColor, fontSize }, textStyle]}>
            {children ?? label}
          </Text>
          {iconPosition === "right" ? renderIcon() : null}
        </View>
      )}
    </Pressable>
  );
}

// --- styles ----------------------------------------------------------------

const styles = {
  row: { flexDirection: "row", width: "100%" },
  card: { overflow: "hidden", width: "100%", borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
  },
  sectionTitle: {
    fontSize: typography.bodyStrong.fontSize,
    lineHeight: typography.bodyStrong.lineHeight,
    fontWeight: typography.bodyStrong.fontWeight,
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
  badgeText: { fontWeight: "600", flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusDot: { borderRadius: 9999 },
  progressContainer: { gap: 4, width: "100%" },
  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressLabel: { fontSize: 11 },
  progressValue: { fontSize: 11, fontWeight: "600" },
  progressTrack: { width: "100%", overflow: "hidden" },
  progressFill: { height: "100%" },
  groupContainer: { flexDirection: "row", flexWrap: "wrap", width: "100%" },
  kvContainer: { gap: 2, width: "100%" },
  kvInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kvLabel: { fontSize: 11 },
  kvInlineLabel: { fontSize: 11, flexShrink: 1 },
  kvValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  kvInlineValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "flex-end",
  },
  kvValue: { fontSize: 12, flexShrink: 1, minWidth: 0 },
  kvSubValue: { fontSize: 11 },
  kvCopyBtn: { padding: 2 },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
  emptyIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  emptyDescription: { fontSize: 12, textAlign: "center" },
  emptyActionRow: { marginTop: 4 },
  buttonBase: { overflow: "hidden" },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  buttonText: { fontWeight: "600", textAlign: "center" },
} as const;
