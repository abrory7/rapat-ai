import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMcpServerCreate,
  parseMcpServerUpdate,
} from './config-schema';

test('accepts valid stdio and SSE create payloads', () => {
  assert.deepEqual(
    parseMcpServerCreate({
      name: 'Local tools',
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      env: { API_TOKEN: 'secret' },
      enabled: true,
    }),
    {
      name: 'Local tools',
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      env: { API_TOKEN: 'secret' },
      enabled: true,
    }
  );

  assert.deepEqual(
    parseMcpServerCreate({
      name: 'Remote tools',
      type: 'sse',
      url: 'https://mcp.example.com/events',
    }),
    {
      name: 'Remote tools',
      type: 'sse',
      url: 'https://mcp.example.com/events',
    }
  );
});

test('rejects unsupported types and missing connection fields', () => {
  assert.throws(() =>
    parseMcpServerCreate({
      name: 'Socket tools',
      type: 'websocket',
      url: 'https://example.com',
    })
  );
  assert.throws(() =>
    parseMcpServerCreate({
      name: 'Local tools',
      type: 'stdio',
      command: '   ',
    })
  );
  assert.throws(() =>
    parseMcpServerCreate({
      name: 'Remote tools',
      type: 'sse',
      url: 'ftp://example.com/events',
    })
  );
});

test('rejects mismatched and unknown create fields', () => {
  assert.throws(() =>
    parseMcpServerCreate({
      name: 'Local tools',
      type: 'stdio',
      command: 'node',
      url: 'https://example.com/events',
    })
  );
  assert.throws(() =>
    parseMcpServerCreate({
      name: 'Remote tools',
      type: 'sse',
      url: 'https://example.com/events',
      args: ['not-valid-for-sse'],
    })
  );
  assert.throws(() =>
    parseMcpServerCreate({
      name: 'Remote tools',
      type: 'sse',
      url: 'https://example.com/events',
      env: { TOKEN: 'not-valid-for-sse' },
    })
  );
  assert.throws(() =>
    parseMcpServerCreate({
      name: 'Remote tools',
      type: 'sse',
      url: 'https://example.com/events',
      unexpected: true,
    })
  );
});

test('requires string arrays and valid environment names', () => {
  assert.throws(() =>
    parseMcpServerCreate({
      name: 'Local tools',
      type: 'stdio',
      command: 'node',
      args: ['server.js', 2],
    })
  );
  assert.throws(() =>
    parseMcpServerCreate({
      name: 'Local tools',
      type: 'stdio',
      command: 'node',
      env: { 'INVALID-NAME': 'secret' },
    })
  );
});

test('validates partial updates against the effective connection type', () => {
  const existingStdio = {
    name: 'Local tools',
    type: 'stdio',
    command: 'node',
    url: null,
    args: ['server.js'],
    enabled: true,
  } as const;

  assert.deepEqual(
    parseMcpServerUpdate(
      {
        command: 'bun',
        args: ['run', 'server.ts'],
        env: { NEXT_TOKEN: 'secret' },
        removedEnvKeys: ['OLD_TOKEN'],
      },
      existingStdio
    ),
    {
      command: 'bun',
      args: ['run', 'server.ts'],
      env: { NEXT_TOKEN: 'secret' },
      removedEnvKeys: ['OLD_TOKEN'],
    }
  );

  assert.throws(() =>
    parseMcpServerUpdate(
      { type: 'sse', command: 'node', url: 'https://example.com/events' },
      existingStdio
    )
  );
  assert.throws(() =>
    parseMcpServerUpdate(
      { type: 'sse', url: 'https://example.com/events', env: { TOKEN: 'secret' } },
      existingStdio
    )
  );
  assert.throws(() =>
    parseMcpServerUpdate({ removedEnvKeys: ['VALID', 2] }, existingStdio)
  );
  assert.throws(() =>
    parseMcpServerUpdate({ removedEnvKeys: ['INVALID-NAME'] }, existingStdio)
  );
  assert.throws(() =>
    parseMcpServerUpdate({ unknown: true }, existingStdio)
  );
});
