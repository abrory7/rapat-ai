import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  decodeEnvironment,
  encodeEnvironment,
  mergeEnvironmentUpdate,
  toMcpServerDto,
} from '@/lib/mcp/environment-secrets';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; serverId: string }> }
) {
  try {
    const { id, serverId } = await params;
    const body = await req.json();
    const { name, type, command, url, args, env, removedEnvKeys, enabled } = body;

    const config = await prisma.mcpServerConfig.findFirst({
      where: { id: serverId, projectId: id },
    });
    if (!config) {
      return NextResponse.json({ error: 'MCP server config not found' }, { status: 404 });
    }

    const nextEnvironment =
      env !== undefined || Array.isArray(removedEnvKeys)
        ? mergeEnvironmentUpdate(
            decodeEnvironment(config.env),
            env || {},
            Array.isArray(removedEnvKeys) ? removedEnvKeys : []
          )
        : null;

    const updated = await prisma.mcpServerConfig.update({
      where: { id: serverId },
      data: {
        name: name ?? config.name,
        type: type ?? config.type,
        command: command !== undefined ? command : config.command,
        url: url !== undefined ? url : config.url,
        args: args !== undefined ? (args ? JSON.stringify(args) : null) : config.args,
        env:
          nextEnvironment === null
            ? config.env
            : Object.keys(nextEnvironment).length > 0
              ? encodeEnvironment(nextEnvironment)
              : null,
        enabled: enabled !== undefined ? enabled : config.enabled,
      },
    });

    return NextResponse.json(toMcpServerDto(updated));
  } catch (error) {
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

    await prisma.mcpServerConfig.delete({ where: { id: serverId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete MCP config:', error);
    return NextResponse.json({ error: 'Failed to delete MCP config' }, { status: 500 });
  }
}
