import React, { useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView as FallbackScrollView,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { getClientHost } from "../core/host";
import { copyToClipboard } from "../lifecycle/clipboard";
import { useHostTheme, useHostLayout } from "./theme";
import { alpha } from "./color";
import { spacing } from "./layout";
import { HostBadge, HostKeyValue } from "./content";
import { HostButton } from "./controls";

/**
 * Paseo Plugin Helper — UI text & misc adapters (`paseo-plugin-helper/ui`).
 *
 * Thin, host-delegating text adapters
 * (CodeBlock, CommandBox, TruncatedText, …). Same contract as the rest of ui/:
 * host theme colors only, no scroll ownership, no design-system machinery.
 */

// --- Code block ------------------------------------------------------------

export interface HostCodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  maxHeight?: number;
  copyable?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/** Bounded code block with optional copy button. */
export function HostCodeBlock({
  code,
  language,
  title,
  maxHeight = 320,
  copyable = true,
  style,
  textStyle,
}: HostCodeBlockProps) {
  const { Icon, useToast } = getClientHost();
  const { colors } = useHostTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(code, { toast, toastMessage: title || "Code" });
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fontFamily = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  return (
    <View
      style={[
        styles.codeContainer,
        {
          backgroundColor: colors.surface0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {(title || language || copyable) && (
        <View style={[styles.codeHeader, { borderBottomColor: alpha(colors.border, 0.7) }]}>
          <View style={styles.codeHeaderLeft}>
            {title ? (
              <Text style={[styles.codeTitle, { color: colors.foreground }]}>{title}</Text>
            ) : language ? (
              <Text style={[styles.codeLanguage, { color: colors.foregroundMuted }]}>
                {language.toUpperCase()}
              </Text>
            ) : null}
          </View>
          {copyable ? (
            <Pressable
              onPress={handleCopy}
              accessibilityRole="button"
              accessibilityLabel="Copy code"
              hitSlop={4}
              style={({ pressed }) => [
                styles.codeCopyButton,
                {
                  backgroundColor: pressed ? colors.surface2 : colors.surface1,
                  borderColor: colors.border,
                },
              ]}
            >
              <Icon
                name={copied ? "Check" : "Copy"}
                size={12}
                color={copied ? colors.statusSuccess : colors.foregroundMuted}
              />
            </Pressable>
          ) : null}
        </View>
      )}
      {/* The snippet scroller is a plain React Native ScrollView: the host
          ScrollView is a sheet-gesture pan controller and collapses/crashes
          when nested inside the host sheet (#219). */}
      <FallbackScrollView
        style={{ maxHeight }}
        contentContainerStyle={styles.codeScrollContent}
        horizontal={false}
      >
        <Text
          selectable
          style={[
            styles.codeText,
            {
              color: colors.foreground,
              fontFamily,
            },
            textStyle,
          ]}
        >
          {code}
        </Text>
      </FallbackScrollView>
    </View>
  );
}

// --- Command box -----------------------------------------------------------

export interface HostCommandBoxProps {
  argv?: string[];
  command?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  copyLabel?: string;
}

/** Formats an argv array into a shell command line. */
export function formatCommandLine(argv: string[]): string {
  return argv.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg)).join(" ");
}

/** Shell command display with copy-to-clipboard. */
export function HostCommandBox({
  argv = [],
  command,
  style,
  textStyle,
  copyLabel = "Copy command",
}: HostCommandBoxProps): React.ReactElement | null {
  const { colors } = useHostTheme();
  const { Icon, useToast } = getClientHost();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const fullCommand = command ?? formatCommandLine(argv);
  const [prog, ...rest] = argv;

  const handleCopy = async () => {
    if (!fullCommand) return;
    const ok = await copyToClipboard(fullCommand, { toast, toastMessage: "Command" });
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fontFamily = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  return (
    <View
      style={[
        styles.commandContainer,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <View style={styles.commandTextContainer}>
        <Text style={[styles.commandPrompt, { color: colors.statusWarning, fontFamily }]}>
          {prog ? `$ ${prog}` : "$"}
        </Text>
        {rest.length > 0 ? (
          <Text style={[styles.commandArgs, { color: colors.foreground, fontFamily }]}>
            {" "}
            {rest.join(" ")}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={handleCopy}
        accessibilityRole="button"
        accessibilityLabel={copyLabel}
        hitSlop={4}
        style={({ pressed }) => [
          styles.commandCopyButton,
          {
            backgroundColor: pressed ? colors.surface1 : "transparent",
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Icon
          name={copied ? "Check" : "Copy"}
          size={12}
          color={copied ? colors.statusSuccess : colors.foregroundMuted}
        />
      </Pressable>
    </View>
  );
}

// --- Truncated text --------------------------------------------------------

export type HostTruncateMode = "end" | "middle" | "path";

export interface HostTruncatedTextProps {
  text: string;
  maxLength?: number;
  mode?: HostTruncateMode;
  copyable?: boolean;
  mono?: boolean;
  toastMessage?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/** Single-line text with truncation and optional copy-to-clipboard. */
export function HostTruncatedText({
  text,
  maxLength = 32,
  mode = "middle",
  copyable = true,
  mono = true,
  toastMessage = "Copied",
  style,
  textStyle,
}: HostTruncatedTextProps) {
  const { colors } = useHostTheme();
  const { Icon, useToast } = getClientHost();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  if (!text) {
    return <Text style={[{ color: colors.foregroundMuted }, textStyle]}>-</Text>;
  }

  let formattedText = text;
  if (text.length > maxLength) {
    switch (mode) {
      case "path":
        formattedText = `…${text.slice(-maxLength)}`;
        break;
      case "end":
        formattedText = `${text.slice(0, maxLength)}…`;
        break;
      case "middle":
      default: {
        const half = Math.floor(maxLength / 2);
        formattedText = `${text.slice(0, half)}…${text.slice(-half)}`;
        break;
      }
    }
  }

  const handleCopy = async () => {
    if (!copyable || !text) return;
    const ok = await copyToClipboard(text, { toast, toastMessage });
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fontFamily = mono
    ? Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" })
    : undefined;

  return (
    <View style={[styles.truncatedContainer, style]}>
      <Text
        selectable
        numberOfLines={1}
        ellipsizeMode="clip"
        accessibilityLabel={text}
        style={[
          styles.truncatedText,
          {
            color: colors.foreground,
            fontFamily,
          },
          textStyle,
        ]}
      >
        {formattedText}
      </Text>
      {copyable ? (
        <Pressable
          onPress={handleCopy}
          hitSlop={8}
          style={styles.truncatedCopyBtn}
          accessibilityRole="button"
          accessibilityLabel={`Copy ${text}`}
        >
          <Icon
            name={copied ? "Check" : "Copy"}
            size={13}
            color={copied ? colors.statusSuccess : colors.foregroundMuted}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

// --- Highlighted text ------------------------------------------------------

export interface HostHighlightedTextProps {
  text: string;
  query: string;
  style?: StyleProp<TextStyle>;
  highlightStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
  fuzzyFallback?: boolean;
}

interface TextPart {
  text: string;
  matched: boolean;
}

/**
 * Renders text with case-insensitive query matches highlighted using the host
 * accent. The query is matched literally, never as a regex.
 */
export function HostHighlightedText({
  text,
  query,
  style,
  highlightStyle,
  numberOfLines,
  selectable = true,
  fuzzyFallback = false,
}: HostHighlightedTextProps) {
  const { colors } = useHostTheme();

  const parts = splitHighlightParts(text, query, fuzzyFallback);
  const matchStyle: StyleProp<TextStyle> = [
    { backgroundColor: colors.accent, color: colors.accentForeground },
    highlightStyle,
  ];
  return (
    <Text style={style} numberOfLines={numberOfLines} selectable={selectable}>
      {parts.map((part, index) =>
        part.matched ? (
          <Text key={`m${index}`} style={matchStyle}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

function splitHighlightParts(text: string, query: string, fuzzyFallback: boolean): TextPart[] {
  if (!query) return [{ text, matched: false }];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: TextPart[] = [];
  let cursor = 0;
  let hit = lowerText.indexOf(lowerQuery, cursor);
  while (hit !== -1) {
    if (hit > cursor) parts.push({ text: text.slice(cursor, hit), matched: false });
    parts.push({ text: text.slice(hit, hit + query.length), matched: true });
    cursor = hit + query.length;
    hit = lowerText.indexOf(lowerQuery, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), matched: false });
  if (parts.length === 0 || !parts.some((p) => p.matched)) {
    if (fuzzyFallback) return [{ text, matched: true }];
    return [{ text, matched: false }];
  }
  return parts;
}

// --- Responsive ------------------------------------------------------------

export interface HostResponsiveProps {
  desktop?: ReactNode;
  mobile?: ReactNode;
  compact?: ReactNode;
  wide?: ReactNode;
  children?: ReactNode | ((responsive: HostResponsiveLayout) => ReactNode);
}

export interface HostResponsiveLayout {
  isCompact: boolean;
  isMobile: boolean;
  isWide: boolean;
  select<T>(options: { desktop?: T; mobile?: T; compact?: T; wide?: T } & Record<string, T>): T | undefined;
}

/** Picks children by host layout (compact / mobile / wide). */
export function HostResponsive({ desktop, mobile, compact, wide, children }: HostResponsiveProps) {
  const layout = useHostLayout();
  const isMobile = layout.platform === "ios" || layout.platform === "android";
  const isCompact = layout.compact || isMobile;
  const isWide = !isCompact;

  const responsive: HostResponsiveLayout = {
    isCompact,
    isMobile,
    isWide,
    select: <T,>(options: { desktop?: T; mobile?: T; compact?: T; wide?: T } & Record<string, T>): T | undefined =>
      options.compact ?? options.mobile ?? options.wide ?? options.desktop ?? options.default,
  };

  if (typeof children === "function") {
    return <>{children(responsive)}</>;
  }

  const selected = responsive.select<ReactNode>({ desktop, mobile, compact, wide });
  return <>{selected ?? children ?? null}</>;
}

// --- Interactive row -------------------------------------------------------

export interface HostInteractiveRowProps {
  children?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  title?: string;
  disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  pressedOpacity?: number;
  disabledOpacity?: number;
  hitSlop?: number;
}

/** Pressable row with pressed feedback. */
export function HostInteractiveRow({
  children,
  onPress,
  title,
  disabled = false,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  pressedOpacity = 0.7,
  disabledOpacity = 0.45,
  hitSlop,
}: HostInteractiveRowProps) {
  const { colors, alpha: alphaColor } = useHostTheme();
  const [pressed, setPressed] = useState(false);

  const webProps = {
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    ...(title ? { title } : {}),
  } as any;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      hitSlop={hitSlop}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={({ pressed: isPressed }) => [
        styles.interactiveRow,
        {
          backgroundColor: pressed || isPressed ? alphaColor(colors.surface1, 0.5) : "transparent",
          opacity: disabled ? disabledOpacity : pressed || isPressed ? pressedOpacity : 1,
        },
        style,
      ]}
      {...webProps}
    >
      {children}
    </Pressable>
  );
}

// --- About section ---------------------------------------------------------

export interface HostAboutLink {
  label: string;
  url: string;
  icon?: string;
}

export interface HostAboutSectionProps {
  name: string;
  description?: string;
  version: string;
  author?: string;
  repository?: string;
  issues?: string;
  homepage?: string;
  license?: string;
  links?: HostAboutLink[];
  extraItems?: Array<{
    label: string;
    value: string;
    subValue?: string;
    copyable?: boolean;
  }>;
  style?: StyleProp<ViewStyle>;
}

/** Plugin identity card: name, version, author, links, and extra key-values. */
export function HostAboutSection({
  name,
  description,
  version,
  author,
  repository,
  issues,
  homepage,
  license = "MIT",
  links = [],
  extraItems = [],
  style,
}: HostAboutSectionProps) {
  const { colors } = useHostTheme();
  return (
    <View style={[styles.aboutContainer, style]}>
      <Text style={[styles.aboutName, { color: colors.foreground }]}>{name}</Text>
      {description ? (
        <Text style={[styles.aboutDescription, { color: colors.foregroundMuted }]}>
          {description}
        </Text>
      ) : null}
      <View style={styles.aboutMeta}>
        <HostBadge label={`v${version}`} variant="accent" size="sm" />
        {author ? (
          <Text style={[styles.aboutMetaText, { color: colors.foregroundMuted }]}>{author}</Text>
        ) : null}
        <Text style={[styles.aboutMetaText, { color: colors.foregroundMuted }]}>{license}</Text>
      </View>
      {extraItems.length > 0 ? (
        <View style={styles.aboutItems}>
          {extraItems.map((item) => (
            <HostKeyValue
              key={item.label}
              label={item.label}
              value={item.value}
              subValue={item.subValue}
              copyable={item.copyable}
            />
          ))}
        </View>
      ) : null}
      {links.length > 0 ? (
        <View style={styles.aboutLinks}>
          {links.map((link) => (
            <HostButton
              key={link.label}
              label={link.label}
              variant="ghost"
              size="sm"
              icon={link.icon}
              onPress={() => {
                // External URLs open via the host's Linking when available.
                import("react-native").then(({ Linking }) => {
                  Linking?.openURL?.(link.url).catch(() => {});
                });
              }}
            />
          ))}
        </View>
      ) : null}
      {repository ? (
        <Text style={[styles.aboutRepo, { color: colors.foregroundMuted }]}>{repository}</Text>
      ) : null}
    </View>
  );
}

// --- Attention beacon ------------------------------------------------------

export type HostAttentionBeaconMode = "radar" | "glow" | "pulse" | "badge";
export type HostAttentionBeaconTone = "warning" | "accent" | "danger";

export interface HostAttentionBeaconProps {
  children: ReactNode;
  mode?: HostAttentionBeaconMode;
  tone?: HostAttentionBeaconTone;
  color?: string;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
  badgeIcon?: string | ReactNode;
}

/**
 * Attention beacon: a host-themed dot/badge overlay that pulses while active.
 * Thin by design — no halo/radar animation machinery; the host owns motion.
 */
export function HostAttentionBeacon({
  children,
  mode = "pulse",
  tone = "warning",
  color,
  active = true,
  style,
  accessibilityLabel,
  testID,
  badgeIcon,
}: HostAttentionBeaconProps) {
  const { Icon } = getClientHost();
  const { colors, getStatusColor } = useHostTheme();
  const beaconColor = color ?? getStatusColor(tone === "warning" ? "warning" : tone === "danger" ? "danger" : "accent");

  const showDot = active && (mode === "pulse" || mode === "radar" || mode === "glow");
  const showBadge = active && mode === "badge";

  return (
    <View style={[styles.beaconContainer, style]}>
      {children}
      {showDot ? (
        <View
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.beaconDot,
            {
              backgroundColor: beaconColor,
              opacity: mode === "pulse" ? 0.75 : 1,
            },
          ]}
        />
      ) : null}
      {showBadge ? (
        <View style={styles.beaconBadge}>
          {badgeIcon ? (
            typeof badgeIcon === "string" ? (
              <Icon name={badgeIcon} size={10} color={colors.accentForeground} />
            ) : (
              badgeIcon
            )
          ) : (
            <View style={[styles.beaconDot, { backgroundColor: beaconColor }]} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  codeContainer: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  codeHeaderLeft: {
    flex: 1,
  },
  codeTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  codeLanguage: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  codeCopyButton: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 4,
  },
  codeScrollContent: {
    padding: spacing.md,
  },
  codeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  commandContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  commandTextContainer: {
    flexDirection: "row",
    flex: 1,
    flexShrink: 1,
  },
  commandPrompt: {
    fontSize: 12,
    fontWeight: "700",
  },
  commandArgs: {
    fontSize: 12,
  },
  commandCopyButton: {
    padding: 4,
  },
  truncatedContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  truncatedText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 12,
  },
  truncatedCopyBtn: {
    padding: 2,
  },
  interactiveRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  aboutContainer: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  aboutName: {
    fontSize: 16,
    fontWeight: "700",
  },
  aboutDescription: {
    fontSize: 12,
  },
  aboutMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  aboutMetaText: {
    fontSize: 11,
  },
  aboutItems: {
    gap: spacing.xs,
    width: "100%",
  },
  aboutLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  aboutRepo: {
    fontSize: 10,
  },
  beaconContainer: {
    position: "relative",
  },
  beaconDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  beaconBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
