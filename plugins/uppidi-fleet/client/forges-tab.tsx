import React, { useState, useMemo, useCallback, useContext } from "react";
import { View, Text, StyleSheet, Linking, Pressable } from "react-native";
import { useWorkspace } from "@getpaseo/plugin/client";
import { PluginClientStateProvider, type PluginClientStateSource } from "@getpaseo/plugin/client/host";
import {
  Card,
  CardHeader,
  Badge,
  Button,
  SearchInput,
  Select,
  type SelectOption,
  EmptyState,
  Row,
  Stack,
  ModalBody,
  usePluginTheme,
  useRpcQuery,
  getClientHost,
  TicketLifecycleView,
  NewIssueComposer,
  MarkdownLite,
  CommentCard,
  AgentEnvelopeCard,
  ScopedLabelGroup,
} from "paseo-plugin-helper/client";
import { defineContract } from "paseo-plugin-helper/shared";
import { z } from "zod";
import { isRepoMatching } from "../shared/sort-filter.js";

const probe = PluginClientStateProvider({ children: null, source: null as any });
const PluginClientStateContext = ((probe as any)?.type?._context || (probe as any)?.type) as React.Context<PluginClientStateSource | null>;

export function usePluginClientStateSource(): PluginClientStateSource | null {
  if (!PluginClientStateContext) return null;
  return useContext(PluginClientStateContext);
}

const EMPTY_CLIENT_STATE_SOURCE: PluginClientStateSource = {
  subscribe: () => () => {},
  getWorkspace: () => null,
  getAgent: () => null,
};

export function EnsurePluginClientState({ children }: { children: React.ReactNode }) {
  const source = usePluginClientStateSource();
  if (source) {
    return <>{children}</>;
  }
  return (
    <PluginClientStateProvider source={EMPTY_CLIENT_STATE_SOURCE}>
      {children}
    </PluginClientStateProvider>
  );
}

export const forgeOpenIssuesContract = defineContract({
  name: "forge.open-issues",
  description: "List open forge issues for the repo backing a workspace directory",
  input: z.object({
    workspaceId: z.string().optional(),
    directory: z.string().optional(),
    remoteUrl: z.string().optional(),
    repo: z.string().optional(),
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
          repo: z.string().optional(),
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
  workspaceId?: string;
  agentId?: string;
  onClose?: () => void;
  directory?: string;
  enrolledRepos?: readonly string[] | string[];
  activeRepo?: string;
  selectedRepo?: string;
  onSelectRepo?: (repo: string) => void;
}

function ForgeIssuesViewInner({
  workspaceId = "",
  agentId: _agentId,
  onClose: _onClose,
  directory: propDirectory,
  enrolledRepos,
  activeRepo,
  selectedRepo: controlledSelectedRepo,
  onSelectRepo,
}: ForgeIssuesViewProps) {
  const { colors } = usePluginTheme();
  const { Icon } = getClientHost();
  const [searchQuery, setSearchQuery] = useState("");

  const workspaceDirectory = useWorkspace(
    workspaceId,
    (w: any) => w?.directory ?? w?.workspaceDirectory,
  ) as string | undefined;

  const directory = workspaceDirectory ?? propDirectory;

  const contextQuery = useRpcQuery(forgeContextContract, {
    directory: directory ?? undefined,
  });

  const derivedActiveRepo =
    activeRepo ??
    contextQuery.data?.derivedRepo ??
    (directory ? directory.split("/").pop() : undefined);

  const reposList = useMemo(() => {
    const set = new Set<string>();
    if (enrolledRepos) {
      for (const r of enrolledRepos) if (r) set.add(r);
    }
    if (activeRepo) set.add(activeRepo);
    if (contextQuery.data?.derivedRepo) set.add(contextQuery.data.derivedRepo);
    return Array.from(set);
  }, [enrolledRepos, activeRepo, contextQuery.data?.derivedRepo]);

  const [internalRepo, setInternalRepo] = useState<string>(() => {
    if (controlledSelectedRepo !== undefined) return controlledSelectedRepo;
    if (derivedActiveRepo && reposList.includes(derivedActiveRepo)) return derivedActiveRepo;
    if (derivedActiveRepo) return derivedActiveRepo;
    return "all";
  });

  const currentRepo = controlledSelectedRepo !== undefined ? controlledSelectedRepo : internalRepo;

  const handleSelectRepo = useCallback(
    (repo: string) => {
      setInternalRepo(repo);
      onSelectRepo?.(repo);
    },
    [onSelectRepo],
  );

  const repoOptions = useMemo<SelectOption[]>(() => [
    { label: "All Enrolled Repositories", value: "all" },
    ...reposList.map((r) => ({ label: r, value: r })),
  ], [reposList]);

  const issuesQuery = useRpcQuery(forgeOpenIssuesContract, {
    workspaceId: workspaceId || undefined,
    directory: directory ?? undefined,
    remoteUrl: currentRepo === "all" ? undefined : currentRepo,
    repo: currentRepo === "all" ? undefined : currentRepo,
  });

  const handleRefresh = useCallback(() => {
    void issuesQuery.refetch?.();
    void contextQuery.refetch?.();
  }, [issuesQuery, contextQuery]);

  const rawIssues = useMemo(() => {
    const list = issuesQuery.data?.issues ?? [];
    if (currentRepo === "all") return list;
    return list.filter(
      (i: any) =>
        !i.repo ||
        isRepoMatching(i.repo, currentRepo) ||
        String(i.repo).toLowerCase() === currentRepo.toLowerCase(),
    );
  }, [issuesQuery.data?.issues, currentRepo]);

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
    currentRepo !== "all"
      ? currentRepo
      : issuesQuery.data?.repo ||
        contextQuery.data?.derivedRepo ||
        "All Enrolled Repositories";

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
              currentRepo === "all"
                ? hostName
                  ? `All Enrolled Repositories on ${hostName}`
                  : "All Enrolled Repositories"
                : hostName
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
                    label={`${filteredIssues.length} open`}
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
          <View style={styles.controlsContainer}>
            <Row gap="md" align="center" style={styles.controlsRow}>
              <View style={styles.selectWrapper}>
                <Select
                  label="Repository"
                  size="sm"
                  options={repoOptions}
                  value={currentRepo}
                  onValueChange={handleSelectRepo}
                />
              </View>
              <View style={styles.searchWrapper}>
                <SearchInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Filter by issue #, title, label, or author..."
                />
              </View>
            </Row>
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
                  : currentRepo === "all"
                  ? "No open issues found across enrolled repositories."
                  : `No open issues found for ${currentRepo}.`
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

export function ForgeIssuesView(props: ForgeIssuesViewProps) {
  return (
    <EnsurePluginClientState>
      <ForgeIssuesViewInner {...props} />
    </EnsurePluginClientState>
  );
}

export const ForgesTabView = ForgeIssuesView;

const styles = StyleSheet.create({
  controlsContainer: {
    marginTop: 8,
  },
  controlsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  selectWrapper: {
    minWidth: 200,
    flexShrink: 0,
  },
  searchWrapper: {
    flex: 1,
    minWidth: 220,
  },
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

export {
  TicketLifecycleView,
  NewIssueComposer,
  MarkdownLite,
  CommentCard,
  AgentEnvelopeCard,
  ScopedLabelGroup,
};
