import { NextRequest, NextResponse } from 'next/server';
import {
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  registerSessionListener,
  unregisterSessionListener,
  retryCompileSession,
  OrchestrationCommandError,
} from '@/lib/orchestrator/engine';

type OrchestrationEvent = Record<string, unknown>;

interface OrchestrationErrorResponse {
  status: number;
  body: {
    code: string;
    error: string;
  };
}

export function getOrchestrationErrorResponse(
  error: unknown
): OrchestrationErrorResponse {
  if (error instanceof OrchestrationCommandError) {
    const statusByCode = {
      SESSION_NOT_FOUND: 404,
      SESSION_ALREADY_ACTIVE: 409,
      INVALID_SESSION_STATE: 409,
      COMPILATION_FAILED: 422,
    } as const;

    return {
      status: statusByCode[error.code],
      body: {
        code: error.code,
        error: error.message,
      },
    };
  }

  return {
    status: 500,
    body: {
      code: 'INTERNAL_ERROR',
      error: 'Action failed.',
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, command } = await req.json();
    if (!sessionId || !command) {
      return NextResponse.json(
        {
          code: 'INVALID_REQUEST',
          error: 'Missing sessionId or command.',
        },
        { status: 400 }
      );
    }

    if (command === 'start') {
      await startSession(sessionId);
    } else if (command === 'pause') {
      await pauseSession(sessionId);
    } else if (command === 'resume') {
      await resumeSession(sessionId);
    } else if (command === 'stop') {
      await stopSession(sessionId);
    } else if (command === 'retry-compile') {
      await retryCompileSession(sessionId);
    } else {
      return NextResponse.json(
        {
          code: 'INVALID_COMMAND',
          error: 'Invalid command.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Orchestration control command failed:', error);
    const response = getOrchestrationErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('Missing sessionId parameter', { status: 400 });
  }

  let keepAliveInterval: NodeJS.Timeout;
  let listener: ((data: OrchestrationEvent) => void) | null = null;

  const responseStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Listen to events from the orchestration engine loop
      listener = (data: OrchestrationEvent) => {
        try {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (error) {
          console.error('Error writing stream chunk:', error);
        }
      };

      registerSessionListener(sessionId, listener);

      // Heartbeat ping to prevent connection timeouts
      keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 15000);

      // Clean up when client disconnects
      req.signal.addEventListener('abort', () => {
        clearInterval(keepAliveInterval);
        if (listener) {
          unregisterSessionListener(sessionId, listener);
        }
        try {
          controller.close();
        } catch {
          // Stream might be closed already
        }
      });
    },
    cancel() {
      clearInterval(keepAliveInterval);
      if (listener) {
        unregisterSessionListener(sessionId, listener);
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
