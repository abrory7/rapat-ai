import { randomUUID } from 'node:crypto';

export const SESSION_LEASE_MS = 30_000;
export const SESSION_HEARTBEAT_MS = 10_000;

interface SessionLeaseStore {
  session: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: {
        runToken?: string | null;
        leaseExpiresAt?: Date | null;
      };
    }): Promise<{ count: number }>;
  };
}

export async function acquireSessionLease(
  db: SessionLeaseStore,
  sessionId: string,
  now = new Date(),
  createToken: () => string = randomUUID
): Promise<string | null> {
  const runToken = createToken();
  const result = await db.session.updateMany({
    where: {
      id: sessionId,
      OR: [
        { runToken: null },
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lte: now } },
      ],
    },
    data: {
      runToken,
      leaseExpiresAt: new Date(now.getTime() + SESSION_LEASE_MS),
    },
  });

  return result.count === 1 ? runToken : null;
}

export async function heartbeatSessionLease(
  db: SessionLeaseStore,
  sessionId: string,
  runToken: string,
  now = new Date()
): Promise<boolean> {
  const result = await db.session.updateMany({
    where: {
      id: sessionId,
      runToken,
    },
    data: {
      leaseExpiresAt: new Date(now.getTime() + SESSION_LEASE_MS),
    },
  });

  return result.count === 1;
}

export async function releaseSessionLease(
  db: SessionLeaseStore,
  sessionId: string,
  runToken: string
): Promise<boolean> {
  const result = await db.session.updateMany({
    where: {
      id: sessionId,
      runToken,
    },
    data: {
      runToken: null,
      leaseExpiresAt: null,
    },
  });

  return result.count === 1;
}
