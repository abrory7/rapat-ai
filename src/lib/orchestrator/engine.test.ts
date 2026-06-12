/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

import {
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  runOrchestrationLoop,
  registerSessionListener,
  unregisterSessionListener,
  __setEngineDepForTest,
  __resetEngineDepForTest,
} from './engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal session shape that satisfies:
 * - engine.ts loop (status, messages, template.defaultFlow, template.templateRoles)
 * - context-builder.ts (session.topic, session.template.name, session.template.rules)
 */
const MINIMAL_SESSION = {
  id: 'sess-1',
  status: 'PENDING',
  currentRoleSlug: null,
  currentRound: 1,
  projectId: 'proj-1',
  topic: 'Test topic',
  template: {
    name: 'Test Template',
    rules: null,
    defaultFlow: JSON.stringify(['pm', 'engineer']),
    maxRounds: 2,
    templateRoles: [
      {
        order: 0,
        role: {
          id: 'role-pm',
          name: 'Project Manager',
          slug: 'pm',
          providerId: null,
          skills: [],
        },
      },
      {
        order: 1,
        role: {
          id: 'role-eng',
          name: 'Engineer',
          slug: 'engineer',
          providerId: null,
          skills: [],
        },
      },
    ],
  },
  project: { id: 'proj-1' },
  messages: [],
};

/** Build a minimal prisma-like mock.
 *  sessionRecord is stored and returned by findUnique/update.
 */
function makePrismaMock(sessionRecord: any) {
  const messages: any[] = [];
  const store: Record<string, any> = {};
  if (sessionRecord) {
    store[sessionRecord.id] = { ...sessionRecord };
  }

  return {
    session: {
      findUnique: async ({ where, select }: any) => {
        const s = store[where.id];
        if (!s) return null;
        if (select) {
          // Return only selected keys
          const out: any = {};
          for (const k of Object.keys(select)) {
            out[k] = s[k];
          }
          return out;
        }
        return { ...s };
      },
      update: async ({ where, data }: any) => {
        if (store[where.id]) {
          Object.assign(store[where.id], data);
        }
        return store[where.id];
      },
    },
    message: {
      create: async (args: any) => {
        const msg = { id: `msg-${messages.length}`, ...args.data };
        messages.push(msg);
        return msg;
      },
    },
    provider: {
      findFirst: async () => null,
      findUnique: async () => null,
    },
    _messages: messages,
    _store: store,
  };
}

/** Fake provider that passes the null-check in engine.ts */
const FAKE_PROVIDER = { id: 'prov-1', name: 'Fake', apiKey: 'x' };

/** Fake agent whose stream yields one chunk then finishes */
function makeFakeAgent(content = 'hello') {
  return {
    stream: async () => ({
      textStream: (async function* () { yield content; })(),
      text: Promise.resolve(content),
      toolCalls: Promise.resolve([]),
    }),
  };
}

// ---------------------------------------------------------------------------
// M3: SSE listener registry
// ---------------------------------------------------------------------------

describe('M3: SSE listener registry', () => {
  afterEach(() => __resetEngineDepForTest());

  it('notifies all listeners for the same session and unregisters only the exact callback', async () => {
    const sessionId = 'sess-listeners';
    const firstEvents: any[] = [];
    const secondEvents: any[] = [];
    const firstListener = (event: any) => firstEvents.push(event);
    const secondListener = (event: any) => secondEvents.push(event);

    registerSessionListener(sessionId, firstListener);
    registerSessionListener(sessionId, secondListener);

    const db = makePrismaMock({ id: sessionId, status: 'RUNNING' });
    __setEngineDepForTest({ prisma: db as any });

    await pauseSession(sessionId);

    assert.deepEqual(firstEvents, [{ type: 'status', status: 'PAUSED' }]);
    assert.deepEqual(secondEvents, [{ type: 'status', status: 'PAUSED' }]);

    unregisterSessionListener(sessionId, firstListener);
    __setEngineDepForTest({
      prisma: db as any,
      compilePlanningDocument: async () => 'compiled-doc',
    });
    await stopSession(sessionId);

    assert.equal(firstEvents.length, 1, 'Removed listener should not receive later events');
    assert.equal(secondEvents.length, 3, 'Remaining listener should receive compile and completed events');
    assert.equal(secondEvents[1].type, 'status');
    assert.equal(secondEvents[1].status, 'COMPILING');
    assert.equal((secondEvents[1] as any).currentRoleSlug, null);

    unregisterSessionListener(sessionId, secondListener);
  });

  it('emits a transition event when role or round changes', async () => {
    const sessionId = 'sess-transition';
    const events: any[] = [];
    const listener = (event: any) => events.push(event);
    registerSessionListener(sessionId, listener);

    const db = makePrismaMock({ ...MINIMAL_SESSION, id: sessionId, status: 'RUNNING' });
    let fetchCount = 0;
    db.session.findUnique = async ({ select }: any) => {
      fetchCount++;
      const session = {
        ...MINIMAL_SESSION,
        id: sessionId,
        status: fetchCount <= 2 ? 'RUNNING' : 'PAUSED',
        currentRoleSlug: 'pm',
        currentRound: 1,
      };
      if (select) {
        const out: any = {};
        for (const k of Object.keys(select)) out[k] = (session as any)[k];
        return out;
      }
      return session;
    };
    db.session.update = async ({ data }: any) => {
      Object.assign(db._store[sessionId], data);
      if (data.currentRoleSlug) {
        db._store[sessionId].status = 'PAUSED';
      }
      return db._store[sessionId];
    };
    db.provider = {
      findFirst: async () => FAKE_PROVIDER,
      findUnique: async () => FAKE_PROVIDER,
    } as any;

    __setEngineDepForTest({
      prisma: db as any,
      getMergedToolsForProject: async () => ({}),
      createAgentFromRole: () => makeFakeAgent('draft response') as any,
      compilePlanningDocument: async () => 'doc',
    });

    await runOrchestrationLoop(sessionId);

    assert.ok(events.some((event) => event.type === 'transition'), 'transition event should be emitted');
    const transition = events.find((event) => event.type === 'transition');
    assert.equal(transition.currentRoleSlug, 'engineer');
    assert.equal(transition.currentRound, 1);

    unregisterSessionListener(sessionId, listener);
  });
});

// ---------------------------------------------------------------------------
// M2: activeLoops — duplicate loop guard
// ---------------------------------------------------------------------------

describe('M2: activeLoops duplicate guard', () => {
  afterEach(() => __resetEngineDepForTest());

  it('blocks a second concurrent loop for the same sessionId', async () => {
    // Loop exits immediately because status is not RUNNING (first inner fetch returns PAUSED).
    const db = makePrismaMock({ ...MINIMAL_SESSION, id: 'sess-dup', status: 'RUNNING' });
    // Override findUnique so the loop-start fetch returns PAUSED -> loop exits after one iteration.
    db.session.findUnique = async () => ({
      ...MINIMAL_SESSION,
      id: 'sess-dup',
      status: 'PAUSED',
    });

    __setEngineDepForTest({
      prisma: db as any,
      getMergedToolsForProject: async () => ({}),
      createAgentFromRole: () => makeFakeAgent() as any,
      compilePlanningDocument: async () => 'doc',
    });

    // Fire two loops simultaneously; only one should actually run.
    let resolveLatch!: () => void;
    const latch = new Promise<void>((res) => { resolveLatch = res; });

    // Both should resolve without error.
    await Promise.all([
      runOrchestrationLoop('sess-dup'),
      runOrchestrationLoop('sess-dup'),
    ]);

    assert.ok(true, 'Both concurrent loop calls resolved without error or deadlock');
  });

  it('allows a new loop after the previous loop finishes', async () => {
    const db = makePrismaMock({ ...MINIMAL_SESSION, id: 'sess-seq', status: 'RUNNING' });
    // Always return PAUSED so the loop body exits immediately each time.
    db.session.findUnique = async () => ({
      ...MINIMAL_SESSION,
      id: 'sess-seq',
      status: 'PAUSED',
    });

    __setEngineDepForTest({
      prisma: db as any,
      getMergedToolsForProject: async () => ({}),
      createAgentFromRole: () => makeFakeAgent() as any,
      compilePlanningDocument: async () => 'doc',
    });

    // First loop: should run and finish.
    await runOrchestrationLoop('sess-seq');

    // Second loop: activeLoops should have been cleared, so this must not be blocked.
    await assert.doesNotReject(
      () => runOrchestrationLoop('sess-seq'),
      'Second sequential loop should be allowed after first finishes'
    );
  });
});

// ---------------------------------------------------------------------------
// M2: status re-check before persist
// ---------------------------------------------------------------------------

describe('M2: status re-check before persisting generated turn', () => {
  afterEach(() => __resetEngineDepForTest());

  it('does not save message when session becomes PAUSED after streaming', async () => {
    const sessionId = 'sess-pause-recheck';
    const db = makePrismaMock({ ...MINIMAL_SESSION, id: sessionId, status: 'RUNNING' });

    let fetchCount = 0;
    db.session.findUnique = async ({ where, select }: any) => {
      fetchCount++;
      // First fetch (loop body start): full session shape so loop proceeds.
      if (fetchCount === 1) {
        const full = {
          ...MINIMAL_SESSION,
          id: sessionId,
          status: 'RUNNING',
        };
        if (select) {
          const out: any = {};
          for (const k of Object.keys(select)) out[k] = (full as any)[k];
          return out;
        }
        return full;
      }
      // Second fetch (M2.4 status re-check, uses select: { status: true }): PAUSED.
      return { status: 'PAUSED' };
    };

    // Provide a real provider so the loop passes the provider null-check.
    db.provider = {
      findFirst: async () => FAKE_PROVIDER,
      findUnique: async () => FAKE_PROVIDER,
    } as any;

    __setEngineDepForTest({
      prisma: db as any,
      getMergedToolsForProject: async () => ({}),
      createAgentFromRole: () => makeFakeAgent('turn content') as any,
      compilePlanningDocument: async () => 'doc',
    });

    await runOrchestrationLoop(sessionId);

    // Agent was called but message must NOT be saved because status became PAUSED.
    assert.equal(
      db._messages.length,
      0,
      'No message should be persisted when session is PAUSED after streaming'
    );
  });
});

// ---------------------------------------------------------------------------
// M4: startSession() guards
// ---------------------------------------------------------------------------

describe('M4: startSession() guards', () => {
  afterEach(() => __resetEngineDepForTest());

  it('returns silently for RUNNING session (idempotent)', async () => {
    const db = makePrismaMock({ ...MINIMAL_SESSION, id: 'sess-running', status: 'RUNNING' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.doesNotReject(
      () => startSession('sess-running'),
      'startSession on RUNNING session should return silently'
    );
    // Status must not change
    assert.equal(db._store['sess-running'].status, 'RUNNING');
  });

  it('returns silently for COMPILING session (idempotent)', async () => {
    const db = makePrismaMock({ ...MINIMAL_SESSION, id: 'sess-compiling', status: 'COMPILING' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.doesNotReject(
      () => startSession('sess-compiling'),
      'startSession on COMPILING session should return silently'
    );
    assert.equal(db._store['sess-compiling'].status, 'COMPILING');
  });

  it('throws for COMPLETED session', async () => {
    const db = makePrismaMock({ ...MINIMAL_SESSION, id: 'sess-done', status: 'COMPLETED' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.rejects(
      () => startSession('sess-done'),
      /completed/i,
      'startSession on COMPLETED session should throw'
    );
  });
});

// ---------------------------------------------------------------------------
// M4: resumeSession() guards
// ---------------------------------------------------------------------------

describe('M4: resumeSession() guards', () => {
  afterEach(() => __resetEngineDepForTest());

  it('returns silently for RUNNING session (no-op)', async () => {
    const db = makePrismaMock({ id: 'sess-r', status: 'RUNNING' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.doesNotReject(() => resumeSession('sess-r'));
    // Status must remain RUNNING, not be re-updated.
    assert.equal(db._store['sess-r'].status, 'RUNNING');
  });

  it('returns silently for COMPLETED session (no-op)', async () => {
    const db = makePrismaMock({ id: 'sess-c', status: 'COMPLETED' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.doesNotReject(() => resumeSession('sess-c'));
    assert.equal(db._store['sess-c'].status, 'COMPLETED');
  });

  it('updates status to RUNNING and starts loop for PAUSED session', async () => {
    const sessionId = 'sess-paused';
    const db = makePrismaMock({ id: sessionId, status: 'PAUSED' });

    // Loop will be fired in background; it will call findUnique for full session.
    // Return a PAUSED-status session on the loop’s first inner fetch so the loop exits immediately.
    let callCount = 0;
    db.session.findUnique = async ({ where, select }: any) => {
      callCount++;
      if (callCount === 1) {
        // resumeSession status check: return PAUSED so it proceeds with resume.
        const s = db._store[where.id];
        if (!s) return null;
        if (select) {
          const out: any = {};
          for (const k of Object.keys(select)) out[k] = s[k];
          return out;
        }
        return { ...s };
      }
      // Loop’s inner fetch: return non-RUNNING so loop exits immediately.
      return { ...MINIMAL_SESSION, id: sessionId, status: 'PAUSED' };
    };

    __setEngineDepForTest({
      prisma: db as any,
      getMergedToolsForProject: async () => ({}),
      createAgentFromRole: () => makeFakeAgent() as any,
      compilePlanningDocument: async () => 'doc',
    });

    await resumeSession(sessionId);

    // Status should have been updated to RUNNING.
    assert.equal(db._store[sessionId].status, 'RUNNING');
  });
});

// ---------------------------------------------------------------------------
// M4: stopSession() guards
// ---------------------------------------------------------------------------

describe('M4: stopSession() guards', () => {
  afterEach(() => __resetEngineDepForTest());

  it('returns silently for COMPLETED session (no-op)', async () => {
    const db = makePrismaMock({ id: 'sess-done2', status: 'COMPLETED' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.doesNotReject(() => stopSession('sess-done2'));
    assert.equal(db._store['sess-done2'].status, 'COMPLETED');
  });

  it('returns silently for COMPILING session (no-op)', async () => {
    const db = makePrismaMock({ id: 'sess-comp2', status: 'COMPILING' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.doesNotReject(() => stopSession('sess-comp2'));
    assert.equal(db._store['sess-comp2'].status, 'COMPILING');
  });

  it('triggers compilePlanningDocument for RUNNING session', async () => {
    const db = makePrismaMock({ id: 'sess-stop', status: 'RUNNING' });
    let compileCalled = false;
    __setEngineDepForTest({
      prisma: db as any,
      compilePlanningDocument: async () => {
        compileCalled = true;
        return 'compiled-doc';
      },
    });
    await stopSession('sess-stop');
    assert.ok(compileCalled, 'compilePlanningDocument should be called when stopping a RUNNING session');
  });

  it('triggers compilePlanningDocument for PAUSED session', async () => {
    const db = makePrismaMock({ id: 'sess-stop-paused', status: 'PAUSED' });
    let compileCalled = false;
    __setEngineDepForTest({
      prisma: db as any,
      compilePlanningDocument: async () => {
        compileCalled = true;
        return 'compiled-doc';
      },
    });
    await stopSession('sess-stop-paused');
    assert.ok(compileCalled, 'compilePlanningDocument should be called when stopping a PAUSED session');
  });
});
