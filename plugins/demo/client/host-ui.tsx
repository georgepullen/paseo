import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  Icon,
  ScrollView as HostScrollView,
  TextInput as HostTextInput,
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
 * Plugin-local presentation layer for `plugins/demo`.
 *
 * The frozen helper `client/` bespoke UI kit is being amputated
 * (xpufx-org/paseo#847/#924/#937). The host SDK ships no Card/Badge/Button/
 * gauge/table primitives, so the demo composes the pieces it actually renders
 * here, over the host `theme` (`useDemoTheme`), host `Icon`/`copyText`/
 * `useToast`/`ScrollView`/`TextInput` and plain React Native. It is deliberately
 * plugin-local: not a shared design system, and nothing is added to the helper.
 */

// --- theme -----------------------------------------------------------------

export interface DemoTypographyToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600" | "700";
}

export interface DemoTypographyScale {
  title: DemoTypographyToken;
  heading: DemoTypographyToken;
  body: DemoTypographyToken;
  bodyStrong: DemoTypographyToken;
  bodySmall: DemoTypographyToken;
  caption: DemoTypographyToken;
  label: DemoTypographyToken;
}

const DEMO_TYPOGRAPHY: DemoTypographyScale = {
  title: { fontSize: 15, lineHeight: 21, fontWeight: "600" },
  heading: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
  body: { fontSize: 12, lineHeight: 18, fontWeight: "400" },
  bodyStrong: { fontSize: 12, lineHeight: 18, fontWeight: "600" },
  bodySmall: { fontSize: 11, lineHeight: 15, fontWeight: "400" },
  caption: { fontSize: 10, lineHeight: 14, fontWeight: "400" },
  label: { fontSize: 11, lineHeight: 15, fontWeight: "600" },
};

export interface DemoTheme {
  colors: ThemeColors;
  alpha: (color: string, opacity: number) => string;
  getStatusColor: (variant: StatusVariant) => string;
  getVariantPalette: (variant: StatusVariant) => { bg: string; text: string; border: string };
  typography: DemoTypographyScale;
  touchTargetMin: number;
}

/**
 * Demo theme accessor backed by the lifecycle `HostThemeProvider` colors, plus
 * the plugin's own dense type scale. The host `theme` prop carries colors but no
 * typography, so the demo pins its scale here instead of the deleted `client/`
 * flair/density machinery.
 */
export function useDemoTheme(): DemoTheme {
  const host = useHostTheme();
  return {
    colors: host.colors,
    alpha: host.alpha,
    getStatusColor: host.getStatusColor,
    getVariantPalette: host.getVariantPalette,
    typography: DEMO_TYPOGRAPHY,
    touchTargetMin: 44,
  };
}

/** Host theme provider for the plugin's pill and sidebar surfaces. */
export { HostThemeProvider } from "paseo-plugin-helper/lifecycle";

// --- layout ----------------------------------------------------------------

export interface StackProps {
  children?: ReactNode;
  gap?: number;
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  style?: StyleProp<ViewStyle>;
}

export function Stack({ children, gap = 8, align, justify, style }: StackProps) {
  return (
    <View
      style={[
        { flexDirection: "column", width: "100%", gap },
        align !== undefined && { alignItems: align },
        justify !== undefined && { justifyContent: justify },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface ActionBarProps {
  children: ReactNode;
  align?: "flex-start" | "flex-end" | "center" | "space-between";
  direction?: "row" | "column";
  style?: StyleProp<ViewStyle>;
}

export function ActionBar({ children, align = "flex-end", direction = "row", style }: ActionBarProps) {
  const isColumn = direction === "column";
  return (
    <View
      style={[
        { flexDirection: isColumn ? "column" : "row", flexWrap: "wrap", gap: 8 },
        { justifyContent: isColumn ? "flex-start" : align, alignItems: isColumn ? "stretch" : "center" },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface FormRowProps {
  label: string;
  description?: string;
  children: ReactNode;
  layout?: "stacked" | "inline";
  style?: StyleProp<ViewStyle>;
}

export function FormRow({ label, description, children, layout = "stacked", style }: FormRowProps) {
  const { colors, typography } = useDemoTheme();
  return (
    <View
      style={[
        { gap: 4, width: "100%" },
        layout === "inline" && { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        style,
      ]}
    >
      <View style={{ gap: 2, flexShrink: 1, minWidth: 0 }}>
        <Text style={[{ color: colors.foreground }, typography.label]}>{label}</Text>
        {description ? (
          <Text style={[{ color: colors.foregroundMuted }, typography.caption]}>{description}</Text>
        ) : null}
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

export interface SectionHeaderProps {
  title: string;
  count?: number;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, count, style }: SectionHeaderProps) {
  const { colors, typography } = useDemoTheme();
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          { color: colors.foregroundMuted, letterSpacing: 0.4, textTransform: "uppercase" },
          typography.caption,
        ]}
      >
        {title}
      </Text>
      {count !== undefined ? <Badge label={String(count)} variant={count > 0 ? "warning" : "neutral"} size="sm" /> : null}
    </View>
  );
}

// --- card ------------------------------------------------------------------

export type SurfaceVariant = "flat" | "tinted" | "elevated";

export interface CardProps {
  children: ReactNode;
  variant?: SurfaceVariant;
  style?: StyleProp<ViewStyle>;
  noPadding?: boolean;
}

export interface CardHeaderProps {
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

export function CardHeader({
  title,
  subtitle,
  value,
  badge,
  action,
  icon,
  style,
  titleStyle,
  subtitleStyle,
}: CardHeaderProps) {
  const { colors, typography } = useDemoTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          width: "100%",
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
        {icon ? <Icon name={icon} size={15} color={colors.foregroundMuted} /> : null}
        <View style={{ gap: 1, flexShrink: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[{ color: colors.foreground }, typography.heading, titleStyle]}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[{ color: colors.foregroundMuted }, typography.caption, subtitleStyle]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {badge ? <View style={{ marginRight: 4 }}>{badge}</View> : null}
        {typeof value === "string" || typeof value === "number" ? (
          <Text style={[{ color: colors.foreground }, typography.bodyStrong]}>{value}</Text>
        ) : (
          value
        )}
        {action}
      </View>
    </View>
  );
}

export function Card({ children, variant, style, noPadding = false }: CardProps) {
  const { colors, alpha } = useDemoTheme();
  const effective = variant ?? "flat";
  let backgroundColor = colors.surface0;
  let borderColor = colors.border;
  if (effective === "tinted") {
    backgroundColor = alpha(colors.accent, 0.04);
    borderColor = alpha(colors.accent, 0.2);
  } else if (effective === "elevated") {
    backgroundColor = colors.surface1;
  }
  return (
    <View
      style={[
        {
          width: "100%",
          overflow: "hidden",
          backgroundColor,
          borderColor,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: noPadding ? 0 : 12,
          paddingVertical: noPadding ? 0 : 10,
          gap: 8,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

Card.Header = CardHeader;

// --- badge / status --------------------------------------------------------

export type BadgeStyle = "tinted" | "outline" | "solid";
export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  label: string;
  variant?: StatusVariant;
  styleVariant?: BadgeStyle;
  size?: BadgeSize;
  icon?: string | ReactNode;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Badge({
  label,
  variant = "neutral",
  styleVariant = "tinted",
  size = "md",
  icon,
  dot = false,
  style,
  textStyle,
}: BadgeProps) {
  const { colors, getVariantPalette, getStatusColor, typography } = useDemoTheme();
  const fontSize = size === "sm" ? 10 : typography.caption.fontSize;
  const lineHeight = size === "sm" ? 12 : typography.caption.lineHeight;
  const palette = getVariantPalette(variant);
  let backgroundColor = palette.bg;
  let borderColor = palette.border;
  let textColor = palette.text;
  if (styleVariant === "outline") {
    backgroundColor = "transparent";
    borderColor = palette.border;
    textColor = palette.text;
  } else if (styleVariant === "solid") {
    backgroundColor = getStatusColor(variant);
    borderColor = "transparent";
    textColor = colors.accentForeground;
  }
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          borderWidth: 1,
          borderRadius: 9999,
          gap: 4,
          flexShrink: 1,
          maxWidth: "100%",
          backgroundColor,
          borderColor,
          paddingVertical: size === "sm" ? 1 : 2,
          paddingHorizontal: size === "sm" ? 5 : 8,
        },
        style,
      ]}
    >
      {dot ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: textColor }} />
      ) : typeof icon === "string" ? (
        <Icon name={icon} size={size === "sm" ? 10 : 11} color={textColor} />
      ) : (
        icon
      )}
      <Text
        accessibilityLabel={label}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[{ color: textColor, fontSize, lineHeight, fontWeight: "600", flexShrink: 1 }, textStyle]}
      >
        {label}
      </Text>
    </View>
  );
}

export interface StatusDotProps {
  variant?: StatusVariant;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function StatusDot({ variant = "neutral", size = "md", pulse = false, style }: StatusDotProps) {
  const { getStatusColor } = useDemoTheme();
  const dimension = size === "sm" ? 6 : size === "lg" ? 10 : 8;
  return (
    <View
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: getStatusColor(variant),
          opacity: pulse ? 0.6 : 1,
        },
        style,
      ]}
    />
  );
}

// --- attention -------------------------------------------------------------

export type AttentionBeaconMode = "radar" | "ring" | "glow" | "badge" | "bounce" | "pulse";
export type AttentionBeaconTone = "warning" | "accent" | "danger";
export type ButtonAttention = boolean | "radar" | "glow" | "bounce";

export interface AttentionBeaconProps {
  children: ReactNode;
  mode?: AttentionBeaconMode;
  tone?: AttentionBeaconTone;
  color?: string;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  haloStyle?: StyleProp<ViewStyle>;
  badgeStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
  badgeIcon?: string | ReactNode;
  duration?: number;
  easing?: (value: number) => number;
}

function normalizeBeaconMode(mode?: AttentionBeaconMode): "radar" | "glow" | "badge" | "bounce" | "pulse" {
  if (mode === "ring") return "radar";
  if (mode === "glow" || mode === "badge" || mode === "bounce" || mode === "pulse" || mode === "radar") {
    return mode;
  }
  return "radar";
}

function resolveBeaconToneColor(
  colors: ThemeColors,
  tone: AttentionBeaconTone = "warning",
  customColor?: string,
): string {
  if (customColor) return customColor;
  if (tone === "danger") return colors.statusDanger;
  if (tone === "accent") return colors.accent;
  return colors.statusWarning;
}

function useLoop(driver: Animated.Value, toValue: number, duration: number, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    driver.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(driver, { toValue, duration, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(driver, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [driver, toValue, duration, active]);
}

function usePingPong(
  driver: Animated.Value,
  duration: number,
  active: boolean,
  easing: (value: number) => number = Easing.linear,
): void {
  useEffect(() => {
    if (!active) return;
    driver.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(driver, { toValue: 1, duration, easing, useNativeDriver: true }),
        Animated.timing(driver, { toValue: 0, duration, easing, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [driver, duration, active, easing]);
}

export function AttentionBeacon({
  children,
  mode = "radar",
  tone = "warning",
  color,
  active = true,
  style,
  haloStyle,
  badgeStyle,
  accessibilityLabel,
  testID,
  badgeIcon,
  duration = 900,
  easing = Easing.linear,
}: AttentionBeaconProps) {
  const { colors } = useDemoTheme();
  const resolved = normalizeBeaconMode(mode);
  const beaconColor = resolveBeaconToneColor(colors, tone, color);

  const radar = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const pip = useRef(new Animated.Value(0)).current;
  const jiggle = useRef(new Animated.Value(0)).current;
  const pulseDriver = useRef(new Animated.Value(0)).current;

  const isRadar = resolved === "radar" && active;
  const isGlow = resolved === "glow" && active;
  const isBadge = resolved === "badge" && active;
  const isBounce = resolved === "bounce" && active;
  const isPulse = resolved === "pulse" && active;

  useLoop(radar, 1, 1600, isRadar);
  usePingPong(breath, 900, isGlow);
  usePingPong(pip, 900, isBadge);
  usePingPong(jiggle, 350, isBounce);
  usePingPong(pulseDriver, duration, isPulse, easing);

  if (!active) {
    return <View style={[BEACON_STYLES.wrapper, style]}>{children}</View>;
  }

  if (resolved === "glow") {
    const opacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
    return (
      <View style={[BEACON_STYLES.wrapper, style]} accessibilityLabel={accessibilityLabel} testID={testID}>
        {children}
        <Animated.View
          pointerEvents="none"
          testID={testID ? `${testID}-glow` : undefined}
          style={[BEACON_STYLES.glowHalo, { borderColor: beaconColor, opacity }, haloStyle]}
        />
      </View>
    );
  }

  if (resolved === "badge") {
    const opacity = pip.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
    const scale = pip.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
    const hasIcon = badgeIcon !== undefined && badgeIcon !== null && badgeIcon !== "";
    const iconColor = colors.accentForeground;
    return (
      <View style={[BEACON_STYLES.wrapper, style]} accessibilityLabel={accessibilityLabel} testID={testID}>
        {children}
        <Animated.View
          pointerEvents="none"
          testID={testID ? `${testID}-badge` : undefined}
          style={[
            BEACON_STYLES.pip,
            { backgroundColor: beaconColor, opacity, transform: [{ scale }] },
            hasIcon && BEACON_STYLES.pipWithIcon,
            badgeStyle,
          ]}
        >
          {hasIcon ? (
            typeof badgeIcon === "string" ? (
              <Icon name={badgeIcon} size={10} color={iconColor} />
            ) : (
              badgeIcon
            )
          ) : null}
        </Animated.View>
      </View>
    );
  }

  if (resolved === "bounce") {
    const translateY = jiggle.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
    return (
      <View style={[BEACON_STYLES.wrapper, style]} accessibilityLabel={accessibilityLabel} testID={testID}>
        <Animated.View style={{ transform: [{ translateY }] }}>{children}</Animated.View>
      </View>
    );
  }

  if (resolved === "pulse") {
    const opacity = pulseDriver.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
    return (
      <View style={[BEACON_STYLES.wrapper, style]} accessibilityLabel={accessibilityLabel} testID={testID}>
        <Animated.View testID={testID ? `${testID}-pulse` : undefined} style={{ opacity }}>
          {children}
        </Animated.View>
      </View>
    );
  }

  const scale = radar.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const opacity = radar.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  return (
    <View style={[BEACON_STYLES.wrapper, style]} accessibilityLabel={accessibilityLabel} testID={testID}>
      <Animated.View
        pointerEvents="none"
        testID={testID ? `${testID}-halo` : undefined}
        style={[BEACON_STYLES.radarHalo, { borderColor: beaconColor, opacity, transform: [{ scale }] }, haloStyle]}
      />
      {children}
    </View>
  );
}

const BEACON_STYLES = {
  wrapper: { position: "relative" } as ViewStyle,
  radarHalo: { position: "absolute", top: -4, left: -4, right: -4, bottom: -4, borderWidth: 2, borderRadius: 12 } as ViewStyle,
  glowHalo: { position: "absolute", top: -2, left: -2, right: -2, bottom: -2, borderWidth: 2, borderRadius: 10 } as ViewStyle,
  pip: { position: "absolute", top: -4, right: -4, width: 10, height: 10, borderRadius: 5 } as ViewStyle,
  pipWithIcon: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" } as ViewStyle,
};

function resolveButtonAttentionMode(attention?: ButtonAttention): AttentionBeaconMode | null {
  if (!attention) return null;
  if (attention === true) return "radar";
  return attention;
}

function resolveButtonAttentionTone(variant: ButtonVariant): AttentionBeaconTone {
  if (variant === "danger") return "danger";
  if (variant === "primary") return "accent";
  return "warning";
}

// --- button ----------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label?: string;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string | ReactNode;
  iconPosition?: "left" | "right";
  onPress?: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
  attention?: ButtonAttention;
}

export function Button({
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
  attention,
}: ButtonProps) {
  const { colors, alpha, touchTargetMin } = useDemoTheme();
  const paddingVertical = size === "sm" ? 6 : size === "lg" ? 12 : 10;
  const paddingHorizontal = size === "sm" ? 10 : size === "lg" ? 18 : 14;
  const fontSize = size === "sm" ? 12 : size === "lg" ? 15 : 13;
  let backgroundColor = "transparent";
  let borderColor = "transparent";
  let textColor = colors.foreground;
  if (variant === "primary") {
    backgroundColor = colors.accent;
    textColor = colors.accentForeground;
  } else if (variant === "danger") {
    backgroundColor = alpha(colors.statusDanger, 0.15);
    borderColor = alpha(colors.statusDanger, 0.4);
    textColor = colors.statusDanger;
  } else if (variant === "ghost") {
    textColor = colors.foregroundMuted;
  } else {
    backgroundColor = colors.surface1;
    borderColor = colors.border;
  }
  const renderedIcon =
    typeof icon === "string" ? (
      <Icon name={icon} size={size === "sm" ? 12 : size === "lg" ? 16 : 14} color={textColor} />
    ) : (
      icon ?? null
    );
  const contentHeight = Math.round(fontSize * 1.2) + paddingVertical * 2;
  const hitSlopSide = Math.max(0, (touchTargetMin - contentHeight) / 2);
  const pressable = (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={hitSlopSide}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          flexShrink: 1,
          maxWidth: "100%",
          backgroundColor: pressed && !disabled ? alpha(backgroundColor, 0.8) : backgroundColor,
          borderColor,
          borderWidth: borderColor !== "transparent" ? 1 : 0,
          borderRadius: 10,
          paddingVertical,
          paddingHorizontal,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : children ? (
        children
      ) : (
        <>
          {iconPosition === "left" ? renderedIcon : null}
          {label !== undefined ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[{ color: textColor, fontSize, fontWeight: "600", textAlign: "center", flexShrink: 1 }, textStyle]}
            >
              {label}
            </Text>
          ) : null}
          {iconPosition === "right" ? renderedIcon : null}
        </>
      )}
    </Pressable>
  );
  const attentionMode = resolveButtonAttentionMode(attention);
  if (!attentionMode) return pressable;
  return (
    <AttentionBeacon mode={attentionMode} tone={resolveButtonAttentionTone(variant)}>
      {pressable}
    </AttentionBeacon>
  );
}

// --- inputs ----------------------------------------------------------------

export interface TextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "numeric" | "number-pad" | "url";
  secureTextEntry?: boolean;
  multiline?: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  onSubmitEditing?: () => void;
}

export function TextInput({
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  secureTextEntry = false,
  multiline = false,
  style,
  inputStyle,
  onSubmitEditing,
}: TextInputProps) {
  const { colors } = useDemoTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ width: "100%" }, style]}>
      <HostTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundMuted}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          {
            color: colors.foreground,
            backgroundColor: colors.surface0,
            borderColor: focused ? colors.accent : colors.border,
            borderWidth: 1,
            borderRadius: 8,
            minHeight: multiline ? 64 : 40,
            paddingHorizontal: 12,
            paddingVertical: 8,
            fontSize: 14,
          },
          inputStyle,
        ]}
      />
    </View>
  );
}

export interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export function SearchInput({
  value,
  onChangeText,
  placeholder = "Search...",
  onClear,
  style,
  inputStyle,
}: SearchInputProps) {
  const { colors } = useDemoTheme();
  const handleClear = () => {
    onChangeText("");
    onClear?.();
  };
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderRadius: 8,
          backgroundColor: colors.surface1,
          borderColor: colors.border,
          minHeight: 40,
          paddingHorizontal: 10,
        },
        style,
      ]}
    >
      <View style={{ marginRight: 8, alignItems: "center", justifyContent: "center" }}>
        <Icon name="Search" size={16} color={colors.foregroundMuted} />
      </View>
      <HostTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundMuted}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={[{ flex: 1, paddingVertical: 6, color: colors.foreground, fontSize: 13 }, inputStyle]}
      />
      {value ? (
        <Pressable
          onPress={handleClear}
          style={{ padding: 4, marginLeft: 4 }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Icon name="X" size={14} color={colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Toggle({ value, onValueChange, label, description, disabled = false, style }: ToggleProps) {
  const { colors, alpha, typography } = useDemoTheme();
  const handlePress = () => {
    if (!disabled) onValueChange(!value);
  };
  const trackWidth = 38;
  const trackHeight = 22;
  const thumbSize = 16;
  const thumbPadding = 3;
  const thumbPosition = value ? trackWidth - thumbSize - thumbPadding : thumbPadding;
  const hasText = Boolean(label || description);
  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: hasText ? "space-between" : "center",
          gap: 8,
          width: hasText ? "100%" : "auto",
          minHeight: 40,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {hasText ? (
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          {label ? <Text style={[{ color: colors.foreground }, typography.label]}>{label}</Text> : null}
          {description ? (
            <Text style={[{ color: colors.foregroundMuted }, typography.caption]}>{description}</Text>
          ) : null}
        </View>
      ) : null}
      <View
        style={{
          width: trackWidth,
          height: trackHeight,
          borderRadius: trackHeight / 2,
          justifyContent: "center",
          overflow: "hidden",
          backgroundColor: value ? colors.accent : alpha(colors.foregroundMuted, 0.35),
        }}
      >
        <View
          style={{
            position: "absolute",
            top: thumbPadding,
            left: 0,
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            backgroundColor: colors.accentForeground,
            transform: [{ translateX: thumbPosition }],
          }}
        />
      </View>
    </Pressable>
  );
}

// --- key / value -----------------------------------------------------------

export interface KeyValueProps {
  label: string;
  value: string | number | null | undefined;
  subValue?: string;
  mono?: boolean;
  copyable?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
}

export function KeyValue({
  label,
  value,
  subValue,
  mono = false,
  copyable = false,
  style,
  labelStyle,
  valueStyle,
}: KeyValueProps) {
  const { colors, typography } = useDemoTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const rawString = value === null || value === undefined ? "" : String(value);
  const handleCopy = async () => {
    if (!copyable || !rawString) return;
    try {
      await copyText(rawString);
      toast?.show?.(label);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.error?.("Copy failed");
    }
  };
  return (
    <View style={[{ gap: 2, width: "100%" }, style]}>
      <Text numberOfLines={1} style={[{ color: colors.foregroundMuted }, typography.caption, labelStyle]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text
          selectable
          numberOfLines={1}
          ellipsizeMode="middle"
          style={[
            {
              color: colors.foreground,
              flexShrink: 1,
              minWidth: 0,
              fontFamily: mono ? "monospace" : undefined,
            },
            typography.body,
            valueStyle,
          ]}
        >
          {rawString || "-"}
        </Text>
        {copyable && rawString ? (
          <Pressable
            onPress={handleCopy}
            hitSlop={8}
            style={{ padding: 2 }}
            accessibilityRole="button"
            accessibilityLabel={`Copy ${label}`}
          >
            <Icon
              name={copied ? "Check" : "Copy"}
              size={13}
              color={copied ? colors.statusSuccess : colors.foregroundMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {subValue ? (
        <Text numberOfLines={1} style={[{ color: colors.foregroundMuted }, typography.caption]}>
          {subValue}
        </Text>
      ) : null}
    </View>
  );
}

export interface KeyValueGroupProps {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

export function KeyValueGroup({ children, columns = 2, gap = 12, style }: KeyValueGroupProps) {
  const childArray = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", width: "100%", gap }, style]}>
      {childArray.map((child, index) => (
        <View key={index} style={{ flexGrow: 1, flexShrink: 1, flexBasis: `${Math.floor(100 / columns) - 2}%` }}>
          {child}
        </View>
      ))}
    </View>
  );
}

// --- empty state -----------------------------------------------------------

export interface EmptyStateProps {
  icon?: string | ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon = "Inbox", title, description, actionLabel, onAction, style }: EmptyStateProps) {
  const { colors, typography } = useDemoTheme();
  return (
    <View style={[{ alignItems: "center", justifyContent: "center", gap: 8, padding: 24 }, style]}>
      {typeof icon === "string" ? (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surface1,
          }}
        >
          <Icon name={icon} size={32} color={colors.foregroundMuted} />
        </View>
      ) : (
        icon
      )}
      <Text style={[{ color: colors.foreground, textAlign: "center" }, typography.title]}>{title}</Text>
      {description ? (
        <Text style={[{ color: colors.foregroundMuted, textAlign: "center" }, typography.body]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: 4 }}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" />
        </View>
      ) : null}
    </View>
  );
}

// --- code ------------------------------------------------------------------

export interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  maxHeight?: number;
  copyable?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function CodeBlock({ code, language, title, maxHeight = 320, copyable = true, style, textStyle }: CodeBlockProps) {
  const { colors, alpha, typography } = useDemoTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await copyText(code);
      toast?.show?.(title || "Code");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.error?.("Copy failed");
    }
  };
  return (
    <View
      style={[
        { borderWidth: 1, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface0, borderColor: colors.border },
        style,
      ]}
    >
      {title || language || copyable ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderBottomWidth: 1,
            borderBottomColor: alpha(colors.border, 0.7),
          }}
        >
          <Text style={[{ color: title ? colors.foreground : colors.foregroundMuted, fontWeight: "600" }, typography.caption]}>
            {title ?? (language ? language.toUpperCase() : "")}
          </Text>
          {copyable ? (
            <Pressable onPress={handleCopy} accessibilityRole="button" accessibilityLabel="Copy code" hitSlop={4} style={{ padding: 4 }}>
              <Icon
                name={copied ? "Check" : "Copy"}
                size={12}
                color={copied ? colors.statusSuccess : colors.foregroundMuted}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <HostScrollView style={{ maxHeight }} contentContainerStyle={{ padding: 12 }}>
        <Text selectable style={[{ color: colors.foreground, fontSize: 12, lineHeight: 18, fontFamily: "monospace" }, textStyle]}>
          {code}
        </Text>
      </HostScrollView>
    </View>
  );
}

// --- data table ------------------------------------------------------------

export interface DataColumn<T> {
  key: string;
  header: string;
  flex?: number;
  width?: number;
  align?: "left" | "center" | "right";
  render: (item: T) => ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataColumn<T>[];
  keyExtractor: (item: T, index: number) => string;
  emptyState?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function DataTable<T>({ data, columns, keyExtractor, emptyState, style }: DataTableProps<T>) {
  const { colors, typography } = useDemoTheme();
  if (!data || data.length === 0) {
    return emptyState ? <View style={style}>{emptyState}</View> : null;
  }
  const cellStyle = (col: DataColumn<T>): StyleProp<ViewStyle> => ({
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...(col.flex !== undefined ? { flex: col.flex } : { flex: 1 }),
    ...(col.width !== undefined ? { width: col.width } : null),
    alignItems: col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start",
  });
  return (
    <View style={[{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface0, borderRadius: 8, overflow: "hidden" }, style]}>
      <View style={{ flexDirection: "row", backgroundColor: colors.surface1, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {columns.map((col) => (
          <View key={col.key} style={cellStyle(col)}>
            <Text
              numberOfLines={1}
              style={[{ color: colors.foregroundMuted, fontWeight: "600", textTransform: "uppercase" }, typography.caption]}
            >
              {col.header}
            </Text>
          </View>
        ))}
      </View>
      {data.map((item, idx) => (
        <View
          key={keyExtractor(item, idx)}
          style={[
            { flexDirection: "row" },
            idx < data.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
          ]}
        >
          {columns.map((col) => (
            <View key={col.key} style={cellStyle(col)}>
              {col.render(item)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// --- collapsible -----------------------------------------------------------

export interface CollapsibleProps {
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
}

export function Collapsible({
  title,
  subtitle,
  children,
  initiallyExpanded = false,
  isExpanded: controlled,
  onToggle,
  badge,
  headerRight,
  icon,
  style,
  headerStyle,
  contentStyle,
}: CollapsibleProps) {
  const { colors, typography } = useDemoTheme();
  const [internal, setInternal] = useState(initiallyExpanded);
  const expanded = controlled !== undefined ? controlled : internal;
  const toggle = () => {
    const next = !expanded;
    if (controlled === undefined) setInternal(next);
    onToggle?.(next);
  };
  return (
    <View style={[{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden", width: "100%" }, style]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: 12,
            minHeight: 40,
            backgroundColor: pressed ? colors.surface1 : "transparent",
          },
          headerStyle,
        ]}
      >
        {icon ? <Icon name={icon} size={14} color={colors.foregroundMuted} /> : null}
        <View style={{ flex: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
          {typeof title === "string" ? (
            <Text numberOfLines={1} style={[{ color: colors.foreground }, typography.heading]}>
              {title}
            </Text>
          ) : (
            title
          )}
          {typeof subtitle === "string" ? (
            <Text numberOfLines={1} style={[{ color: colors.foregroundMuted }, typography.caption]}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )}
        </View>
        {badge}
        {headerRight}
        <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={14} color={colors.foregroundMuted} />
      </Pressable>
      {expanded ? (
        <View style={[{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }, contentStyle]}>{children}</View>
      ) : null}
    </View>
  );
}

// --- tabs ------------------------------------------------------------------

export interface TabItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: string;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  mode?: "auto" | "fit" | "scroll";
  style?: StyleProp<ViewStyle>;
}

export function Tabs({ tabs, activeTab, onTabChange, style }: TabsProps) {
  const { colors, alpha, typography } = useDemoTheme();
  return (
    <View
      style={[
        {
          width: "100%",
          maxWidth: "100%",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          overflow: "hidden",
          backgroundColor: colors.surface1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", width: "100%", padding: 3, gap: 4 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  borderRadius: 8,
                  flexGrow: 1,
                  flexShrink: 1,
                  minWidth: 0,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor: isActive ? colors.surface2 : pressed ? alpha(colors.surface2, 0.5) : "transparent",
                },
              ]}
            >
              {tab.icon ? (
                <Icon name={tab.icon} size={13} color={isActive ? colors.foreground : colors.foregroundMuted} />
              ) : null}
              <Text
                numberOfLines={1}
                style={[
                  {
                    color: isActive ? colors.foreground : colors.foregroundMuted,
                    fontWeight: isActive ? "600" : "500",
                    flexShrink: 1,
                    minWidth: 0,
                  },
                  typography.body,
                ]}
              >
                {tab.label}
              </Text>
              {tab.badge !== undefined ? (
                <View
                  style={{
                    borderRadius: 9999,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    minWidth: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isActive ? colors.accent : alpha(colors.foregroundMuted, 0.2),
                  }}
                >
                  <Text style={[{ color: isActive ? colors.accentForeground : colors.foregroundMuted, fontWeight: "700" }, typography.caption]}>
                    {tab.badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// --- metric gauge / progress ----------------------------------------------

export interface MetricGaugeProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  thresholds?: MetricThresholds;
  color?: string;
  autoStatusColor?: boolean;
  label?: string;
  showPercent?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function MetricGauge({
  value,
  size = 76,
  strokeWidth = 7,
  thresholds,
  color,
  autoStatusColor = true,
  label,
  showPercent = true,
  style,
}: MetricGaugeProps) {
  const { colors, typography } = useDemoTheme();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  let gaugeColor = color || colors.accent;
  if (!color && autoStatusColor) {
    const status = resolveMetricStatus(clamped, thresholds);
    gaugeColor =
      status === "danger"
        ? colors.statusDanger
        : status === "warning"
          ? colors.statusWarning
          : colors.statusSuccess;
  }
  const radius = size / 2;
  const innerSize = Math.max(0, size - strokeWidth * 2);
  const innerRadius = innerSize / 2;
  const trackColor = colors.surface2;
  const center = showPercent ? (
    <Text style={[{ color: colors.foreground, fontWeight: "700" }, typography.bodyStrong]}>{Math.round(clamped)}%</Text>
  ) : null;

  if (Platform.OS === "web") {
    const webBackground = `conic-gradient(${gaugeColor} 0% ${clamped}%, ${trackColor} ${clamped}% 100%)`;
    return (
      <View style={[{ alignItems: "center", gap: 6 }, style]}>
        <View
          style={[
            { alignItems: "center", justifyContent: "center", overflow: "hidden" },
            { width: size, height: size, borderRadius: radius },
            { background: webBackground } as unknown as ViewStyle,
          ]}
        >
          <View
            style={{
              width: innerSize,
              height: innerSize,
              borderRadius: innerRadius,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.surface0,
            }}
          >
            {center}
          </View>
        </View>
        {label ? <Text style={[{ color: colors.foregroundMuted }, typography.caption]}>{label}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[{ alignItems: "center", gap: 6 }, style]}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius,
            borderWidth: strokeWidth,
            borderColor: trackColor,
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            width: innerSize,
            height: innerSize,
            borderRadius: innerRadius,
            backgroundColor: gaugeColor,
            opacity: 0.25 + 0.75 * (clamped / 100),
          }}
        />
      </View>
      {label ? <Text style={[{ color: colors.foregroundMuted }, typography.caption]}>{label}</Text> : null}
    </View>
  );
}

export interface ProgressBarProps {
  value: number;
  color?: string;
  autoStatusColor?: boolean;
  thresholds?: MetricThresholds;
  label?: string;
  showValueText?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  value,
  color,
  autoStatusColor = true,
  thresholds,
  label,
  showValueText = false,
  height = 8,
  style,
}: ProgressBarProps) {
  const { colors, typography } = useDemoTheme();
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
    <View style={[{ gap: 4, width: "100%" }, style]}>
      {label || showValueText ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {label ? <Text style={[{ color: colors.foregroundMuted }, typography.caption]}>{label}</Text> : null}
          {showValueText ? (
            <Text style={[{ color: colors.foreground, fontWeight: "600" }, typography.caption]}>{Math.round(clamped)}%</Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ width: "100%", overflow: "hidden", backgroundColor: colors.surface2, height, borderRadius: height / 2 }}>
        <View style={{ height: "100%", width: `${clamped}%`, backgroundColor: barColor, borderRadius: height / 2 }} />
      </View>
    </View>
  );
}

// --- about -----------------------------------------------------------------

export interface AboutSectionProps {
  name: string;
  description?: string;
  version: string;
  author?: string;
  repository?: string;
  issues?: string;
  homepage?: string;
  license?: string;
  extraItems?: Array<{ label: string; value: string; subValue?: string; copyable?: boolean }>;
  style?: StyleProp<ViewStyle>;
}

export function AboutSection({
  name,
  description,
  version,
  author,
  repository,
  issues,
  homepage,
  license = "MIT",
  extraItems = [],
  style,
}: AboutSectionProps) {
  const { colors, typography } = useDemoTheme();
  const links = useMemo(
    () =>
      [
        repository ? { label: "Repository", url: repository, icon: "ExternalLink" } : null,
        issues ? { label: "Report Issue", url: issues, icon: "Bug" } : null,
        homepage ? { label: "Documentation", url: homepage, icon: "BookOpen" } : null,
      ].filter((link): link is { label: string; url: string; icon: string } => link !== null),
    [repository, issues, homepage],
  );
  return (
    <Card variant="elevated" style={style}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <Text style={[{ color: colors.foreground }, typography.title]}>{name}</Text>
          <Badge label={`v${version}`} variant="accent" size="sm" />
          <Badge label={license} variant="neutral" size="sm" />
        </View>
        {description ? (
          <Text style={[{ color: colors.foregroundMuted }, typography.body]}>{description}</Text>
        ) : null}
        {author ? <Text style={[{ color: colors.foregroundMuted }, typography.caption]}>by {author}</Text> : null}
      </View>
      {links.length > 0 ? (
        <ActionBar align="flex-start" direction="row" style={{ marginTop: 0 }}>
          {links.map((link) => (
            <Button
              key={link.url}
              label={link.label}
              icon={link.icon}
              variant="secondary"
              size="sm"
              onPress={() => {
                void Linking?.openURL?.(link.url).catch(() => {});
              }}
            />
          ))}
        </ActionBar>
      ) : null}
      {extraItems.length > 0 ? (
        <KeyValueGroup columns={2}>
          {extraItems.map((item) => (
            <KeyValue key={item.label} label={item.label} value={item.value} subValue={item.subValue} copyable={item.copyable} />
          ))}
        </KeyValueGroup>
      ) : null}
    </Card>
  );
}

// --- modal / scroll hosts --------------------------------------------------

export interface HostModalSectionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fluid plain View for the composer-pill body: the host already provides the
 * one `<Modal.Content>` (centered) or popover scroller, so this never nests a
 * second scroller or a host modal frame.
 */
export function HostModalSection({ children, style }: HostModalSectionProps) {
  return <View style={[{ width: "100%" }, style]}>{children}</View>;
}

export interface HostScrollProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/** Explicit single scroll owner for sidebar surfaces the host does not scroll. */
export function HostScroll({ children, style, contentContainerStyle }: HostScrollProps) {
  return (
    <HostScrollView style={[{ width: "100%" }, style]} contentContainerStyle={contentContainerStyle}>
      {children}
    </HostScrollView>
  );
}
