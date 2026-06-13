import assert from 'node:assert/strict';
import test from 'node:test';
import { toMcpMutationPayload } from './request-payload';

test('create payloads omit form-only and update-only fields', () => {
  assert.deepEqual(
    toMcpMutationPayload(
      {
        id: undefined,
        name: 'Local tools',
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        removedEnvKeys: [],
        enabled: true,
      },
      false
    ),
    {
      name: 'Local tools',
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      enabled: true,
    }
  );
});

test('update payloads preserve explicit environment removals but omit the id', () => {
  assert.deepEqual(
    toMcpMutationPayload(
      {
        id: 'server-1',
        name: 'Local tools',
        type: 'stdio',
        command: 'node',
        removedEnvKeys: ['OLD_TOKEN'],
        enabled: false,
      },
      true
    ),
    {
      name: 'Local tools',
      type: 'stdio',
      command: 'node',
      removedEnvKeys: ['OLD_TOKEN'],
      enabled: false,
    }
  );
});

test('SSE update payloads omit all stdio-only fields', () => {
  assert.deepEqual(
    toMcpMutationPayload(
      {
        id: 'server-1',
        name: 'Remote tools',
        type: 'sse',
        command: undefined,
        url: 'https://example.com/events',
        args: undefined,
        env: undefined,
        removedEnvKeys: ['OLD_TOKEN'],
        enabled: true,
      },
      true
    ),
    {
      name: 'Remote tools',
      type: 'sse',
      url: 'https://example.com/events',
      enabled: true,
    }
  );
});
