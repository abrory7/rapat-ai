import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const templates = await prisma.discussionTemplate.findMany({
      include: {
        templateRoles: {
          include: {
            role: true,
          },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    const parsed = templates.map((t) => {
      let parsedFlow = [];
      try {
        parsedFlow = JSON.parse(t.defaultFlow);
      } catch {
        parsedFlow = [];
      }
      return {
        ...t,
        defaultFlow: parsedFlow,
      };
    });
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, maxRounds, rules, roleIds } = body;
    if (!name || !Array.isArray(roleIds) || roleIds.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } },
    });

    const rolesMap = new Map(roles.map((r) => [r.id, r]));
    const orderedRoles = roleIds.map((id) => rolesMap.get(id)).filter(Boolean);
    const defaultFlow = orderedRoles.map((r) => r!.slug);

    const template = await prisma.discussionTemplate.create({
      data: {
        name,
        description,
        maxRounds: maxRounds ?? 2,
        rules,
        defaultFlow: JSON.stringify(defaultFlow),
        isBuiltIn: false,
      },
    });

    for (let i = 0; i < roleIds.length; i++) {
      const roleId = roleIds[i];
      if (rolesMap.has(roleId)) {
        await prisma.templateRole.create({
          data: {
            templateId: template.id,
            roleId,
            order: i,
          },
        });
      }
    }

    const created = await prisma.discussionTemplate.findUnique({
      where: { id: template.id },
      include: {
        templateRoles: {
          include: {
            role: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    return NextResponse.json({
      ...created,
      defaultFlow: JSON.parse(created!.defaultFlow),
    });
  } catch (error) {
    console.error('Failed to create template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
