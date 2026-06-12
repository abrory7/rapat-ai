import { MCPClient } from '@mastra/mcp';
import { prisma } from '@/lib/db';
import { allTools } from '../tools';
import { decodeEnvironment } from '@/lib/mcp/environment-secrets';

// Cache client managers per project to reuse connections
const mcpClientCache = new Map<string, MCPClient>();

/**
 * Creates or retrieves a cached MCPClient instance for the project, configured with custom MCP servers.
 */
export async function getMcpClientForProject(projectId: string): Promise<MCPClient | null> {
  if (mcpClientCache.has(projectId)) {
    return mcpClientCache.get(projectId)!;
  }

  const configs = await prisma.mcpServerConfig.findMany({
    where: { projectId, enabled: true },
  });

  if (configs.length === 0) {
    return null;
  }

  const servers: Record<string, any> = {};
  for (const config of configs) {
    if (config.type === 'stdio' && config.command) {
      let parsedArgs: string[] = [];
      try {
        parsedArgs = config.args ? JSON.parse(config.args) : [];
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
      } catch (e) {
        console.error(`Invalid URL for SSE MCP server "${config.name}":`, config.url);
      }
    }
  }

  if (Object.keys(servers).length === 0) {
    return null;
  }

  const mcpClient = new MCPClient({
    id: `project-${projectId}`,
    servers,
  });

  mcpClientCache.set(projectId, mcpClient);
  return mcpClient;
}

/**
 * Merges built-in workspace tools with any custom tools exposed by the configured custom MCP servers.
 */
export async function getMergedToolsForProject(projectId: string): Promise<Record<string, any>> {
  // Built-in workspace tools
  const mergedTools: Record<string, any> = { ...allTools };

  try {
    const mcpClient = await getMcpClientForProject(projectId);
    if (mcpClient) {
      // Connect and query tools from the custom MCP servers
      const customTools = await mcpClient.listTools();
      Object.assign(mergedTools, customTools);
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
  const mcpClient = mcpClientCache.get(projectId);
  if (mcpClient) {
    try {
      await mcpClient.disconnect();
    } catch (e) {
      console.error(`Failed to disconnect MCP client for project ${projectId}:`, e);
    }
    mcpClientCache.delete(projectId);
  }
}
