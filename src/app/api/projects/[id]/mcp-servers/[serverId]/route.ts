import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  decodeEnvironment,
  encodeEnvironmentUpdate,
  mergeEnvironmentUpdate,
  toMcpServerDto,
} from '@/lib/mcp/environment-secrets';
import { parseMcpServerUpdate } from '@/lib/mcp/config-schema';
import { invalidateProjectMcpAfter } from '@/mastra/mcp/client-manager';
import { ZodError } from 'zod';

function parseStoredArgs(args: string | null): string[] {
  if (!args) return [];
  try {
    const parsed: unknown = JSON.parse(args);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function invalidMcpConfig() {
  return NextResponse.json(
    {
      code: 'INVALID_MCP_CONFIG',
      error: 'Invalid MCP server configuration.',
    },
    { status: 400 }
  );
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; serverId: string }> }
) {
  try {
    const { id, serverId } = await params;
    const body: unknown = await req.json();

    const config = await prisma.mcpServerConfig.findFirst({
      where: { id: serverId, projectId: id },
    });
    if (!config) {
      return NextResponse.json({ error: 'MCP server config not found' }, { status: 404 });
    }
    const input = parseMcpServerUpdate(body, {
      name: config.name,
      type: config.type,
      command: config.command,
      url: config.url,
      args: parseStoredArgs(config.args),
      enabled: config.enabled,
    });
    const nextType = input.type ?? config.type;

    const nextEnvironment =
      input.env !== undefined || input.removedEnvKeys !== undefined
        ? mergeEnvironmentUpdate(
            decodeEnvironment(config.env),
            input.env || {},
            input.removedEnvKeys || []
          )
        : null;

    const updated = await invalidateProjectMcpAfter(id, () =>
      prisma.mcpServerConfig.update({
        where: { id: serverId },
        data: {
          name: input.name ?? config.name,
          type: nextType,
          command:
            nextType === 'stdio'
              ? input.command ?? config.command
              : null,
          url:
            nextType === 'sse'
              ? input.url ?? config.url
              : null,
          args:
            nextType === 'stdio'
              ? input.args !== undefined
                ? JSON.stringify(input.args)
                : config.args
              : null,
          env: encodeEnvironmentUpdate(nextType, config.env, nextEnvironment),
          enabled: input.enabled ?? config.enabled,
        },
      })
    );

    return NextResponse.json(toMcpServerDto(updated));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return invalidMcpConfig();
    }
    console.error('Failed to update MCP config:', error);
    return NextResponse.json({ error: 'Failed to update MCP config' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; serverId: string }> }
) {
  try {
    const { id, serverId } = await params;
    const config = await prisma.mcpServerConfig.findFirst({
      where: { id: serverId, projectId: id },
    });
    if (!config) {
      return NextResponse.json({ error: 'MCP server config not found' }, { status: 404 });
    }

    await invalidateProjectMcpAfter(id, () =>
      prisma.mcpServerConfig.delete({ where: { id: serverId } })
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete MCP config:', error);
    return NextResponse.json({ error: 'Failed to delete MCP config' }, { status: 500 });
  }
}
