import React from "react";
import { Text } from "react-native";
import {
  HostButton,
  HostRow,
  HostStack,
  useHostTheme,
} from "./host-ui";

export interface ChipOption<T extends string | number> {
  id: T;
  label: string;
  description?: string;
}

export interface ChoiceChipsProps<T extends string | number> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Show the selected option's description under the chips. */
  showActiveDescription?: boolean;
}

/**
 * Single-select chip row shared by every Top settings surface. Built from the
 * `ui/` Host primitives so the modal and the sidebar dashboard cannot drift
 * into two hand-rolled chip systems.
 */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  showActiveDescription = false,
}: ChoiceChipsProps<T>) {
  const { colors } = useHostTheme();
  const selected = options.find((option) => option.id === value);
  return (
    <HostStack gap={6}>
      <HostRow wrap gap={6}>
        {options.map((option) => (
          <HostButton
            key={String(option.id)}
            label={option.label}
            size="sm"
            variant={option.id === value ? "primary" : "ghost"}
            onPress={() => onChange(option.id)}
          />
        ))}
      </HostRow>
      {showActiveDescription && selected?.description ? (
        <Text style={{ fontSize: 9, color: colors.foregroundMuted }}>{selected.description}</Text>
      ) : null}
    </HostStack>
  );
}
