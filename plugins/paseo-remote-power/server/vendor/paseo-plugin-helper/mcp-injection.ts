export interface McpStdioInjectionConfig {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  alwaysLoad?: boolean;
  instructions?: string;
}

export interface McpHttpInjectionConfig {
  type: "http";
  url: string;
  headers?: Record<string, string>;
  alwaysLoad?: boolean;
  instructions?: string;
}

export interface McpSseInjectionConfig {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
  alwaysLoad?: boolean;
  instructions?: string;
}

export type McpInjectionConfig =
  | McpStdioInjectionConfig
  | McpHttpInjectionConfig
  | McpSseInjectionConfig;

export interface AgentCreateInjectionConfig {
  mcpServers?: Record<string, McpInjectionConfig>;
  [key: string]: unknown;
}

export interface AgentCreateInjectionRequest {
  config: AgentCreateInjectionConfig;
  env?: Record<string, string>;
  [key: string]: unknown;
}

export type McpInjectionFilter = (input: {
  request: AgentCreateInjectionRequest;
}) => boolean;

export type McpInjectionHookHandler = (
  input: { request: AgentCreateInjectionRequest },
  context?: unknown,
) => AgentCreateInjectionRequest | void | Promise<AgentCreateInjectionRequest | void>;

export interface McpInjectionServer {
  // Loose on purpose: the real SDK declares a generic
  // before<Name extends keyof PluginBeforeRequests>(...) whose name param is
  // narrower than string and whose handler uses SDK request types. Typing this
  // boundary with any keeps the SDK object directly assignable with no
  // consumer-side adapter and no SDK imports here. Handler authors should use
  // McpInjectionHookHandler for the precise shape.
  before(
    name: string,
    handler: (input: { request: any }, context?: any) => any,
  ): () => void;
}

export interface RegisterMcpInjectionOptions {
  serverName: string;
  config: McpInjectionConfig;
  filter?: McpInjectionFilter;
}

export function registerMcpInjection(
  server: McpInjectionServer,
  options: RegisterMcpInjectionOptions,
): () => void {
  const { serverName, config, filter } = options;
  return server.before("agent.create", ({ request }: { request: AgentCreateInjectionRequest }) => {
    if (filter && !filter({ request })) return;
    const injectedConfig = { ...config };
    if (injectedConfig.instructions === "") {
      delete injectedConfig.instructions;
    }
    const composed: AgentCreateInjectionRequest = {
      ...request,
      config: {
        ...request.config,
        mcpServers: {
          ...(request.config.mcpServers ?? {}),
          [serverName]: injectedConfig,
        },
      },
    };
    // Opt-in per server: only a config that sets `instructions` gets text
    // composed into the agent. Absent means byte-identical passthrough.
    if (typeof config.instructions !== "string" || config.instructions === "") return composed;
    const base = typeof request.config.systemPrompt === "string" ? request.config.systemPrompt : "";
    return {
      ...composed,
      config: {
        ...composed.config,
        systemPrompt: base.trim().length > 0 ? `${base}\n\n${config.instructions}` : config.instructions,
      },
    };
  });
}
