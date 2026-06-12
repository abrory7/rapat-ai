import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const template = await prisma.discussionTemplate.findUnique({
      where: { id },
      include: {
        templateRoles: {
          include: {
            role: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    return NextResponse.json({
      ...template,
      defaultFlow: JSON.parse(template.defaultFlow),
    });
  } catch (error) {
    console.error('Failed to fetch template:', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, maxRounds, rules, roleIds } = body;

    const template = await prisma.discussionTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    if (template.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot modify built-in templates' }, { status: 400 });
    }

    let defaultFlow = template.defaultFlow;
    if (Array.isArray(roleIds) && roleIds.length > 0) {
      const roles = await prisma.role.findMany({
        where: { id: { in: roleIds } },
      });
      const rolesMap = new Map(roles.map((r) => [r.id, r]));
      const orderedRoles = roleIds.map((rid) => rolesMap.get(rid)).filter(Boolean);
      defaultFlow = JSON.stringify(orderedRoles.map((r) => r!.slug));

      await prisma.templateRole.deleteMany({ where: { templateId: id } });
      for (let i = 0; i < roleIds.length; i++) {
        const roleId = roleIds[i];
        if (rolesMap.has(roleId)) {
          await prisma.templateRole.create({
            data: {
              templateId: id,
              roleId,
              order: i,
            },
          });
        }
      }
    }

    const updated = await prisma.discussionTemplate.update({
      where: { id },
      data: {
        name: name ?? template.name,
        description: description ?? template.description,
        maxRounds: maxRounds ?? template.maxRounds,
        rules: rules ?? template.rules,
        defaultFlow,
      },
    });

    const finalTemplate = await prisma.discussionTemplate.findUnique({
      where: { id },
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
      ...finalTemplate,
      defaultFlow: JSON.parse(finalTemplate!.defaultFlow),
    });
  } catch (error) {
    console.error('Failed to update template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const template = await prisma.discussionTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    if (template.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot delete built-in templates' }, { status: 400 });
    }
    await prisma.discussionTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
