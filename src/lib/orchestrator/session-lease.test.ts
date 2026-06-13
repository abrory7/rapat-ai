import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  acquireSessionLease,
  heartbeatSessionLease,
  releaseSessionLease,
  SESSION_HEARTBEAT_MS,
  SESSION_LEASE_MS,
} from './session-lease';

interface LeaseRecord {
  id: string;
  runToken: string | null;
  leaseExpiresAt: Date | null;
}

function makeLeaseDb(record: LeaseRecord | null) {
  const store = record ? { ...record } : null;
  const updateManyCalls: Array<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [];

  return {
    session: {
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          runToken?: string | null;
          OR?: Array<Record<string, unknown>>;
        };
        data: { runToken?: string | null; leaseExpiresAt?: Date | null };
      }) => {
        updateManyCalls.push({ where, data });
        if (!store || store.id !== where.id) {
          return { count: 0 };
        }

        const tokenMatches =
          where.runToken === undefined || store.runToken === where.runToken;
        const expiryCondition = where.OR?.find(
          (condition) =>
            typeof condition.leaseExpiresAt === 'object' &&
            condition.leaseExpiresAt !== null
        )?.leaseExpiresAt as { lte: Date } | undefined;
        const leaseAvailable =
          where.OR === undefined ||
          store.runToken === null ||
          store.leaseExpiresAt === null ||
          (expiryCondition !== undefined &&
            store.leaseExpiresAt <= expiryCondition.lte);

        if (!tokenMatches || !leaseAvailable) {
          return { count: 0 };
        }

        Object.assign(store, data);
        return { count: 1 };
      },
    },
    store,
    updateManyCalls,
  };
}

describe('session lease', () => {
  it('defines a lease interval longer than the heartbeat interval', () => {
    assert.equal(SESSION_LEASE_MS, 30_000);
    assert.equal(SESSION_HEARTBEAT_MS, 10_000);
    assert.ok(SESSION_HEARTBEAT_MS < SESSION_LEASE_MS);
  });

  it('acquires an available lease with one conditional updateMany', async () => {
    const now = new Date('2026-06-13T00:00:00.000Z');
    const db = makeLeaseDb({
      id: 'session-1',
      runToken: null,
      leaseExpiresAt: null,
    });

    const token = await acquireSessionLease(db, 'session-1', now, () => 'token-1');

    assert.equal(token, 'token-1');
    assert.equal(db.updateManyCalls.length, 1);
    assert.equal(db.store?.runToken, 'token-1');
    assert.deepEqual(
      db.store?.leaseExpiresAt,
      new Date(now.getTime() + SESSION_LEASE_MS)
    );
  });

  it('rejects acquisition while another lease is active', async () => {
    const now = new Date('2026-06-13T00:00:00.000Z');
    const db = makeLeaseDb({
      id: 'session-1',
      runToken: 'existing-token',
      leaseExpiresAt: new Date(now.getTime() + 1_000),
    });

    const token = await acquireSessionLease(db, 'session-1', now, () => 'token-2');

    assert.equal(token, null);
    assert.equal(db.store?.runToken, 'existing-token');
  });

  it('takes over an expired lease', async () => {
    const now = new Date('2026-06-13T00:00:00.000Z');
    const db = makeLeaseDb({
      id: 'session-1',
      runToken: 'expired-token',
      leaseExpiresAt: new Date(now.getTime() - 1),
    });

    const token = await acquireSessionLease(db, 'session-1', now, () => 'token-2');

    assert.equal(token, 'token-2');
    assert.equal(db.store?.runToken, 'token-2');
  });

  it('renews the lease only for the current token', async () => {
    const now = new Date('2026-06-13T00:00:00.000Z');
    const db = makeLeaseDb({
      id: 'session-1',
      runToken: 'token-1',
      leaseExpiresAt: now,
    });

    assert.equal(
      await heartbeatSessionLease(db, 'session-1', 'wrong-token', now),
      false
    );
    assert.equal(
      await heartbeatSessionLease(db, 'session-1', 'token-1', now),
      true
    );
    assert.deepEqual(
      db.store?.leaseExpiresAt,
      new Date(now.getTime() + SESSION_LEASE_MS)
    );
  });

  it('releases the lease only for the current token', async () => {
    const db = makeLeaseDb({
      id: 'session-1',
      runToken: 'token-1',
      leaseExpiresAt: new Date('2026-06-13T00:00:30.000Z'),
    });

    assert.equal(
      await releaseSessionLease(db, 'session-1', 'wrong-token'),
      false
    );
    assert.equal(db.store?.runToken, 'token-1');

    assert.equal(await releaseSessionLease(db, 'session-1', 'token-1'), true);
    assert.equal(db.store?.runToken, null);
    assert.equal(db.store?.leaseExpiresAt, null);
  });
});
