import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        mcpServers: true,
        sessions: {
          include: {
            template: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, repoPath, ignoreRules } = body;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (repoPath) {
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
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        name: name ?? project.name,
        description: description ?? project.description,
        repoPath: repoPath ?? project.repoPath,
        ignoreRules: ignoreRules ?? project.ignoreRules,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
