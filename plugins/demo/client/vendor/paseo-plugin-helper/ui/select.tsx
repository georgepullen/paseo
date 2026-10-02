import React, { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { getClientHost } from "../host";
import { useHostTheme } from "./theme";

export interface HostSelectOption {
  label: string;
  value: string;
}

export interface HostSelectProps {
  value: string;
  options: HostSelectOption[];
  onValueChange: (value: string) => void;
  label?: string;
  size?: "sm" | "md";
  placeholder?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const OPTION_LIST_MAX_HEIGHT = 216;

/**
 * Host-delegating select for `paseo-plugin-helper/ui`.
 *
 * Thin wrapper that paints a compact single-choice picker with host theme
 * colors. The closed trigger stays one line tall; opening mounts the menu in
 * a root transparent `<Modal>` overlay portal. No scroll state machine, no
 * width caps, no DOM scraping. Colors come from `useHostTheme()` (provided
 * by `HostThemeProvider`).
 */
export function HostSelect({
  value,
  options,
  onValueChange,
  label,
  size = "md",
  placeholder = "Select…",
  disabled = false,
  style,
}: HostSelectProps) {
  const { Icon } = getClientHost();
  const { colors, alpha } = useHostTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const [menuCoords, setMenuCoords] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const selected = options.find((o) => o.value === value);
  const fontSize = size === "sm" ? 12 : 14;
  const paddingVertical = size === "sm" ? 6 : 10;
  const paddingHorizontal = size === "sm" ? 10 : 14;

  const handleOpen = () => {
    if (disabled) return;
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setMenuCoords({ x, y, width, height });
      setOpen(true);
    });
  };

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setOpen(false);
  };

  return (
    <View style={style}>
      {label ? (
        <Text style={[styles.label, { color: colors.foregroundMuted, fontSize: fontSize - 1 }]}>
          {label}
        </Text>
      ) : null}
      <Pressable
        ref={triggerRef}
        onPress={handleOpen}
        disabled={disabled}
        accessibilityRole="combobox"
        accessibilityState={{ expanded: open, disabled }}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: colors.surface1,
            borderColor: colors.border,
            paddingVertical,
            paddingHorizontal,
            opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.triggerText,
            {
              color: selected ? colors.foreground : colors.foregroundMuted,
              fontSize,
            },
          ]}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Icon name="chevron-down" size={fontSize + 2} color={colors.foregroundMuted} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={styles.overlay}>
            <View
              style={[
                styles.menu,
                {
                  position: "absolute",
                  top: menuCoords.y + menuCoords.height + 4,
                  left: menuCoords.x,
                  width: menuCoords.width,
                  backgroundColor: colors.surface0,
                  borderColor: colors.border,
                },
              ]}
            >
              <ScrollView
                style={{ maxHeight: OPTION_LIST_MAX_HEIGHT }}
                keyboardShouldPersistTaps="handled"
              >
                {options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => handleSelect(option.value)}
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor: isSelected
                            ? alpha(colors.accent, 0.12)
                            : pressed
                              ? colors.surface1
                              : "transparent",
                          paddingVertical,
                          paddingHorizontal,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          {
                            color: isSelected ? colors.accent : colors.foreground,
                            fontSize,
                            fontWeight: isSelected ? "600" : "400",
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: "500",
    marginBottom: 4,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    gap: 8,
  },
  triggerText: {
    flex: 1,
    flexShrink: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  menu: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  option: {
    justifyContent: "center",
  },
  optionText: {
    flexShrink: 1,
  },
});
