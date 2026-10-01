import React, { type Ref } from "react";
import {
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps as RNTextInputProps,
  type TextInput as RNTextInputInstance,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { getOptionalClientHost } from "../client/host.js";
import { useHostTheme } from "./theme.js";

export interface HostTextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  errorText?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  disabled?: boolean;
  mono?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  onSubmitEditing?: () => void;
  ref?: Ref<RNTextInputInstance>;
}

/**
 * Host-delegating text input for `paseo-plugin-helper/ui`.
 *
 * Thin wrapper around a `<TextInput>` that paints with host theme colors.
 * Prefers the host-injected TextInput (keyboard-integrated on Paseo v0.8)
 * and falls back to plain React Native TextInput. No scroll state machine,
 * no width caps, no DOM scraping. Colors come from `useHostTheme()`
 * (provided by `HostThemeProvider`).
 */
export function HostTextInput({
  value,
  onChangeText,
  label,
  placeholder,
  helperText,
  errorText,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
  autoCorrect = false,
  disabled = false,
  mono = false,
  multiline = false,
  numberOfLines = 4,
  style,
  inputStyle,
  onSubmitEditing,
  ref,
}: HostTextInputProps) {
  const host = getOptionalClientHost();
  const { colors } = useHostTheme();
  const ResolvedTextInput = host?.TextInput ?? RNTextInput;

  const hasError = !!errorText;

  return (
    <View style={style}>
      {label ? (
        <Text style={[styles.label, { color: colors.foregroundMuted }]}>
          {label}
        </Text>
      ) : null}
      <ResolvedTextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        editable={!disabled}
        multiline={multiline}
        numberOfLines={multiline ? numberOfLines : undefined}
        onSubmitEditing={onSubmitEditing}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface1,
            borderColor: hasError ? colors.statusDanger : colors.border,
            color: colors.foreground,
            fontFamily: mono ? "monospace" : undefined,
          },
          multiline && { minHeight: numberOfLines * 20, textAlignVertical: "top" },
          inputStyle,
        ]}
      />
      {errorText ? (
        <Text style={[styles.errorText, { color: colors.statusDanger }]}>
          {errorText}
        </Text>
      ) : helperText ? (
        <Text style={[styles.helperText, { color: colors.foregroundMuted }]}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: "500",
  },
});
