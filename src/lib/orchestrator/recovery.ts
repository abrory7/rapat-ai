import { prisma } from '@/lib/db';

interface RecoveryStore {
  $transaction<T>(
    operation: (tx: {
      session: {
        updateMany(args: {
          where: Record<string, unknown>;
          data: {
            status?: string;
            runToken?: string | null;
            leaseExpiresAt?: Date | null;
          };
        }): Promise<{ count: number }>;
      };
    }) => Promise<T>
  ): Promise<T>;
}

export interface RecoveryResult {
  runningPaused: number;
  compilingErrored: number;
  staleLeasesCleared: number;
}

export async function recoverInterruptedSessions(
  db: RecoveryStore = prisma as unknown as RecoveryStore,
  now = new Date()
): Promise<RecoveryResult> {
  return db.$transaction(async (tx) => {
    const running = await tx.session.updateMany({
      where: {
        status: 'RUNNING',
        OR: [
          { runToken: null },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: 'PAUSED',
        runToken: null,
        leaseExpiresAt: null,
      },
    });

    const compiling = await tx.session.updateMany({
      where: {
        status: 'COMPILING',
      },
      data: {
        status: 'ERROR',
        runToken: null,
        leaseExpiresAt: null,
      },
    });

    const staleLeases = await tx.session.updateMany({
      where: {
        status: { not: 'RUNNING' },
        OR: [
          { runToken: { not: null } },
          { leaseExpiresAt: { not: null } },
        ],
      },
      data: {
        runToken: null,
        leaseExpiresAt: null,
      },
    });

    return {
      runningPaused: running.count,
      compilingErrored: compiling.count,
      staleLeasesCleared: staleLeases.count,
    };
  });
}
