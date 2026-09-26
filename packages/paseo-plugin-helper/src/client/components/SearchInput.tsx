import React, { type ComponentType, type Ref } from "react";
import {
  StyleSheet,
  TextInput as RNTextInput,
  View,
  Pressable,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type TextInputProps as RNTextInputProps,
  type TextInput as RNTextInputInstance,
} from "react-native";
import { getClientHost, getOptionalClientHost } from "../host.js";
import { usePluginTheme } from "../theme/provider.js";

export interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  /**
   * Painted box height, opt-in per call site. Unset keeps the original
   * `isCompact ? 36 : 40` box so no untouched surface changes appearance.
   * 26 matches the compact `size="sm"` button recipe (~26px) so a search field
   * can sit beside filter pills in one row without inflating it (#645); a
   * height of 26 or less also switches the input to the 12px `sm` label size,
   * anything taller keeps the prior 13/14.
   */
  height?: number;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
}

/**
 * Standardized search input with search icon, clear button, and theme support.
 */
export function SearchInput({
  value,
  onChangeText,
  placeholder = "Search...",
  onClear,
  height,
  style,
  inputStyle,
  testID,
}: SearchInputProps) {
  const { Icon } = getClientHost();
  const ResolvedInput = (getOptionalClientHost()?.TextInput ??
    RNTextInput) as ComponentType<RNTextInputProps & { ref?: Ref<RNTextInputInstance> }>;
  const { colors, resolveRadius, isCompact } = usePluginTheme();
  const radius = resolveRadius("sm");
  // Unspecified keeps the original compact-aware default so every call site
  // that does not opt in renders exactly as before (#645's scope was the
  // uppidi-fleet filter rows only).
  const resolvedHeight = height ?? (isCompact ? 36 : 40);

  const handleClear = () => {
    onChangeText("");
    if (onClear) onClear();
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface1,
          borderColor: colors.border,
          borderRadius: radius,
          height: resolvedHeight,
        },
        style,
      ]}
    >
      <View style={styles.iconWrapper}>
        <Icon name="Search" size={16} color={colors.foregroundMuted} />
      </View>
      <ResolvedInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundMuted}
        style={[
          styles.input,
          {
            color: colors.foreground,
            fontSize: height !== undefined && height <= 26 ? 12 : isCompact ? 13 : 14,
          },
          inputStyle,
        ]}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {Boolean(value) && (
        <Pressable
          onPress={handleClear}
          style={styles.clearButton}
          hitSlop={8}
          accessibilityLabel="Clear search"
        >
          <Icon name="X" size={14} color={colors.foregroundMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  iconWrapper: {
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    outlineWidth: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 4,
  },
});
