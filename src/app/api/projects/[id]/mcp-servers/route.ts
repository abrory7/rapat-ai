import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encodeEnvironment, toMcpServerDto } from '@/lib/mcp/environment-secrets';
import { parseMcpServerCreate } from '@/lib/mcp/config-schema';
import { invalidateProjectMcpAfter } from '@/mastra/mcp/client-manager';
import { ZodError } from 'zod';

function invalidMcpConfig() {
  return NextResponse.json(
    {
      code: 'INVALID_MCP_CONFIG',
      error: 'Invalid MCP server configuration.',
    },
    { status: 400 }
  );
}

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
    const body: unknown = await req.json();
    const input = parseMcpServerCreate(body);
    const config = await invalidateProjectMcpAfter(id, () =>
      prisma.mcpServerConfig.create({
        data: {
          projectId: id,
          name: input.name,
          type: input.type,
          command: input.type === 'stdio' ? input.command : null,
          url: input.type === 'sse' ? input.url : null,
          args:
            input.type === 'stdio' && input.args
              ? JSON.stringify(input.args)
              : null,
          env: input.env ? encodeEnvironment(input.env) : null,
          enabled: input.enabled ?? true,
        },
      })
    );

    return NextResponse.json(toMcpServerDto(config));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return invalidMcpConfig();
    }
    console.error('Failed to create MCP config:', error);
    return NextResponse.json({ error: 'Failed to create MCP config' }, { status: 500 });
  }
}
