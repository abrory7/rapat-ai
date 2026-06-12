import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const configs = await prisma.mcpServerConfig.findMany({
      where: { projectId: id },
    });
    const parsed = configs.map((c) => {
      let parsedArgs = [];
      try {
        parsedArgs = c.args ? JSON.parse(c.args) : [];
      } catch {
        parsedArgs = [];
      }

      let parsedEnv = {};
      try {
        parsedEnv = c.env ? JSON.parse(c.env) : {};
      } catch {
        parsedEnv = {};
      }

      return {
        ...c,
        args: parsedArgs,
        env: parsedEnv,
      };
    });
    return NextResponse.json(parsed);
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
        env: env ? JSON.stringify(env) : null,
        enabled: enabled ?? true,
      },
    });

    let parsedArgs = [];
    try {
      parsedArgs = config.args ? JSON.parse(config.args) : [];
    } catch {
      parsedArgs = [];
    }

    let parsedEnv = {};
    try {
      parsedEnv = config.env ? JSON.parse(config.env) : {};
    } catch {
      parsedEnv = {};
    }

    return NextResponse.json({
      ...config,
      args: parsedArgs,
      env: parsedEnv,
    });
  } catch (error) {
    console.error('Failed to create MCP config:', error);
    return NextResponse.json({ error: 'Failed to create MCP config' }, { status: 500 });
  }
}
