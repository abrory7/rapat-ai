import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const roleSkills = await prisma.roleSkill.findMany({
      where: { roleId: id },
      include: { skill: true },
    });
    return NextResponse.json(roleSkills.map((rs) => rs.skill));
  } catch (error) {
    console.error('Failed to fetch role skills:', error);
    return NextResponse.json({ error: 'Failed to fetch role skills' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { skillIds } = body;
    if (!Array.isArray(skillIds)) {
      return NextResponse.json({ error: 'skillIds must be an array' }, { status: 400 });
    }

    await prisma.roleSkill.deleteMany({ where: { roleId: id } });

    if (skillIds.length > 0) {
      await prisma.roleSkill.createMany({
        data: skillIds.map((skillId) => ({
          roleId: id,
          skillId,
        })),
      });
    }

    const roleSkills = await prisma.roleSkill.findMany({
      where: { roleId: id },
      include: { skill: true },
    });
    return NextResponse.json(roleSkills.map((rs) => rs.skill));
  } catch (error) {
    console.error('Failed to update role skills:', error);
    return NextResponse.json({ error: 'Failed to update role skills' }, { status: 500 });
  }
}
