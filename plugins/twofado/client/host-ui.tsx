import React, { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView as RNScrollView,
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
import type { StatusVariant } from "paseo-plugin-helper/shared";

/**
 * Local composition of the presentational pieces plugins/twofado used to
 * import from the frozen `paseo-plugin-helper/client` kit (xpufx-org/paseo#937,
 * #924). The host SDK owns the design language and provides the primitives
 * that carry host behaviour (`Icon`, `ScrollView`, `TextInput`, `copyText`,
 * `useToast`); everything here is plain React Native layout and host theme
 * token composition, kept to the components this plugin actually renders.
 *
 * The module deliberately keeps the previous component names and prop shapes
 * so call sites only change the import path.
 */

const MONO_FONT = "monospace";

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
  const { colors } = useHostTheme();
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minWidth: 0,
        }}
      >
        {icon ? <Icon name={icon} size={15} color={colors.foregroundMuted} /> : null}
        <View style={{ gap: 1, flexShrink: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={[{ color: colors.foreground, fontSize: 15, fontWeight: "600" }, titleStyle]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={[{ color: colors.foregroundMuted, fontSize: 11 }, subtitleStyle]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {badge ? <View style={{ marginRight: 6 }}>{badge}</View> : null}
        {typeof value === "string" || typeof value === "number" ? (
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{value}</Text>
        ) : (
          value
        )}
        {action}
      </View>
    </View>
  );
}

export function Card({ children, variant, style, noPadding = false }: CardProps) {
  const { colors, alpha } = useHostTheme();
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
          overflow: "hidden",
          width: "100%",
          backgroundColor,
          borderColor,
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: noPadding ? 0 : 12,
          paddingVertical: noPadding ? 0 : 8,
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
  const { colors, getVariantPalette, getStatusColor } = useHostTheme();
  const fontSize = size === "sm" ? 10 : 11;
  const lineHeight = size === "sm" ? 12 : 15;
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
        style={[
          { color: textColor, fontSize, lineHeight, fontWeight: "600", flexShrink: 1 },
          textStyle,
        ]}
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
  const { getStatusColor } = useHostTheme();
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
}: ButtonProps) {
  const { colors, alpha } = useHostTheme();
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={4}
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
          borderRadius: 8,
          paddingVertical,
          paddingHorizontal,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {iconPosition === "left" ? renderedIcon : null}
          {label !== undefined || children ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[
                { color: textColor, fontSize, fontWeight: "600", textAlign: "center", flexShrink: 1 },
                textStyle,
              ]}
            >
              {children ?? label}
            </Text>
          ) : null}
          {iconPosition === "right" ? renderedIcon : null}
        </>
      )}
    </Pressable>
  );
}

// --- toggle ----------------------------------------------------------------

export interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Toggle({
  value,
  onValueChange,
  label,
  description,
  disabled = false,
  style,
}: ToggleProps) {
  const { colors, alpha } = useHostTheme();
  const trackWidth = 38;
  const trackHeight = 22;
  const thumbSize = 16;
  const thumbPadding = 3;
  const hasText = Boolean(label || description);
  return (
    <Pressable
      onPress={() => {
        if (!disabled) onValueChange(!value);
      }}
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
        <View style={{ flex: 1, gap: 1 }}>
          {label ? (
            <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{label}</Text>
          ) : null}
          {description ? (
            <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{description}</Text>
          ) : null}
        </View>
      ) : null}
      <View
        style={{
          width: trackWidth,
          height: trackHeight,
          borderRadius: trackHeight / 2,
          backgroundColor: value ? colors.accent : alpha(colors.foregroundMuted, 0.35),
          justifyContent: "center",
        }}
      >
        <View
          style={{
            position: "absolute",
            top: thumbPadding,
            left: value ? trackWidth - thumbSize - thumbPadding : thumbPadding,
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            backgroundColor: colors.accentForeground,
          }}
        />
      </View>
    </Pressable>
  );
}

// --- inputs ----------------------------------------------------------------

export interface TextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  errorText?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  disabled?: boolean;
  mono?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export function TextInput({
  value,
  onChangeText,
  label,
  placeholder,
  helperText,
  errorText,
  secureTextEntry = false,
  autoCapitalize = "none",
  autoCorrect = false,
  disabled = false,
  mono = false,
  multiline = false,
  numberOfLines = 1,
  style,
  inputStyle,
}: TextInputProps) {
  const { colors } = useHostTheme();
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(errorText);
  const borderColor = hasError ? colors.statusDanger : focused ? colors.accent : colors.border;
  return (
    <View style={[{ gap: 4, width: "100%" }, style]}>
      {label ? (
        <Text
          style={{
            color: hasError ? colors.statusDanger : colors.foreground,
            fontSize: 13,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      ) : null}
      <HostTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundMuted}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        editable={!disabled}
        multiline={multiline}
        numberOfLines={numberOfLines}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          {
            color: colors.foreground,
            backgroundColor: colors.surface0,
            borderColor,
            borderWidth: 1,
            borderRadius: 8,
            minHeight: multiline ? 64 : 40,
            paddingHorizontal: 12,
            paddingVertical: 8,
            fontSize: 14,
            fontFamily: mono ? MONO_FONT : undefined,
          },
          inputStyle,
        ]}
      />
      {errorText ? (
        <Text style={{ color: colors.statusDanger, fontSize: 11 }}>{errorText}</Text>
      ) : helperText ? (
        <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{helperText}</Text>
      ) : null}
    </View>
  );
}

// --- select ----------------------------------------------------------------

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  label?: string;
  size?: "sm" | "md";
  placeholder?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Select({
  value,
  options,
  onValueChange,
  label,
  size = "md",
  placeholder = "Select…",
  disabled = false,
  style,
}: SelectProps) {
  const { colors, alpha } = useHostTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const display = selected?.label ?? (value || placeholder);
  const canOpen = !disabled && options.length > 0;
  const isOpen = open && canOpen;
  return (
    <View style={[{ width: "100%" }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${display}` : display}
        accessibilityState={{ expanded: isOpen, disabled }}
        disabled={!canOpen}
        onPress={() => setOpen((prev) => !prev)}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            borderWidth: 1,
            borderRadius: 8,
            minHeight: size === "sm" ? 28 : 34,
            paddingVertical: size === "sm" ? 3 : 6,
            paddingHorizontal: size === "sm" ? 8 : 10,
            borderColor: isOpen ? colors.accent : colors.border,
            backgroundColor: pressed ? colors.surface2 : colors.surface0,
            opacity: disabled || !canOpen ? 0.5 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            color: colors.foreground,
            fontSize: size === "sm" ? 10 : 12,
            fontWeight: selected ? "600" : "500",
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          {display}
        </Text>
        <Icon
          name={isOpen ? "ChevronUp" : "ChevronDown"}
          size={size === "sm" ? 12 : 14}
          color={colors.foregroundMuted}
        />
      </Pressable>
      {isOpen ? (
        <View
          style={{
            marginTop: 4,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            backgroundColor: colors.surface0,
            overflow: "hidden",
          }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  {
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    backgroundColor: isSelected
                      ? colors.surface2
                      : pressed
                        ? alpha(colors.surface2, 0.5)
                        : "transparent",
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: isSelected ? colors.foreground : colors.foregroundMuted,
                    fontSize: 13,
                    fontWeight: isSelected ? "600" : "400",
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
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
  const { colors } = useHostTheme();
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
      <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600", textAlign: "center" }}>
        {title}
      </Text>
      {description ? (
        <Text style={{ color: colors.foregroundMuted, fontSize: 12, textAlign: "center" }}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: 4 }}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" size="sm" />
        </View>
      ) : null}
    </View>
  );
}

// --- key value -------------------------------------------------------------

export interface KeyValueProps {
  label: string;
  value: string | number | null | undefined;
  subValue?: string;
  mono?: boolean;
  copyable?: boolean;
  truncate?: boolean | "end" | "middle" | "path";
  truncateMaxLength?: number;
  layout?: "stacked" | "inline";
  stackOnCompact?: boolean;
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
  truncate: truncateProp = false,
  truncateMaxLength = 32,
  layout = "stacked",
  style,
  labelStyle,
  valueStyle,
}: KeyValueProps) {
  const { colors } = useHostTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const rawString = value === null || value === undefined ? "" : String(value);
  let displayValue = rawString || "-";
  if (truncateProp && rawString.length > truncateMaxLength) {
    const mode = typeof truncateProp === "string" ? truncateProp : "middle";
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
      toast?.show?.(label);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.error?.("Copy failed");
    }
  };
  const copyButton =
    copyable && rawString ? (
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
    ) : null;
  const valueText = (
    <Text
      selectable
      numberOfLines={1}
      ellipsizeMode="middle"
      style={[
        {
          color: colors.foreground,
          fontSize: 12,
          flexShrink: 1,
          minWidth: 0,
          fontFamily: mono ? MONO_FONT : undefined,
        },
        valueStyle,
      ]}
    >
      {displayValue}
    </Text>
  );
  if (layout === "inline") {
    return (
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            width: "100%",
          },
          style,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[{ color: colors.foregroundMuted, fontSize: 11, flexShrink: 1 }, labelStyle]}
        >
          {label}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            flexShrink: 1,
            minWidth: 0,
            justifyContent: "flex-end",
          }}
        >
          {valueText}
          {copyButton}
        </View>
      </View>
    );
  }
  return (
    <View style={[{ gap: 2, width: "100%" }, style]}>
      <Text numberOfLines={1} style={[{ color: colors.foregroundMuted, fontSize: 11 }, labelStyle]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {valueText}
        {copyButton}
      </View>
      {subValue ? (
        <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: 11 }}>
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
        <View
          key={index}
          style={{ flexGrow: 1, flexShrink: 1, flexBasis: `${Math.floor(100 / columns) - 2}%` }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

// --- layout ----------------------------------------------------------------

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
        {
          justifyContent: isColumn ? "flex-start" : align,
          alignItems: isColumn ? "stretch" : "center",
        },
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
  const { colors } = useHostTheme();
  return (
    <View
      style={[
        { gap: 4, width: "100%" },
        layout === "inline" && {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
        style,
      ]}
    >
      <View style={{ gap: 2, flexShrink: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{label}</Text>
        {description ? (
          <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{description}</Text>
        ) : null}
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

// --- collapsible / tabs ----------------------------------------------------

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
  variant?: SurfaceVariant;
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
  const { colors } = useHostTheme();
  const [internal, setInternal] = useState(initiallyExpanded);
  const expanded = controlled !== undefined ? controlled : internal;
  const toggle = () => {
    const next = !expanded;
    if (controlled === undefined) setInternal(next);
    onToggle?.(next);
  };
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          overflow: "hidden",
          width: "100%",
        },
        style,
      ]}
    >
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
            <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
              {title}
            </Text>
          ) : (
            title
          )}
          {typeof subtitle === "string" ? (
            <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: 11 }}>
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
        <View style={[{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }, contentStyle]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

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
  const { colors, alpha } = useHostTheme();
  return (
    <View
      style={[
        {
          width: "100%",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: colors.surface1,
        },
        style,
      ]}
    >
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", width: "100%", padding: 3, gap: 4 }}
      >
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
                  borderRadius: 6,
                  flexGrow: 1,
                  flexShrink: 1,
                  minWidth: 0,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor: isActive
                    ? colors.surface2
                    : pressed
                      ? alpha(colors.surface2, 0.5)
                      : "transparent",
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
                style={{
                  color: isActive ? colors.foreground : colors.foregroundMuted,
                  fontSize: 12,
                  fontWeight: isActive ? "600" : "500",
                  flexShrink: 1,
                  minWidth: 0,
                }}
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
                  <Text
                    style={{
                      color: isActive ? colors.accentForeground : colors.foregroundMuted,
                      fontSize: 10,
                      fontWeight: "700",
                    }}
                  >
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

// --- attention -------------------------------------------------------------

export type AttentionBeaconMode = "radar" | "ring" | "glow" | "badge" | "bounce" | "pulse";
export type AttentionBeaconTone = "warning" | "accent" | "danger";

export interface AttentionBeaconProps {
  children: ReactNode;
  mode?: AttentionBeaconMode;
  tone?: AttentionBeaconTone;
  color?: string;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
  badgeIcon?: string | ReactNode;
  easing?: (value: number) => number;
}

export function AttentionBeacon({
  children,
  mode = "radar",
  tone = "warning",
  color,
  active = true,
  style,
  accessibilityLabel,
  testID,
}: AttentionBeaconProps) {
  const { getStatusColor } = useHostTheme();
  const beaconColor =
    color ?? getStatusColor(tone === "danger" ? "danger" : tone === "accent" ? "accent" : "warning");
  const showDot = active && mode !== "badge";
  return (
    <View style={[{ position: "relative" }, style]}>
      {children}
      {showDot ? (
        <View
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: beaconColor,
            opacity: 0.75,
          }}
        />
      ) : null}
    </View>
  );
}

// --- code / command --------------------------------------------------------

export interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  maxHeight?: number;
  copyable?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function CodeBlock({
  code,
  language,
  title,
  maxHeight = 320,
  copyable = true,
  style,
  textStyle,
}: CodeBlockProps) {
  const { colors, alpha } = useHostTheme();
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
        {
          borderWidth: 1,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: colors.surface0,
          borderColor: colors.border,
        },
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
          <Text
            style={{
              color: title ? colors.foreground : colors.foregroundMuted,
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            {title ?? (language ? language.toUpperCase() : "")}
          </Text>
          {copyable ? (
            <Pressable
              onPress={handleCopy}
              accessibilityRole="button"
              accessibilityLabel="Copy code"
              hitSlop={4}
              style={{ padding: 4 }}
            >
              <Icon
                name={copied ? "Check" : "Copy"}
                size={12}
                color={copied ? colors.statusSuccess : colors.foregroundMuted}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {/* Bounded snippet scroller: a plain React Native ScrollView, never the
          host sheet-gesture ScrollView, so it cannot fight the host pan
          controller when nested (#219). */}
      <RNScrollView style={{ maxHeight }} contentContainerStyle={{ padding: 12 }}>
        <Text
          selectable
          style={[{ color: colors.foreground, fontSize: 12, lineHeight: 18, fontFamily: MONO_FONT }, textStyle]}
        >
          {code}
        </Text>
      </RNScrollView>
    </View>
  );
}

export interface CommandBoxProps {
  command?: string;
  argv?: string[];
  copyLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function CommandBox({
  command,
  argv = [],
  copyLabel = "Copy command",
  style,
  textStyle,
}: CommandBoxProps) {
  const { colors } = useHostTheme();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const fullCommand = command ?? argv.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg)).join(" ");
  const [prog, ...rest] = argv;
  const handleCopy = async () => {
    if (!fullCommand) return;
    try {
      await copyText(fullCommand);
      toast?.show?.("Command");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.error?.("Copy failed");
    }
  };
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: colors.surface2,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", flex: 1, flexShrink: 1, minWidth: 0 }}>
        <Text
          style={[
            { color: colors.statusWarning, fontSize: 12, fontWeight: "700", fontFamily: MONO_FONT },
            textStyle,
          ]}
        >
          {prog ? `$ ${prog}` : "$"}
        </Text>
        {rest.length > 0 ? (
          <Text style={[{ color: colors.foreground, fontSize: 12, fontFamily: MONO_FONT }, textStyle]}>
            {" "}
            {rest.join(" ")}
          </Text>
        ) : null}
      </View>
      <Pressable onPress={handleCopy} accessibilityRole="button" accessibilityLabel={copyLabel} hitSlop={4} style={{ padding: 4 }}>
        <Icon
          name={copied ? "Check" : "Copy"}
          size={12}
          color={copied ? colors.statusSuccess : colors.foregroundMuted}
        />
      </Pressable>
    </View>
  );
}

// --- modal body ------------------------------------------------------------

export interface ModalBodyProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  header?: ReactNode;
  headerStyle?: StyleProp<ViewStyle>;
  size?: "default" | "large";
  headerMode?: "pinned" | "scroll";
}

/**
 * Single scroll owner for the registered sidebar surface. The host supplies no
 * scroller for a plugin page, so the body owns one; `size` is accepted for
 * call-site compatibility and ignored (the host allocates the frame).
 */
export function ModalBody({
  children,
  style,
  contentContainerStyle,
  header,
  headerStyle,
  headerMode = "scroll",
}: ModalBodyProps) {
  const body = (
    <HostScrollView
      style={[{ flex: 1, minHeight: 0, width: "100%" }, style]}
      contentContainerStyle={contentContainerStyle}
    >
      {headerMode === "scroll" ? header : null}
      {children}
    </HostScrollView>
  );
  if (!header || headerMode !== "pinned") {
    return <View style={{ flex: 1, minHeight: 0, width: "100%" }}>{body}</View>;
  }
  return (
    <View style={{ flex: 1, minHeight: 0, width: "100%" }}>
      <View style={headerStyle}>{header}</View>
      {body}
    </View>
  );
}
