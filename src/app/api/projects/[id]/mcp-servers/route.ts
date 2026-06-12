import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encodeEnvironment, toMcpServerDto } from '@/lib/mcp/environment-secrets';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const configs = await prisma.mcpServerConfig.findMany({
      where: { projectId: id },
    });
    return NextResponse.json(configs.map(toMcpServerDto));
  } catch (error) {
    console.error('Failed to fetch MCP configs:', error);
    return NextResponse.json({ error: 'Failed to fetch MCP configs' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, type, command, url, args, env, enabled } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Missing name or type' }, { status: 400 });
    }

    const config = await prisma.mcpServerConfig.create({
      data: {
        projectId: id,
        name,
        type,
        command,
        url,
        args: args ? JSON.stringify(args) : null,
        env: env ? encodeEnvironment(env) : null,
        enabled: enabled ?? true,
      },
    });

    return NextResponse.json(toMcpServerDto(config));
  } catch (error) {
    console.error('Failed to create MCP config:', error);
    return NextResponse.json({ error: 'Failed to create MCP config' }, { status: 500 });
  }
}
