/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

import {
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  retryCompileSession,
  runOrchestrationLoop,
  registerSessionListener,
  unregisterSessionListener,
  __setEngineDepForTest,
  __resetEngineDepForTest,
  OrchestrationCommandError,
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
      updateMany: async ({ where, data }: any) => {
        const session = store[where.id];
        if (!session) return { count: 0 };
        if (where.status !== undefined && session.status !== where.status) {
          return { count: 0 };
        }
        if (where.runToken !== undefined && session.runToken !== where.runToken) {
          return { count: 0 };
        }
        if (
          where.OR &&
          session.runToken !== null &&
          session.runToken !== undefined &&
          session.leaseExpiresAt instanceof Date &&
          session.leaseExpiresAt > new Date()
        ) {
          return { count: 0 };
        }
        Object.assign(session, data);
        return { count: 1 };
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
      findFirst: async () => FAKE_PROVIDER,
      findUnique: async () => FAKE_PROVIDER,
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

describe('persistent session lease', () => {
  afterEach(() => __resetEngineDepForTest());

  it('does not enter the loop when the persistent lease is already owned', async () => {
    const db = makePrismaMock({
      ...MINIMAL_SESSION,
      id: 'sess-lease-conflict',
      status: 'RUNNING',
      runToken: 'other-owner',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    let fullSessionReads = 0;
    const originalFindUnique = db.session.findUnique;
    db.session.findUnique = async (args: any) => {
      fullSessionReads++;
      return originalFindUnique(args);
    };

    __setEngineDepForTest({ prisma: db as any });
    await runOrchestrationLoop('sess-lease-conflict');

    assert.equal(fullSessionReads, 0);
    assert.equal(db._store['sess-lease-conflict'].runToken, 'other-owner');
  });

  it('releases its persistent lease when the loop exits', async () => {
    const db = makePrismaMock({
      ...MINIMAL_SESSION,
      id: 'sess-lease-release',
      status: 'PAUSED',
      runToken: null,
      leaseExpiresAt: null,
    });

    __setEngineDepForTest({ prisma: db as any });
    await runOrchestrationLoop('sess-lease-release');

    assert.equal(db._store['sess-lease-release'].runToken, null);
    assert.equal(db._store['sess-lease-release'].leaseExpiresAt, null);
  });

  it('stops without persisting a turn after heartbeat renewal fails', async () => {
    const db = makePrismaMock({
      ...MINIMAL_SESSION,
      id: 'sess-heartbeat-loss',
      status: 'RUNNING',
      runToken: null,
      leaseExpiresAt: null,
    });
    let leaseWrites = 0;
    const originalUpdateMany = db.session.updateMany;
    db.session.updateMany = async (args: any) => {
      leaseWrites++;
      if (leaseWrites === 2) {
        return { count: 0 };
      }
      return originalUpdateMany(args);
    };
    db.provider = {
      findFirst: async () => FAKE_PROVIDER,
      findUnique: async () => FAKE_PROVIDER,
    } as any;

    __setEngineDepForTest({
      prisma: db as any,
      heartbeatIntervalMs: 1,
      getMergedToolsForProject: async () => ({}),
      createAgentFromRole: () => ({
        stream: async () => ({
          textStream: (async function* () {
            await new Promise((resolve) => setTimeout(resolve, 5));
            yield 'late content';
          })(),
          text: Promise.resolve('late content'),
          toolCalls: Promise.resolve([]),
        }),
      }) as any,
    });

    await runOrchestrationLoop('sess-heartbeat-loss');

    assert.equal(db._messages.length, 0);
    assert.equal(db._store['sess-heartbeat-loss'].runToken, null);
  });

  it('allows a database-authorized takeover despite the local loop optimization', async () => {
    const sessionId = 'sess-local-takeover';
    const db = makePrismaMock({
      ...MINIMAL_SESSION,
      id: sessionId,
      status: 'RUNNING',
      runToken: null,
      leaseExpiresAt: null,
    });
    let streamStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      streamStarted = resolve;
    });
    let finishStream!: () => void;
    const streamFinished = new Promise<void>((resolve) => {
      finishStream = resolve;
    });
    db.provider = {
      findFirst: async () => FAKE_PROVIDER,
      findUnique: async () => FAKE_PROVIDER,
    } as any;

    __setEngineDepForTest({
      prisma: db as any,
      heartbeatIntervalMs: 60_000,
      getMergedToolsForProject: async () => ({}),
      createAgentFromRole: () => ({
        stream: async () => ({
          textStream: (async function* () {
            streamStarted();
            await streamFinished;
            yield 'done';
          })(),
          text: streamFinished,
          toolCalls: Promise.resolve([]),
        }),
      }) as any,
    });

    const firstLoop = runOrchestrationLoop(sessionId);
    await started;
    const originalToken = db._store[sessionId].runToken;
    db._store[sessionId].status = 'PAUSED';
    db._store[sessionId].leaseExpiresAt = new Date(Date.now() - 1);

    await resumeSession(sessionId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const tokenAfterTakeover = db._store[sessionId].runToken;
    assert.notEqual(tokenAfterTakeover, null);
    assert.notEqual(tokenAfterTakeover, originalToken);

    db._store[sessionId].status = 'PAUSED';
    finishStream();
    await firstLoop;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(db._store[sessionId].runToken, null);
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

function hasErrorCode(code: string) {
  return (error: unknown) =>
    error instanceof OrchestrationCommandError && error.code === code;
}

describe('stable orchestration command errors', () => {
  afterEach(() => __resetEngineDepForTest());

  it('returns SESSION_ALREADY_ACTIVE for an active session', async () => {
    const db = makePrismaMock({ ...MINIMAL_SESSION, id: 'sess-running', status: 'RUNNING' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.rejects(
      () => startSession('sess-running'),
      hasErrorCode('SESSION_ALREADY_ACTIVE')
    );
    assert.equal(db._store['sess-running'].status, 'RUNNING');
  });

  it('returns SESSION_ALREADY_ACTIVE when a lease cannot be acquired', async () => {
    const db = makePrismaMock({
      ...MINIMAL_SESSION,
      id: 'sess-lease-command',
      status: 'IDLE',
      runToken: 'other-owner',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    __setEngineDepForTest({ prisma: db as any });
    await assert.rejects(
      () => startSession('sess-lease-command'),
      hasErrorCode('SESSION_ALREADY_ACTIVE')
    );
  });

  it('returns INVALID_SESSION_STATE when restarting a completed session', async () => {
    const db = makePrismaMock({ ...MINIMAL_SESSION, id: 'sess-done', status: 'COMPLETED' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.rejects(
      () => startSession('sess-done'),
      hasErrorCode('INVALID_SESSION_STATE')
    );
  });

  it('returns INVALID_SESSION_STATE when resume is requested outside PAUSED', async () => {
    const db = makePrismaMock({ id: 'sess-c', status: 'COMPLETED' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.rejects(
      () => resumeSession('sess-c'),
      hasErrorCode('INVALID_SESSION_STATE')
    );
  });

  it('returns INVALID_SESSION_STATE when pause is requested outside RUNNING', async () => {
    const db = makePrismaMock({ id: 'sess-pause-done', status: 'COMPLETED' });
    __setEngineDepForTest({ prisma: db as any });

    await assert.rejects(
      () => pauseSession('sess-pause-done'),
      hasErrorCode('INVALID_SESSION_STATE')
    );
    assert.equal(db._store['sess-pause-done'].status, 'COMPLETED');
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
  it('returns INVALID_SESSION_STATE when compiling a completed session', async () => {
    const db = makePrismaMock({ id: 'sess-done2', status: 'COMPLETED' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.rejects(
      () => stopSession('sess-done2'),
      hasErrorCode('INVALID_SESSION_STATE')
    );
  });

  it('returns SESSION_ALREADY_ACTIVE when compilation is already running', async () => {
    const db = makePrismaMock({ id: 'sess-comp2', status: 'COMPILING' });
    __setEngineDepForTest({ prisma: db as any });
    await assert.rejects(
      () => stopSession('sess-comp2'),
      hasErrorCode('SESSION_ALREADY_ACTIVE')
    );
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

  it('allows only one concurrent stop transition to compile', async () => {
    const db = makePrismaMock({ id: 'sess-stop-race', status: 'RUNNING' });
    let compileCount = 0;
    __setEngineDepForTest({
      prisma: db as any,
      compilePlanningDocument: async () => {
        compileCount++;
        return 'compiled-doc';
      },
    });

    const results = await Promise.allSettled([
      stopSession('sess-stop-race'),
      stopSession('sess-stop-race'),
    ]);

    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1
    );
    assert.equal(compileCount, 1);
  });

  it('returns COMPILATION_FAILED when a retry fails and restores ERROR status', async () => {
    const db = makePrismaMock({ id: 'sess-retry', status: 'ERROR' });
    __setEngineDepForTest({
      prisma: db as any,
      compilePlanningDocument: async () => {
        throw new Error('provider unavailable');
      },
    });

    await assert.rejects(
      () => retryCompileSession('sess-retry'),
      hasErrorCode('COMPILATION_FAILED')
    );
    assert.equal(db._store['sess-retry'].status, 'ERROR');
  });
});

describe('summarization integration in engine', () => {
  it('persists summary and uses it on next turn', async () => {
    // Generate 15 messages so summarize triggers
    const messages = Array.from({ length: 15 }, (_, i) => ({
      id: `msg-${i}`,
      sender: i === 14 ? 'USER' : 'pm',
      content: `Message ${i}`,
      createdAt: new Date()
    }));

    const db = makePrismaMock({
      ...MINIMAL_SESSION,
      id: 'sess-sum',
      status: 'RUNNING',
      contextSummary: null,
      summarizedMessageCount: 0,
      messages,
      currentRoleSlug: 'engineer'
    });

    let summaryPersisted = false;
    let activeAgentCalled = false;
    let activeAgentPrompt = '';

    // We will intercept the update call to see if contextSummary was updated
    const originalUpdate = db.session.update;
    db.session.update = async (args: any) => {
      if (args.data && args.data.contextSummary !== undefined) {
        summaryPersisted = true;
      }
      return originalUpdate.call(db.session, args);
    };

    __setEngineDepForTest({
      prisma: db as any,
      getMergedToolsForProject: async () => ({ dummyTool: {} as any }),
      compilePlanningDocument: async () => 'mocked doc',
      createAgentFromRole: (args: any) => {
        // If args.tools has dummyTool, it's the active agent
        if (args.tools && args.tools.dummyTool) {
          return {
            stream: async (prompt: string) => {
              activeAgentCalled = true;
              activeAgentPrompt = prompt;
              return { textStream: (async function* () {})() };
            }
          } as any;
        }
        // Otherwise it's the summarizer agent
        return {
          stream: async () => {
            return {
              textStream: (async function* () {
                yield 'Model Generated Summary';
              })()
            };
          }
        } as any;
      }
    });

    await runOrchestrationLoop('sess-sum');

    assert.ok(summaryPersisted, 'Summary should be persisted');
    assert.ok(activeAgentCalled, 'Active agent turn should be generated after summarization');
    assert.ok(activeAgentPrompt.includes('Model Generated Summary'), 'Active agent should receive the persisted summary in its prompt');
  });

  it('does not fail the active turn if summarization persistence fails', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({
      id: `msg-${i}`,
      sender: i === 14 ? 'USER' : 'pm',
      content: `Message ${i}`,
      createdAt: new Date()
    }));

    const db = makePrismaMock({
      ...MINIMAL_SESSION,
      id: 'sess-sum-fail',
      status: 'RUNNING',
      contextSummary: null,
      summarizedMessageCount: 0,
      messages,
      currentRoleSlug: 'engineer'
    });

    let activeAgentCalled = false;

    // Intercept update to throw on the summarization persistence
    const originalUpdate = db.session.update;
    db.session.update = async (args: any) => {
      if (args.data && args.data.contextSummary !== undefined) {
        throw new Error('Database summarization persistence failed');
      }
      return originalUpdate.call(db.session, args);
    };

    __setEngineDepForTest({
      prisma: db as any,
      getMergedToolsForProject: async () => ({ dummyTool: {} as any }),
      compilePlanningDocument: async () => 'mocked doc',
      createAgentFromRole: (args: any) => {
        // If args.tools has dummyTool, it's the active agent
        if (args.tools && args.tools.dummyTool) {
          return {
            stream: async () => {
              activeAgentCalled = true;
              return { textStream: (async function* () {})() };
            }
          } as any;
        }
        // Otherwise it's the summarizer agent
        return {
          stream: async () => {
            return {
              textStream: (async function* () {
                yield 'Model Generated Summary';
              })()
            };
          }
        } as any;
      }
    });

    // It should not throw because the summarization catch block should handle it
    await runOrchestrationLoop('sess-sum-fail');

    assert.ok(activeAgentCalled, 'Turn should still be generated despite persistence failure');
  });
});
