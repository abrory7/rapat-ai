import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        skills: {
          include: {
            skill: true,
          },
        },
        provider: true,
      },
    });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    return NextResponse.json(role);
  } catch (error) {
    console.error('Failed to fetch role:', error);
    return NextResponse.json({ error: 'Failed to fetch role' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, slug, systemPrompt, modelId, providerId, color, icon, skillIds } = body;

    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const formattedSlug = slug ? slug.toLowerCase().trim() : role.slug;
    if (slug && formattedSlug !== role.slug) {
      const existing = await prisma.role.findUnique({ where: { slug: formattedSlug } });
      if (existing) {
        return NextResponse.json({ error: 'Role with this slug already exists' }, { status: 400 });
      }
    }

    const updated = await prisma.role.update({
      where: { id },
      data: {
        name: name ?? role.name,
        slug: formattedSlug,
        systemPrompt: systemPrompt ?? role.systemPrompt,
        modelId: modelId === undefined ? role.modelId : (modelId || null),
        providerId: providerId === undefined ? role.providerId : (providerId || null),
        color: color ?? role.color,
        icon: icon ?? role.icon,
      },
    });

    if (Array.isArray(skillIds)) {
      await prisma.roleSkill.deleteMany({ where: { roleId: id } });
      if (skillIds.length > 0) {
        await prisma.roleSkill.createMany({
          data: skillIds.map((skillId) => ({
            roleId: id,
            skillId,
          })),
        });
      }
    }

    const finalRole = await prisma.role.findUnique({
      where: { id },
      include: {
        skills: {
          include: {
            skill: true,
          },
        },
      },
    });

    return NextResponse.json(finalRole);
  } catch (error) {
    console.error('Failed to update role:', error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    if (role.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot delete built-in roles' }, { status: 400 });
    }
    await prisma.role.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete role:', error);
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 });
  }
}
