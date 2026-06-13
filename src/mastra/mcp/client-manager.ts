import { MCPClient, type MastraMCPServerDefinition } from '@mastra/mcp';
import { prisma } from '@/lib/db';
import { allTools } from '../tools';
import { decodeEnvironment } from '@/lib/mcp/environment-secrets';

type CachedMcpClient = {
  disconnect(): Promise<void>;
};

// Cache client managers per project to reuse connections
const mcpClientCache = new Map<string, CachedMcpClient>();
const mcpClientRevisions = new Map<string, number>();
export const BUILT_IN_TOOL_NAMES = new Set(Object.keys(allTools));

function getProjectRevision(projectId: string): number {
  return mcpClientRevisions.get(projectId) ?? 0;
}

export async function getOrCreateProjectMcpClient<TConfig, TClient extends CachedMcpClient>(
  projectId: string,
  loadConfigs: () => Promise<TConfig[]>,
  createClient: (configs: TConfig[]) => TClient | null
): Promise<TClient | null> {
  while (true) {
    const cachedClient = mcpClientCache.get(projectId);
    if (cachedClient) {
      return cachedClient as TClient;
    }

    const revision = getProjectRevision(projectId);
    const configs = await loadConfigs();

    if (revision !== getProjectRevision(projectId)) {
      continue;
    }
    const concurrentlyCachedClient = mcpClientCache.get(projectId);
    if (concurrentlyCachedClient) {
      return concurrentlyCachedClient as TClient;
    }
    if (configs.length === 0) {
      return null;
    }

    const client = createClient(configs);
    if (!client) {
      return null;
    }

    mcpClientCache.set(projectId, client);
    return client;
  }
}

/** @internal Test-only: clear module cache state. */
export function __resetMcpClientCacheForTest(): void {
  mcpClientCache.clear();
  mcpClientRevisions.clear();
}

export function mergeCustomTools<TBuiltIn, TCustom>(
  builtInTools: Record<string, TBuiltIn>,
  customTools: Record<string, TCustom>,
  log: (message: string) => void = console.warn
): Record<string, TBuiltIn | TCustom> {
  const mergedTools: Record<string, TBuiltIn | TCustom> = { ...builtInTools };

  for (const [name, tool] of Object.entries(customTools)) {
    if (BUILT_IN_TOOL_NAMES.has(name) || name in builtInTools) {
      log(`Skipped custom MCP tool "${name}" because it collides with a built-in tool.`);
      continue;
    }
    mergedTools[name] = tool;
  }

  return mergedTools;
}

export async function invalidateProjectMcpAfter<T>(
  projectId: string,
  mutation: () => Promise<T>,
  disconnect: (projectId: string) => Promise<void> = disconnectProjectMcp
): Promise<T> {
  const result = await mutation();
  await disconnect(projectId);
  return result;
}

/**
 * Creates or retrieves a cached MCPClient instance for the project, configured with custom MCP servers.
 */
export async function getMcpClientForProject(projectId: string): Promise<MCPClient | null> {
  return getOrCreateProjectMcpClient(
    projectId,
    () =>
      prisma.mcpServerConfig.findMany({
        where: { projectId, enabled: true },
      }),
    (configs) => {
      const servers: Record<string, MastraMCPServerDefinition> = {};
      for (const config of configs) {
        if (config.type === 'stdio' && config.command) {
          let parsedArgs: string[] = [];
          try {
            const parsed: unknown = config.args ? JSON.parse(config.args) : [];
            parsedArgs = Array.isArray(parsed)
              ? parsed.filter((value): value is string => typeof value === 'string')
              : [];
          } catch {
            parsedArgs = [];
          }

          const parsedEnv = decodeEnvironment(config.env);

          servers[config.name] = {
            command: config.command,
            args: parsedArgs,
            env: parsedEnv,
          };
        } else if (config.type === 'sse' && config.url) {
          try {
            servers[config.name] = {
              url: new URL(config.url),
            };
          } catch {
            console.error(`Invalid URL for SSE MCP server "${config.name}":`, config.url);
          }
        }
      }

      if (Object.keys(servers).length === 0) {
        return null;
      }

      return new MCPClient({
        id: `project-${projectId}`,
        servers,
      });
    }
  );
}

/**
 * Merges built-in workspace tools with any custom tools exposed by the configured custom MCP servers.
 */
export async function getMergedToolsForProject(
  projectId: string
): Promise<Record<string, unknown>> {
  // Built-in workspace tools
  const mergedTools: Record<string, unknown> = { ...allTools };

  try {
    const mcpClient = await getMcpClientForProject(projectId);
    if (mcpClient) {
      // Connect and query tools from the custom MCP servers
      const customTools = await mcpClient.listTools();
      return mergeCustomTools(mergedTools, customTools);
    }
  } catch (error) {
    console.error(`Error connecting to custom MCP servers for project ${projectId}:`, error);
  }

  return mergedTools;
}

/**
 * Disconnects the MCPClient for a project and removes it from the cache.
 */
export async function disconnectProjectMcp(projectId: string): Promise<void> {
  mcpClientRevisions.set(projectId, getProjectRevision(projectId) + 1);
  const mcpClient = mcpClientCache.get(projectId);
  mcpClientCache.delete(projectId);
  if (mcpClient) {
    try {
      await mcpClient.disconnect();
    } catch (e) {
      console.error(`Failed to disconnect MCP client for project ${projectId}:`, e);
    }
  }
}
