import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { toProviderSummary } from '@/lib/providers/provider-dto';

export async function GET() {
  try {
    const roles = await prisma.role.findMany({
      include: {
        skills: {
          include: {
            skill: true,
          },
        },
        provider: true,
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(
      roles.map((role) => ({
        ...role,
        provider: role.provider ? toProviderSummary(role.provider) : null,
      }))
    );
  } catch (error) {
    console.error('Failed to fetch roles:', error);
    return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, slug, systemPrompt, modelId, providerId, color, icon, skillIds } = body;
    if (!name || !slug || !systemPrompt || !color || !icon) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const formattedSlug = slug.toLowerCase().trim();
    const existing = await prisma.role.findUnique({ where: { slug: formattedSlug } });
    if (existing) {
      return NextResponse.json({ error: 'Role with this slug already exists' }, { status: 400 });
    }

    const role = await prisma.role.create({
      data: {
        name,
        slug: formattedSlug,
        systemPrompt,
        modelId: modelId || null,
        providerId: providerId || null,
        color,
        icon,
        isBuiltIn: false,
      },
    });

    if (Array.isArray(skillIds) && skillIds.length > 0) {
      await prisma.roleSkill.createMany({
        data: skillIds.map((skillId) => ({
          roleId: role.id,
          skillId,
        })),
      });
    }

    const created = await prisma.role.findUnique({
      where: { id: role.id },
      include: {
        skills: {
          include: {
            skill: true,
          },
        },
      },
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error('Failed to create role:', error);
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }
}
