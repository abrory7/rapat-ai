/* eslint-disable @typescript-eslint/no-explicit-any */

import { prisma } from '@/lib/db';
import { createAgentFromRole } from '@/mastra/agents/factory';
import { getMergedToolsForProject } from '@/mastra/mcp/client-manager';
import { buildContext } from './context-builder';
import { parseResponse } from './response-parser';
import { getClosedRoles, getNextRoleAndRound } from './state-machine';
import { compilePlanningDocument } from '@/mastra/workflows/compilation';

// Simple in-memory registry of active stream listeners
const activeListeners = new Map<string, Set<(data: any) => void>>();

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
}

// In-memory registry to prevent duplicate concurrent orchestration loops.
const activeLoops = new Set<string>();

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
    throw new Error('Session not found');
  }

  // M4.1: Guard against restarting already-active or completed sessions.
  if (session.status === 'RUNNING' || session.status === 'COMPILING') {
    return;
  }
  if (session.status === 'COMPLETED') {
    throw new Error(
      'Cannot restart a completed session. Create a new discussion session instead.'
    );
  }

  const defaultFlow = JSON.parse(session.template.defaultFlow) as string[];
  if (defaultFlow.length === 0) {
    throw new Error('Discussion template has no configured roles.');
  }

  // Start with the first role in default flow
  await engineDeps.prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'RUNNING',
      currentRoleSlug: defaultFlow[0],
      currentRound: 1,
    },
  });

  // Start the background loop
  runOrchestrationLoop(sessionId).catch((err) => {
    console.error(`Orchestration loop error for session ${sessionId}:`, err);
  });
}

/**
 * Main supervisor autopilot loop. Processes turns sequentially.
 */
export async function runOrchestrationLoop(sessionId: string): Promise<void> {
  // M2.1-M2.2: Prevent duplicate concurrent loops for the same session.
  if (activeLoops.has(sessionId)) {
    console.warn(`[Orchestration] Duplicate loop for session ${sessionId} blocked.`);
    return;
  }
  activeLoops.add(sessionId);

  let loopSafetyCount = 0;
  const maxSafetyTurns = 50;

  // M2.3: Always clean up activeLoops in finally.
  try {
    while (loopSafetyCount < maxSafetyTurns) {
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

      // 3. Compile prompt and context
      const skills = role.skills.map((rs) => rs.skill);
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
            });
          } else {
            throw err;
          }
        }

        // Stream text to listener/SSE
        for await (const chunk of stream.textStream) {
          contentResult += chunk;
          notifyListener(sessionId, { type: 'text-chunk', chunk, roleSlug: role.slug });
        }

        // Wait for any running tool executions to finish
        await stream.text;
        
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
    // M2.3: Always remove from activeLoops so subsequent starts are allowed.
    activeLoops.delete(sessionId);
  }
}

/**
 * Pauses an active session.
 */
export async function pauseSession(sessionId: string): Promise<void> {
  await engineDeps.prisma.session.update({
    where: { id: sessionId },
    data: { status: 'PAUSED' },
  });
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
    throw new Error('Session not found');
  }
  if (session.status !== 'PAUSED') {
    return;
  }

  await engineDeps.prisma.session.update({
    where: { id: sessionId },
    data: { status: 'RUNNING' },
  });
  notifyListener(sessionId, { type: 'status', status: 'RUNNING' });
  
  // Kick off the loop again
  runOrchestrationLoop(sessionId).catch((err) => {
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
    throw new Error('Session not found');
  }
  if (session.status === 'COMPLETED' || session.status === 'COMPILING') {
    return;
  }

  await engineDeps.prisma.session.update({
    where: { id: sessionId },
    data: { status: 'COMPILING' },
  });
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
    throw new Error('Session not found');
  }

  await engineDeps.prisma.session.update({
    where: { id: sessionId },
    data: { status: 'COMPILING' },
  });
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
    throw err;
  }
}

