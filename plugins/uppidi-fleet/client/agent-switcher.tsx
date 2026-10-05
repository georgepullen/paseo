import React from "react";
import { View, Text, Pressable } from "react-native";
import type {
  PluginButtonContentProps,
  PluginButtonIconProps,
  PluginSurfaceProps,
} from "@getpaseo/plugin/client";

import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import {
  StatusDot,
  InteractiveRow,
  Responsive,
  useRpcQuery,
} from "paseo-plugin-helper/client";
import { useFleetTheme } from "./theme.js";
import {
  uppidiAgentsContract,
  getDeterministicStateConfig,
  type UppidiAgent,
} from "../shared/contracts.js";
import { mapAgentSwitcherData } from "./agent-switcher-data.js";

export function AgentSwitcherHeaderIcon({ size, color }: PluginButtonIconProps) {
  return <Icon name="RadioTower" size={size} color={color} />;
}

export interface AgentSwitcherDropdownProps {
  frontDesk: UppidiAgent | null;
  orchestratorsByRepo: Array<{ repo: string; orchestrator: UppidiAgent }>;
  onSelectAgent: (agentId: string) => void;
  close?: () => void;
}

export function AgentRowItem({
  agent,
  title,
  subtitle,
  disabled = false,
  onPress,
}: {
  agent?: UppidiAgent | null;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const { colors, typography } = useFleetTheme();
  const stateConfig = agent
    ? getDeterministicStateConfig(agent.deterministicState, agent.category)
    : null;

  return (
    <InteractiveRow
      testID={agent?.id ? `agent-row-${agent.id}` : undefined}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hoverTint={!disabled}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,

        borderRadius: 6,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}${subtitle ? ` - ${subtitle}` : ""}`}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
        <StatusDot
          variant={stateConfig ? stateConfig.dotVariant : "neutral"}
          pulse={stateConfig ? stateConfig.pulse : false}
          size="md"
        />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              color: disabled ? colors.foregroundMuted : colors.foreground,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={{
                color: colors.foregroundMuted,
                fontSize: 11,
                marginTop: 2,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {agent?.deterministicState ? (
        <Text
          style={{
            color: colors.foregroundMuted,
            fontSize: 11,
          }}
        >
          {stateConfig?.label ?? agent.status}
        </Text>
      ) : null}
    </InteractiveRow>
  );
}

export function AgentSwitcherDropdown({
  frontDesk,
  orchestratorsByRepo,
  onSelectAgent,
  close,
}: AgentSwitcherDropdownProps) {
  const { colors, typography } = useFleetTheme();

  return (
    <View
      style={{
        flexDirection: "column",
        gap: 12,
        padding: 8,
      }}
      testID="agent-switcher-dropdown"
    >
      {/* Front Desk Section */}
      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: colors.foregroundMuted,
            fontSize: 11,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            paddingHorizontal: 4,
          }}
        >
          Front Desk
        </Text>
        {frontDesk ? (
          <AgentRowItem
            agent={frontDesk}
            title={frontDesk.name || "Front Desk"}
            subtitle={frontDesk.id}
            onPress={() => {
              onSelectAgent(frontDesk.id);
              close?.();
            }}
          />
        ) : (
          <View
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: colors.surface1,
            }}
          >
            <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
              No live Front Desk
            </Text>
          </View>
        )}
      </View>

      {/* Orchestrators Section */}
      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: colors.foregroundMuted,
            fontSize: 11,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            paddingHorizontal: 4,
          }}
        >
          Orchestrators
        </Text>
        {orchestratorsByRepo.length > 0 ? (
          orchestratorsByRepo.map(({ repo, orchestrator }) => (
            <AgentRowItem
              key={orchestrator.id}
              agent={orchestrator}
              title={orchestrator.name || repo}
              subtitle={repo}
              onPress={() => {
                onSelectAgent(orchestrator.id);
                close?.();
              }}
            />
          ))
        ) : (
          <View
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: colors.surface1,
            }}
          >
            <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
              No orchestrators registered
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function AgentSwitcherPopover(
  props: PluginButtonContentProps & { navigation?: PluginSurfaceProps["navigation"] },
) {

  const { data: agentsData } = useRpcQuery(
    uppidiAgentsContract,
    {},
    { refetchInterval: 5000 },
  );

  const { frontDesk, orchestratorsByRepo } = mapAgentSwitcherData(agentsData);

  const handleSelectAgent = (agentId: string) => {
    if (props.navigation?.openAgent) {
      props.navigation.openAgent({ agentId });
    }
  };

  const content = (
    <AgentSwitcherDropdown
      frontDesk={frontDesk}
      orchestratorsByRepo={orchestratorsByRepo}
      onSelectAgent={handleSelectAgent}
      close={props.close}
    />
  );

  return (
    <Responsive
      desktop={
        <ScrollView style={{ maxHeight: 420, width: 320 }}>
          {content}
        </ScrollView>
      }
      compact={
        <ScrollView style={{ width: "100%", maxHeight: 480 }}>
          {content}
        </ScrollView>
      }
      mobile={
        <ScrollView style={{ width: "100%", maxHeight: 520 }}>
          {content}
        </ScrollView>
      }
    >
      <ScrollView style={{ maxHeight: 420, width: 320 }}>
        {content}
      </ScrollView>
    </Responsive>
  );
}
