import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      include: {
        _count: {
          select: { sessions: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, repoPath, ignoreRules } = body;
    if (!name || !repoPath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
      const stat = fs.statSync(repoPath);
      if (!stat.isDirectory()) {
        return NextResponse.json(
          { error: 'Repository path must be a valid directory' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Repository path does not exist on the filesystem' },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        repoPath,
        ignoreRules,
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
