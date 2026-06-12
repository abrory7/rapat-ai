import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const skills = await prisma.skill.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(skills);
  } catch (error) {
    console.error('Failed to fetch skills:', error);
    return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, content } = body;
    if (!name || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const skill = await prisma.skill.create({
      data: {
        name,
        description,
        content,
        isBuiltIn: false,
      },
    });
    return NextResponse.json(skill);
  } catch (error) {
    console.error('Failed to create skill:', error);
    return NextResponse.json({ error: 'Failed to create skill' }, { status: 500 });
  }
}
