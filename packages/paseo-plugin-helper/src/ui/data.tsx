import React, { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useHostTheme, useHostLayout } from "./theme.js";
import { spacing } from "./layout.js";

/**
 * Paseo Plugin Helper — UI data adapters (`paseo-plugin-helper/ui`).
 *
 * Thin, host-delegating data adapters
 * (DataTable). Same contract: host theme colors only, no scroll ownership, no
 * design-system machinery.
 */

export interface HostDataColumn<T> {
  key: string;
  header: string;
  flex?: number;
  width?: number;
  align?: "left" | "center" | "right";
  render: (item: T) => ReactNode;
}

export interface HostDataTableProps<T> {
  data: T[];
  columns: HostDataColumn<T>[];
  keyExtractor: (item: T, index: number) => string;
  emptyState?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Responsive data table that reflows between a traditional table on wide
 * surfaces and a structured card list on compact/mobile layouts.
 */
export function HostDataTable<T>({
  data,
  columns,
  keyExtractor,
  emptyState,
  style,
}: HostDataTableProps<T>) {
  const { colors } = useHostTheme();
  const layout = useHostLayout();
  const isCompact = layout.compact || layout.platform === "ios" || layout.platform === "android";

  if (!data || data.length === 0) {
    return emptyState ? <View style={style}>{emptyState}</View> : null;
  }

  if (isCompact) {
    return (
      <View style={[styles.compactContainer, style]}>
        {data.map((item, idx) => (
          <View
            key={keyExtractor(item, idx)}
            style={[
              styles.compactCard,
              {
                backgroundColor: colors.surface1,
                borderColor: colors.border,
              },
            ]}
          >
            {columns.map((col) => (
              <View key={col.key} style={styles.compactRow}>
                <Text style={[styles.compactHeader, { color: colors.foregroundMuted }]}>
                  {col.header}
                </Text>
                <View style={styles.compactValue}>{col.render(item)}</View>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.table,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface0,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.headerRow,
          {
            backgroundColor: colors.surface1,
            borderBottomColor: colors.border,
          },
        ]}
      >
        {columns.map((col) => (
          <View
            key={col.key}
            style={[
              styles.cell,
              col.flex !== undefined ? { flex: col.flex } : { flex: 1 },
              col.width !== undefined ? { width: col.width } : undefined,
              col.align === "right"
                ? styles.alignRight
                : col.align === "center"
                  ? styles.alignCenter
                  : styles.alignLeft,
            ]}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.headerText, { color: colors.foregroundMuted }]}
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
            styles.row,
            idx < data.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
          ]}
        >
          {columns.map((col) => (
            <View
              key={col.key}
              style={[
                styles.cell,
                col.flex !== undefined ? { flex: col.flex } : { flex: 1 },
                col.width !== undefined ? { width: col.width } : undefined,
                col.align === "right"
                  ? styles.alignRight
                  : col.align === "center"
                    ? styles.alignCenter
                    : styles.alignLeft,
              ]}
            >
              {col.render(item)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  compactContainer: {
    gap: spacing.sm,
  },
  compactCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    gap: spacing.xs,
  },
  compactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  compactHeader: {
    fontSize: 11,
    flexShrink: 1,
  },
  compactValue: {
    flexShrink: 1,
    minWidth: 0,
  },
  table: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  alignLeft: {
    alignItems: "flex-start",
  },
  alignCenter: {
    alignItems: "center",
  },
  alignRight: {
    alignItems: "flex-end",
  },
  headerText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
