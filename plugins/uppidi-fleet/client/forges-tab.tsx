import React, { useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, Linking, Pressable } from "react-native";
import { useWorkspace } from "@getpaseo/plugin/client";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  SearchInput,
  EmptyState,
  Row,
  Stack,
  ModalBody,
  usePluginTheme,
  useRpcQuery,
  getClientHost,
} from "paseo-plugin-helper/client";
import { defineContract } from "paseo-plugin-helper/shared";
import { z } from "zod";

export const forgeOpenIssuesContract = defineContract({
  name: "forge.open-issues",
  description: "List open forge issues for the repo backing a workspace directory",
  input: z.object({
    workspaceId: z.string().optional(),
    directory: z.string().optional(),
    remoteUrl: z.string().optional(),
  }),
  output: z.object({
    repo: z.string().nullable().default(null),
    host: z.string().nullable().default(null),
    remoteUrl: z.string().nullable().default(null),
    repoPublic: z.boolean().default(false),
    tokenPresent: z.boolean().default(false),
    tokenValid: z.boolean().default(false),
    repoWritePermission: z.boolean().default(false),
    issues: z
      .array(
        z.object({
          number: z.number(),
          title: z.string(),
          body: z.string().default(""),
          state: z.string().default("open"),
          author: z.string().default(""),
          labels: z.array(z.string()).default([]),
          comments: z.number().default(0),
          url: z.string().default(""),
          updatedAt: z.string().default(""),
          isPullRequest: z.boolean().default(false),
        }),
      )
      .default([]),
    totalOpenCount: z.number().default(0),
    error: z.string().optional(),
  }),
});

export const forgeContextContract = defineContract({
  name: "forge.context",
  description: "Workspace git-origin forge coordinates",
  input: z.object({
    directory: z.string().optional(),
  }),
  output: z.object({
    directory: z.string().nullable().default(null),
    derivedRemote: z.string().nullable().default(null),
    derivedHost: z.string().nullable().default(null),
    derivedRepo: z.string().nullable().default(null),
  }),
});

export interface ForgeIssuesViewProps {
  workspaceId: string;
  agentId?: string;
  onClose?: () => void;
}

export function ForgeIssuesView({
  workspaceId,
  agentId: _agentId,
  onClose: _onClose,
}: ForgeIssuesViewProps) {
  const { colors } = usePluginTheme();
  const { Icon } = getClientHost();
  const [searchQuery, setSearchQuery] = useState("");

  const directory = useWorkspace(
    workspaceId,
    (w: any) => w?.directory ?? w?.workspaceDirectory,
  ) as string | undefined;

  const contextQuery = useRpcQuery(forgeContextContract, {
    directory: directory ?? undefined,
  });

  const issuesQuery = useRpcQuery(forgeOpenIssuesContract, {
    workspaceId: workspaceId || undefined,
    directory: directory ?? undefined,
  });

  const handleRefresh = useCallback(() => {
    void issuesQuery.refetch?.();
    void contextQuery.refetch?.();
  }, [issuesQuery, contextQuery]);

  const rawIssues = useMemo(() => {
    return issuesQuery.data?.issues ?? [];
  }, [issuesQuery.data?.issues]);

  const filteredIssues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rawIssues;
    const digits = q.startsWith("#") ? q.slice(1) : q;
    return rawIssues.filter((issue) => {
      if (/^\d+$/.test(digits) && String(issue.number).startsWith(digits)) {
        return true;
      }
      return (
        issue.title.toLowerCase().includes(q) ||
        issue.labels.some((l) => l.toLowerCase().includes(q)) ||
        issue.author.toLowerCase().includes(q)
      );
    });
  }, [rawIssues, searchQuery]);

  const repoName =
    issuesQuery.data?.repo ||
    contextQuery.data?.derivedRepo ||
    (directory ? directory.split("/").pop() : "Workspace");

  const hostName =
    issuesQuery.data?.host || contextQuery.data?.derivedHost || null;

  const handleOpenUrl = (url: string) => {
    if (url) {
      void Linking.openURL(url);
    }
  };

  return (
    <ModalBody>
      <Stack gap={4}>
        <Card variant="flat">
          <CardHeader
            title="Forge Issues"
            subtitle={
              hostName
                ? `${repoName} on ${hostName}`
                : repoName
            }
            icon="GitPullRequest"
            action={
              <Row gap="sm" align="center">
                {issuesQuery.isFetching ? (
                  <Badge label="Syncing..." variant="accent" styleVariant="tinted" />
                ) : (
                  <Badge
                    label={`${rawIssues.length} open`}
                    variant="neutral"
                    styleVariant="tinted"
                  />
                )}
                <Button
                  label="Refresh"
                  size="sm"
                  icon="RefreshCw"
                  variant="ghost"
                  onPress={handleRefresh}
                />
              </Row>
            }
          />
          <View style={styles.searchContainer}>
            <SearchInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Filter by issue #, title, label, or author..."
            />
          </View>
        </Card>

        {issuesQuery.isLoading ? (
          <Card variant="flat">
            <EmptyState
              icon="RefreshCw"
              title="Loading forge issues..."
              description="Querying forge status for the active workspace."
            />
          </Card>
        ) : issuesQuery.isError || issuesQuery.data?.error ? (
          <Card variant="tinted" style={{ borderColor: colors.statusWarning, borderWidth: 1 }}>
            <EmptyState
              icon="AlertCircle"
              title="Forge issues unavailable"
              description={
                issuesQuery.data?.error ||
                issuesQuery.error?.message ||
                "Could not connect to forge plugin or daemon RPC. Verify that the forges plugin is running."
              }
            />
          </Card>
        ) : filteredIssues.length === 0 ? (
          <Card variant="flat">
            <EmptyState
              icon="CheckCircle2"
              title={searchQuery ? "No matching issues" : "No open issues"}
              description={
                searchQuery
                  ? `No open issues match "${searchQuery}".`
                  : "No open issues found for this workspace."
              }
            />
          </Card>
        ) : (
          <Stack gap={3}>
            {filteredIssues.map((issue) => (
              <Card key={issue.number} variant="flat">
                <Row gap="md" align="flex-start" justify="space-between">
                  <Stack gap={1} style={styles.issueMain}>
                    <Row gap="sm" align="center">
                      <Text style={[styles.issueNumber, { color: colors.foregroundMuted }]}>
                        #{issue.number}
                      </Text>
                      <Text style={[styles.issueTitle, { color: colors.foreground }]}>
                        {issue.title}
                      </Text>
                      {issue.isPullRequest && (
                        <Badge label="PR" variant="accent" styleVariant="tinted" />
                      )}
                    </Row>
                    <Row gap="sm" align="center" style={styles.metaRow}>
                      {issue.author ? (
                        <Text style={[styles.metaText, { color: colors.foregroundMuted }]}>
                          opened by {issue.author}
                        </Text>
                      ) : null}
                      {issue.comments > 0 && (
                        <Row gap="xs" align="center">
                          <Icon name="MessageSquare" size={12} color={colors.foregroundMuted} />
                          <Text style={[styles.metaText, { color: colors.foregroundMuted }]}>
                            {issue.comments}
                          </Text>
                        </Row>
                      )}
                    </Row>
                    {issue.labels.length > 0 && (
                      <Row gap="xs" align="center" wrap style={styles.labelRow}>
                        {issue.labels.map((label) => (
                          <Badge
                            key={label}
                            label={label}
                            variant={
                              label.startsWith("attention/")
                                ? "warning"
                                : label.startsWith("state/")
                                ? "accent"
                                : "neutral"
                            }
                            styleVariant="tinted"
                          />
                        ))}
                      </Row>
                    )}
                  </Stack>
                  {issue.url ? (
                    <Pressable
                      onPress={() => handleOpenUrl(issue.url)}
                      style={[styles.openButton, { borderColor: colors.border }]}
                    >
                      <Icon name="ExternalLink" size={14} color={colors.accent} />
                    </Pressable>
                  ) : null}
                </Row>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </ModalBody>
  );
}

export const ForgesTabView = ForgeIssuesView;

const styles = StyleSheet.create({
  searchContainer: {
    marginTop: 8,
  },
  issueMain: {
    flex: 1,
  },
  issueNumber: {
    fontSize: 14,
    fontWeight: "600",
  },
  issueTitle: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  metaRow: {
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
  },
  labelRow: {
    marginTop: 6,
  },
  openButton: {
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
});
