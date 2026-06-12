import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isSessionActive } from '@/lib/orchestrator/engine';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        template: {
          include: {
            templateRoles: {
              include: {
                role: true,
              },
              orderBy: { order: 'asc' },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Defensive check: reset orphaned RUNNING or COMPILING sessions if their loop is inactive in memory
    const isActive = isSessionActive(id);
    if (!isActive && (session.status === 'RUNNING' || session.status === 'COMPILING')) {
      const newStatus = session.status === 'COMPILING' ? 'ERROR' : 'PAUSED';
      console.log(`[Orchestration] Resetting orphaned session ${id} status from ${session.status} to ${newStatus}`);
      await prisma.session.update({
        where: { id },
        data: { status: newStatus },
      });
      session.status = newStatus;
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error('Failed to fetch session:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.session.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete session:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
