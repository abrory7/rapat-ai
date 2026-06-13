import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recoverInterruptedSessions } from './recovery';

interface RecoverySession {
  id: string;
  status: string;
  runToken: string | null;
  leaseExpiresAt: Date | null;
}

function makeRecoveryDb(records: RecoverySession[]) {
  const store = records.map((record) => ({ ...record }));
  let transactionCount = 0;

  const transactionClient = {
    session: {
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<RecoverySession>;
      }) => {
        let count = 0;
        for (const session of store) {
          const statusMatches =
            where.status === undefined ||
            session.status === where.status ||
            (typeof where.status === 'object' &&
              where.status !== null &&
              'not' in where.status &&
              session.status !== (where.status as { not: string }).not);
          const leaseConditions = where.OR as
            | Array<Record<string, unknown>>
            | undefined;
          const leaseMatches =
            leaseConditions === undefined ||
            leaseConditions.some((condition) => {
              if (condition.runToken === null) return session.runToken === null;
              if (condition.leaseExpiresAt === null) {
                return session.leaseExpiresAt === null;
              }
              if (
                typeof condition.leaseExpiresAt === 'object' &&
                condition.leaseExpiresAt !== null &&
                'lte' in condition.leaseExpiresAt
              ) {
                return (
                  session.leaseExpiresAt !== null &&
                  session.leaseExpiresAt <=
                    (condition.leaseExpiresAt as { lte: Date }).lte
                );
              }
              if (
                typeof condition.runToken === 'object' &&
                condition.runToken !== null &&
                'not' in condition.runToken
              ) {
                return session.runToken !== condition.runToken.not;
              }
              return false;
            });

          if (statusMatches && leaseMatches) {
            Object.assign(session, data);
            count++;
          }
        }
        return { count };
      },
    },
  };

  return {
    $transaction: async <T>(
      operation: (tx: typeof transactionClient) => Promise<T>
    ) => {
      transactionCount++;
      return operation(transactionClient);
    },
    store,
    get transactionCount() {
      return transactionCount;
    },
  };
}

describe('recoverInterruptedSessions', () => {
  it('pauses expired RUNNING sessions and clears stale lease metadata', async () => {
    const now = new Date('2026-06-13T00:00:00.000Z');
    const db = makeRecoveryDb([
      {
        id: 'expired-running',
        status: 'RUNNING',
        runToken: 'stale-token',
        leaseExpiresAt: new Date(now.getTime() - 1),
      },
      {
        id: 'active-running',
        status: 'RUNNING',
        runToken: 'active-token',
        leaseExpiresAt: new Date(now.getTime() + 30_000),
      },
    ]);

    await recoverInterruptedSessions(db, now);

    assert.deepEqual(db.store[0], {
      id: 'expired-running',
      status: 'PAUSED',
      runToken: null,
      leaseExpiresAt: null,
    });
    assert.equal(db.store[1].status, 'RUNNING');
    assert.equal(db.store[1].runToken, 'active-token');
  });

  it('marks interrupted COMPILING sessions as ERROR without invoking work', async () => {
    const db = makeRecoveryDb([
      {
        id: 'compiling',
        status: 'COMPILING',
        runToken: 'stale-token',
        leaseExpiresAt: new Date('2026-06-12T23:59:00.000Z'),
      },
    ]);

    const result = await recoverInterruptedSessions(
      db,
      new Date('2026-06-13T00:00:00.000Z')
    );

    assert.equal(db.store[0].status, 'ERROR');
    assert.equal(db.store[0].runToken, null);
    assert.equal(db.store[0].leaseExpiresAt, null);
    assert.equal(result.compilingErrored, 1);
  });

  it('leaves completed and paused statuses unchanged while clearing stale leases', async () => {
    const db = makeRecoveryDb([
      {
        id: 'completed',
        status: 'COMPLETED',
        runToken: 'stale-completed',
        leaseExpiresAt: new Date('2026-06-12T23:59:00.000Z'),
      },
      {
        id: 'paused',
        status: 'PAUSED',
        runToken: null,
        leaseExpiresAt: null,
      },
    ]);

    await recoverInterruptedSessions(db, new Date('2026-06-13T00:00:00.000Z'));

    assert.equal(db.store[0].status, 'COMPLETED');
    assert.equal(db.store[0].runToken, null);
    assert.equal(db.store[0].leaseExpiresAt, null);
    assert.equal(db.store[1].status, 'PAUSED');
  });

  it('is idempotent and performs each recovery pass in one transaction', async () => {
    const now = new Date('2026-06-13T00:00:00.000Z');
    const db = makeRecoveryDb([
      {
        id: 'running',
        status: 'RUNNING',
        runToken: null,
        leaseExpiresAt: null,
      },
    ]);

    const first = await recoverInterruptedSessions(db, now);
    const second = await recoverInterruptedSessions(db, now);

    assert.equal(first.runningPaused, 1);
    assert.equal(second.runningPaused, 0);
    assert.equal(db.transactionCount, 2);
  });
});
