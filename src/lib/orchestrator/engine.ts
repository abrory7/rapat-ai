/* eslint-disable @typescript-eslint/no-explicit-any */

import { prisma } from '@/lib/db';
import { createAgentFromRole } from '@/mastra/agents/factory';
import { getMergedToolsForProject } from '@/mastra/mcp/client-manager';
import { buildContext } from './context-builder';
import { parseResponse } from './response-parser';
import { getClosedRoles, getNextRoleAndRound } from './state-machine';
import { compilePlanningDocument } from '@/mastra/workflows/compilation';
import {
  acquireSessionLease,
  heartbeatSessionLease,
  releaseSessionLease,
  SESSION_HEARTBEAT_MS,
} from './session-lease';
import { summarizeHistoryIfNeeded } from './history-summarizer';

// Simple in-memory registry of active stream listeners
const activeListeners = new Map<string, Set<(data: any) => void>>();

export type OrchestrationErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_ALREADY_ACTIVE'
  | 'INVALID_SESSION_STATE'
  | 'COMPILATION_FAILED';

export class OrchestrationCommandError extends Error {
  constructor(
    public readonly code: OrchestrationErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'OrchestrationCommandError';
  }
}

export function registerSessionListener(sessionId: string, callback: (data: any) => void) {
  const listeners = activeListeners.get(sessionId) ?? new Set<(data: any) => void>();
  listeners.add(callback);
  activeListeners.set(sessionId, listeners);
}

export function unregisterSessionListener(sessionId: string, callback: (data: any) => void) {
  const listeners = activeListeners.get(sessionId);
  if (!listeners) return;

  listeners.delete(callback);
  if (listeners.size === 0) {
    activeListeners.delete(sessionId);
  }
}

function notifyListener(sessionId: string, data: any) {
  const listeners = activeListeners.get(sessionId);
  if (listeners) {
    for (const listener of listeners) {
    listener(data);
    }
  }
}

const isTest = typeof process !== 'undefined' && (
  process.env.NODE_ENV === 'test' ||
  (process.argv && process.argv.some(arg => arg.includes('test') || arg.includes('tsx')))
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Internal dependency container — swap out in tests via the helpers below.
const engineDeps = {
  prisma,
  createAgentFromRole,
  getMergedToolsForProject,
  compilePlanningDocument,
  delayMs: isTest ? 0 : 2500,
  heartbeatIntervalMs: SESSION_HEARTBEAT_MS,
};

/** @internal Test-only: override specific engine dependencies. */
export function __setEngineDepForTest(
  overrides: Partial<typeof engineDeps>
): void {
  Object.assign(engineDeps, overrides);
}

/** @internal Test-only: restore all engine dependencies to production values. */
export function __resetEngineDepForTest(): void {
  engineDeps.prisma = prisma;
  engineDeps.createAgentFromRole = createAgentFromRole;
  engineDeps.getMergedToolsForProject = getMergedToolsForProject;
  engineDeps.compilePlanningDocument = compilePlanningDocument;
  engineDeps.delayMs = isTest ? 0 : 2500;
  engineDeps.heartbeatIntervalMs = SESSION_HEARTBEAT_MS;
}

// In-memory registry to prevent duplicate concurrent orchestration loops.
const activeLoops = new Map<string, string | null>();

export function isSessionActive(sessionId: string): boolean {
  return activeLoops.has(sessionId);
}

/**
 * Initializes and starts a new orchestrated discussion session.
 */
export async function startSession(sessionId: string): Promise<void> {
  const session = await engineDeps.prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      template: {
        include: {
          templateRoles: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  });

  if (!session) {
    throw new OrchestrationCommandError(
      'SESSION_NOT_FOUND',
      'Session not found.'
    );
  }

  if (session.status === 'RUNNING' || session.status === 'COMPILING') {
    throw new OrchestrationCommandError(
      'SESSION_ALREADY_ACTIVE',
      'This session already has an active orchestration command.'
    );
  }
  if (session.status === 'COMPLETED') {
    throw new OrchestrationCommandError(
      'INVALID_SESSION_STATE',
      'Cannot restart a completed session. Create a new discussion session instead.'
    );
  }

  const defaultFlow = JSON.parse(session.template.defaultFlow) as string[];
  if (defaultFlow.length === 0) {
    throw new OrchestrationCommandError(
      'INVALID_SESSION_STATE',
      'Discussion template has no configured roles.'
    );
  }

  const leaseStore = engineDeps.prisma as unknown as Parameters<
    typeof acquireSessionLease
  >[0];
  const runToken = await acquireSessionLease(leaseStore, sessionId);
  if (!runToken) {
    throw new OrchestrationCommandError(
      'SESSION_ALREADY_ACTIVE',
      'This session is already running in another process.'
    );
  }

  try {
    await engineDeps.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'RUNNING',
        currentRoleSlug: defaultFlow[0],
        currentRound: 1,
      },
    });
  } catch (error: unknown) {
    await releaseSessionLease(leaseStore, sessionId, runToken);
    throw error;
  }

  runOrchestrationLoop(sessionId, runToken).catch((err) => {
    console.error(`Orchestration loop error for session ${sessionId}:`, err);
  });
}

/**
 * Main supervisor autopilot loop. Processes turns sequentially.
 */
export async function runOrchestrationLoop(
  sessionId: string,
  acquiredRunToken?: string
): Promise<void> {
  // Keep the local registry as a fast-path optimization. The database lease is
  // the authoritative guard across processes and restarts.
  if (activeLoops.has(sessionId) && !acquiredRunToken) {
    console.warn(`[Orchestration] Duplicate loop for session ${sessionId} blocked.`);
    return;
  }
  if (activeLoops.has(sessionId) && acquiredRunToken) {
    console.warn(
      `[Orchestration] Database lease takeover superseded the local loop for session ${sessionId}.`
    );
  }
  activeLoops.set(sessionId, acquiredRunToken ?? null);

  let loopSafetyCount = 0;
  const maxSafetyTurns = 50;
  let runToken: string | null = acquiredRunToken ?? null;
  let leaseIsValid = true;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatInFlight = false;

  try {
    const leaseStore = engineDeps.prisma as unknown as Parameters<
      typeof acquireSessionLease
    >[0];
    if (!runToken) {
      runToken = await acquireSessionLease(leaseStore, sessionId);
      if (!runToken) {
        console.warn(
          `[Orchestration] Persistent lease for session ${sessionId} is already owned.`
        );
        return;
      }
      activeLoops.set(sessionId, runToken);
    }

    heartbeatTimer = setInterval(() => {
      if (heartbeatInFlight || !leaseIsValid || !runToken) return;
      heartbeatInFlight = true;
      void heartbeatSessionLease(leaseStore, sessionId, runToken)
        .then((renewed) => {
          if (!renewed) {
            leaseIsValid = false;
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }
        })
        .catch((error: unknown) => {
          leaseIsValid = false;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          console.error(
            `[Orchestration] Failed to renew lease for session ${sessionId}:`,
            error
          );
        })
        .finally(() => {
          heartbeatInFlight = false;
        });
    }, engineDeps.heartbeatIntervalMs);

    while (loopSafetyCount < maxSafetyTurns) {
      if (!leaseIsValid) {
        console.warn(
          `[Orchestration] Lease for session ${sessionId} was lost. Stopping loop.`
        );
        break;
      }

      // 1. Fetch current session state
      const session = await engineDeps.prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          project: true,
          template: {
            include: {
              templateRoles: {
                include: {
                  role: {
                    include: {
                      skills: {
                        include: {
                          skill: true,
                        },
                      },
                    },
                  },
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
        console.warn(`Orchestration loop: session ${sessionId} not found. Exiting.`);
        break;
      }

      // Stop if user paused, stopped, or session completed/errored
      if (session.status !== 'RUNNING') {
        console.log(`Orchestration loop: session ${sessionId} status is "${session.status}". Pausing loop.`);
        break;
      }

      // Safety checks
      if (session.messages.length >= maxSafetyTurns) {
        console.warn(`Orchestration loop: safety limit of ${maxSafetyTurns} messages reached. Stopping.`);
        await engineDeps.prisma.session.update({
          where: { id: sessionId },
          data: { status: 'PAUSED' },
        });
        notifyListener(sessionId, { type: 'status', status: 'PAUSED', reason: 'Safety limit reached' });
        break;
      }

      const defaultFlow = JSON.parse(session.template.defaultFlow) as string[];
      const registeredSlugs = session.template.templateRoles.map((tr) => tr.role.slug);
      const currentSlug = session.currentRoleSlug || defaultFlow[0];

      // Find current active role details
      const activeTemplateRole = session.template.templateRoles.find(
        (tr) => tr.role.slug === currentSlug
      );

      if (!activeTemplateRole) {
        console.error(`Current role "${currentSlug}" is not part of this template lineup.`);
        await engineDeps.prisma.session.update({
          where: { id: sessionId },
          data: { status: 'ERROR' },
        });
        break;
      }

      const { role } = activeTemplateRole;

      // Fetch the provider for the role
      const provider = role.providerId
        ? await engineDeps.prisma.provider.findUnique({ where: { id: role.providerId } })
        : await engineDeps.prisma.provider.findFirst();

      if (!provider) {
        const errMsg = `AI Provider is not configured for role "${role.name}" (@${role.slug}). Please assign a provider to this role in settings.`;
        await engineDeps.prisma.message.create({
          data: {
            sessionId,
            sender: 'SYSTEM',
            content: `⚠️ Error: ${errMsg}`,
          },
        });
        await engineDeps.prisma.session.update({
          where: { id: sessionId },
          data: { status: 'ERROR' },
        });
        notifyListener(sessionId, { type: 'error', error: errMsg });
        break;
      }

      // 2. Fetch project tools (workspace + custom MCP tools)
      const tools = await engineDeps.getMergedToolsForProject(session.projectId);

      // 3. Summarize history and compile context
      const skills = role.skills.map((rs) => rs.skill);
      
      try {
        const summaryResult = await summarizeHistoryIfNeeded({
          messages: session.messages.map(m => ({ sender: m.sender, content: m.content })),
          currentSummary: session.contextSummary,
          summarizedMessageCount: session.summarizedMessageCount,
          registeredSlugs
        }, async (text: string) => {
           const summarizerAgent = engineDeps.createAgentFromRole({
             role,
             provider,
             skills: [],
             tools: {},
           });
           const stream = await summarizerAgent.stream(text);
           let result = '';
           for await (const chunk of stream.textStream) {
             result += chunk;
           }
           return result;
        });

        if (summaryResult) {
          await engineDeps.prisma.session.update({
            where: { id: sessionId },
            data: {
              contextSummary: summaryResult.newSummary,
              summarizedMessageCount: summaryResult.newSummarizedCount
            }
          });
          session.contextSummary = summaryResult.newSummary;
          session.summarizedMessageCount = summaryResult.newSummarizedCount;
        }
      } catch (sumErr) {
        console.warn(`[Orchestration] Non-fatal summarization error:`, sumErr);
      }

      const context = await buildContext({
        session,
        role,
        messages: session.messages,
        registeredSlugs,
      });

      notifyListener(sessionId, { type: 'turn-start', roleSlug: role.slug, roleName: role.name });

      // 4. Create and trigger agent
      let contentResult = '';
      let toolCallsJson: string | null = null;
      
      try {
        const agent = engineDeps.createAgentFromRole({
          role,
          provider,
          skills,
          tools,
        });

        // Combine compiled system context instructions and formatted history
        const promptInput = `System guidelines have been established. Proceed with your turn to discuss. Here is the summary of omitted history if any: ${context.summaryText}`;
        
        // Construct standard AI message history mapping for Mastra
        const mastraMessages = context.messages.map((m) => ({
          role: m.sender === 'USER' ? 'user' as const : m.sender === 'SYSTEM' ? 'system' as const : 'assistant' as const,
          content: m.content,
        }));

        let stream;
        try {
          // In Mastra V1, agent.stream accepts prompt + optional options containing context messages
          stream = await agent.stream(promptInput, {
            context: mastraMessages as any,
            system: context.systemContext, // Override instructions with compiled context
            maxSteps: 5,
          });
        } catch (err: any) {
          const errMsg = err.message || String(err);
          if (
            errMsg.toLowerCase().includes('system') &&
            (errMsg.toLowerCase().includes('unsupported') ||
              errMsg.toLowerCase().includes('parameter') ||
              errMsg.toLowerCase().includes('bad request') ||
              errMsg.toLowerCase().includes('invalid'))
          ) {
            console.warn(`[Orchestration Engine] System parameter unsupported by provider. Retrying with prepended system context...`);
            const fallbackPrompt = `[System Instructions]\n${context.systemContext}\n\n[User Prompt]\n${promptInput}`;
            // Convert system messages in history to user messages to avoid system role validation errors
            const fallbackMessages = mastraMessages.map((m) => {
              if (m.role === 'system') {
                return { role: 'user' as const, content: `[System Info]: ${m.content}` };
              }
              return m;
            });
            stream = await agent.stream(fallbackPrompt, {
              context: fallbackMessages as any,
              maxSteps: 5,
            });
          } else {
            throw err;
          }
        }

        // Stream text to listener/SSE
        for await (const chunk of stream.textStream) {
          if (!leaseIsValid) break;
          contentResult += chunk;
          notifyListener(sessionId, { type: 'text-chunk', chunk, roleSlug: role.slug });
        }

        // Wait for any running tool executions to finish
        await stream.text;

        if (!leaseIsValid) {
          console.warn(
            `[Orchestration] Lease for session ${sessionId} was lost during generation.`
          );
          break;
        }
        
        // Capture tool calls
        const toolCalls = await stream.toolCalls;
        if (toolCalls && toolCalls.length > 0) {
          toolCallsJson = JSON.stringify(toolCalls);
        }
      } catch (e: any) {
        console.error(`Error generating response from @${role.slug}:`, e);
        // Save error message and pause session
        await engineDeps.prisma.message.create({
          data: {
            sessionId,
            sender: 'SYSTEM',
            content: `⚠️ Error in @${role.slug} generation: ${e.message || e}`,
          },
        });
        await engineDeps.prisma.session.update({
          where: { id: sessionId },
          data: { status: 'ERROR' },
        });
        notifyListener(sessionId, { type: 'error', error: e.message || 'Generation error' });
        break;
      }

      // M2.4: Re-check session status before persisting the generated turn.
      // If the user paused or stopped while the agent was streaming, skip persistence.
      const freshStatus = await engineDeps.prisma.session.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      if (!freshStatus || freshStatus.status !== 'RUNNING') {
        console.log(
          `[Orchestration] Session ${sessionId} is "${
            freshStatus?.status ?? 'gone'
          }" after generation — skipping turn persistence.`
        );
        break;
      }

      // 5. Parse response signals
      const parsed = parseResponse(contentResult, registeredSlugs);

      // Save turn output as Message in DB
      const newMessage = await engineDeps.prisma.message.create({
        data: {
          sessionId,
          roleId: role.id,
          sender: role.name,
          content: contentResult,
          delegateTo: parsed.delegateTo || null,
          toolCalls: toolCallsJson,
        },
      });

      notifyListener(sessionId, { type: 'turn-end', message: newMessage });

      // 6. Transition State Machine
      const roleIdentities = session.template.templateRoles.map((tr) => ({
        name: tr.role.name,
        slug: tr.role.slug,
      }));
      const closedRoles = getClosedRoles([...session.messages, newMessage], roleIdentities);
      const transition = getNextRoleAndRound({
        defaultFlow,
        currentRoleSlug: role.slug,
        currentRound: session.currentRound,
        maxRounds: session.template.maxRounds,
        closedRoles,
        delegateToSlug: parsed.delegateTo,
        needsMoreRound: parsed.isNeedsMoreRound,
      });

      if (transition.shouldCompile) {
        // Transition to compilation phase
        await engineDeps.prisma.session.update({
          where: { id: sessionId },
          data: {
            status: 'COMPILING',
            currentRoleSlug: null,
          },
        });
        notifyListener(sessionId, { type: 'status', status: 'COMPILING', currentRoleSlug: null });

        try {
          const doc = await engineDeps.compilePlanningDocument(sessionId);
          notifyListener(sessionId, { type: 'status', status: 'COMPLETED', document: doc });
        } catch (err: any) {
          console.error('Compilation failed:', err);
          await engineDeps.prisma.session.update({
            where: { id: sessionId },
            data: { status: 'ERROR' },
          });
          notifyListener(sessionId, { type: 'error', error: `Compilation error: ${err.message}` });
        }
        break;
      } else {
        // Move to the next role
        await engineDeps.prisma.session.update({
          where: { id: sessionId },
          data: {
            currentRoleSlug: transition.nextRoleSlug,
            currentRound: transition.nextRound,
          },
        });
        notifyListener(sessionId, {
          type: 'transition',
          currentRoleSlug: transition.nextRoleSlug,
          currentRound: transition.nextRound,
        });

        // Artificially delay before starting next agent's turn to make it feel natural
        if (engineDeps.delayMs > 0) {
          await sleep(engineDeps.delayMs);
        }
      }

      loopSafetyCount++;
    }
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (runToken) {
      const leaseStore = engineDeps.prisma as unknown as Parameters<
        typeof releaseSessionLease
      >[0];
      try {
        await releaseSessionLease(leaseStore, sessionId, runToken);
      } catch (error: unknown) {
        console.error(
          `[Orchestration] Failed to release lease for session ${sessionId}:`,
          error
        );
      }
    }
    if (activeLoops.get(sessionId) === runToken) {
      activeLoops.delete(sessionId);
    }
  }
}

/**
 * Pauses an active session.
 */
export async function pauseSession(sessionId: string): Promise<void> {
  const result = await engineDeps.prisma.session.updateMany({
    where: {
      id: sessionId,
      status: 'RUNNING',
    },
    data: { status: 'PAUSED' },
  });
  if (result.count === 0) {
    const session = await engineDeps.prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    if (!session) {
      throw new OrchestrationCommandError(
        'SESSION_NOT_FOUND',
        'Session not found.'
      );
    }
    throw new OrchestrationCommandError(
      session.status === 'COMPILING'
        ? 'SESSION_ALREADY_ACTIVE'
        : 'INVALID_SESSION_STATE',
      `Cannot pause a session while it is ${session.status}.`
    );
  }
  notifyListener(sessionId, { type: 'status', status: 'PAUSED' });
}

/**
 * Resumes a paused session.
 */
export async function resumeSession(sessionId: string): Promise<void> {
  // M4.2: Only resume if session is PAUSED.
  const session = await engineDeps.prisma.session.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session) {
    throw new OrchestrationCommandError(
      'SESSION_NOT_FOUND',
      'Session not found.'
    );
  }
  if (session.status !== 'PAUSED') {
    throw new OrchestrationCommandError(
      session.status === 'RUNNING' || session.status === 'COMPILING'
        ? 'SESSION_ALREADY_ACTIVE'
        : 'INVALID_SESSION_STATE',
      `Cannot resume a session while it is ${session.status}.`
    );
  }

  const leaseStore = engineDeps.prisma as unknown as Parameters<
    typeof acquireSessionLease
  >[0];
  const runToken = await acquireSessionLease(leaseStore, sessionId);
  if (!runToken) {
    throw new OrchestrationCommandError(
      'SESSION_ALREADY_ACTIVE',
      'This session is already running in another process.'
    );
  }

  try {
    await engineDeps.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'RUNNING' },
    });
  } catch (error: unknown) {
    await releaseSessionLease(leaseStore, sessionId, runToken);
    throw error;
  }
  notifyListener(sessionId, { type: 'status', status: 'RUNNING' });
  
  runOrchestrationLoop(sessionId, runToken).catch((err) => {
    console.error(`Orchestration loop resume error for session ${sessionId}:`, err);
  });
}

/**
 * Force-stops a session and triggers immediate compilation of whatever was completed so far.
 */
export async function stopSession(sessionId: string): Promise<void> {
  // M4.3: Guard against recompiling already-done or compiling sessions.
  const session = await engineDeps.prisma.session.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session) {
    throw new OrchestrationCommandError(
      'SESSION_NOT_FOUND',
      'Session not found.'
    );
  }
  if (session.status === 'COMPILING') {
    throw new OrchestrationCommandError(
      'SESSION_ALREADY_ACTIVE',
      'This session is already compiling.'
    );
  }
  if (session.status !== 'RUNNING' && session.status !== 'PAUSED') {
    throw new OrchestrationCommandError(
      'INVALID_SESSION_STATE',
      `Cannot compile a session while it is ${session.status}.`
    );
  }

  const transition = await engineDeps.prisma.session.updateMany({
    where: {
      id: sessionId,
      status: session.status,
    },
    data: { status: 'COMPILING' },
  });
  if (transition.count === 0) {
    throw new OrchestrationCommandError(
      'SESSION_ALREADY_ACTIVE',
      'The session state changed before compilation could start.'
    );
  }
  notifyListener(sessionId, { type: 'status', status: 'COMPILING', currentRoleSlug: null, reason: 'Forced stop' });

  try {
    const doc = await engineDeps.compilePlanningDocument(sessionId);
    notifyListener(sessionId, { type: 'status', status: 'COMPLETED', document: doc });
  } catch (err: any) {
    console.error('Forced stop compilation failed:', err);
    await engineDeps.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'ERROR' },
    });
    notifyListener(sessionId, {
      type: 'error',
      error: `Forced stop compilation error: ${err.message}`,
    });
    throw new OrchestrationCommandError(
      'COMPILATION_FAILED',
      `Compilation failed: ${err.message || err}`,
      { cause: err }
    );
  }
}

/**
 * Retries compiling the planning document for an ERROR session.
 */
export async function retryCompileSession(sessionId: string): Promise<void> {
  const session = await engineDeps.prisma.session.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session) {
    throw new OrchestrationCommandError(
      'SESSION_NOT_FOUND',
      'Session not found.'
    );
  }
  if (session.status !== 'ERROR') {
    throw new OrchestrationCommandError(
      session.status === 'COMPILING'
        ? 'SESSION_ALREADY_ACTIVE'
        : 'INVALID_SESSION_STATE',
      `Cannot retry compilation while the session is ${session.status}.`
    );
  }

  const transition = await engineDeps.prisma.session.updateMany({
    where: {
      id: sessionId,
      status: 'ERROR',
    },
    data: { status: 'COMPILING' },
  });
  if (transition.count === 0) {
    throw new OrchestrationCommandError(
      'SESSION_ALREADY_ACTIVE',
      'The session state changed before compilation could be retried.'
    );
  }
  notifyListener(sessionId, { type: 'status', status: 'COMPILING', currentRoleSlug: null });

  try {
    const doc = await engineDeps.compilePlanningDocument(sessionId);
    notifyListener(sessionId, { type: 'status', status: 'COMPLETED', document: doc });
  } catch (err: any) {
    console.error('Manual retry compilation failed:', err);
    await engineDeps.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'ERROR' },
    });
    notifyListener(sessionId, {
      type: 'error',
      error: `Manual retry compilation error: ${err.message || err}`,
    });
    throw new OrchestrationCommandError(
      'COMPILATION_FAILED',
      `Compilation failed: ${err.message || err}`,
      { cause: err }
    );
  }
}
