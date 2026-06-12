import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; serverId: string }> }
) {
  try {
    const { id, serverId } = await params;
    const body = await req.json();
    const { name, type, command, url, args, env, enabled } = body;

    const config = await prisma.mcpServerConfig.findFirst({
      where: { id: serverId, projectId: id },
    });
    if (!config) {
      return NextResponse.json({ error: 'MCP server config not found' }, { status: 404 });
    }

    const updated = await prisma.mcpServerConfig.update({
      where: { id: serverId },
      data: {
        name: name ?? config.name,
        type: type ?? config.type,
        command: command !== undefined ? command : config.command,
        url: url !== undefined ? url : config.url,
        args: args !== undefined ? (args ? JSON.stringify(args) : null) : config.args,
        env: env !== undefined ? (env ? JSON.stringify(env) : null) : config.env,
        enabled: enabled !== undefined ? enabled : config.enabled,
      },
    });

    let parsedArgs = [];
    try {
      parsedArgs = updated.args ? JSON.parse(updated.args) : [];
    } catch {
      parsedArgs = [];
    }

    let parsedEnv = {};
    try {
      parsedEnv = updated.env ? JSON.parse(updated.env) : {};
    } catch {
      parsedEnv = {};
    }

    return NextResponse.json({
      ...updated,
      args: parsedArgs,
      env: parsedEnv,
    });
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
