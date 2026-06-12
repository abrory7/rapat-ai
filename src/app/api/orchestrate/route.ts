import { NextRequest, NextResponse } from 'next/server';
import {
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  registerSessionListener,
  unregisterSessionListener,
  retryCompileSession,
} from '@/lib/orchestrator/engine';

type OrchestrationEvent = Record<string, unknown>;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Action failed';
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, command } = await req.json();
    if (!sessionId || !command) {
      return NextResponse.json({ error: 'Missing sessionId or command' }, { status: 400 });
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
      return NextResponse.json({ error: 'Invalid command' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Orchestration control command failed:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
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
