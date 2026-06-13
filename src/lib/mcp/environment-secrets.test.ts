import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeEnvironment,
  encodeEnvironmentUpdate,
  mergeEnvironmentUpdate,
  toMcpServerDto,
  toEnvironmentMetadata,
} from './environment-secrets';

test('environment metadata never exposes values', () => {
  assert.deepEqual(toEnvironmentMetadata({ TOKEN: 'secret', DEBUG: '' }), {
    TOKEN: { hasValue: true },
    DEBUG: { hasValue: false },
  });
});

test('environment updates preserve, replace, add, and explicitly remove values', () => {
  assert.deepEqual(
    mergeEnvironmentUpdate(
      { KEEP: 'old', REPLACE: 'old', REMOVE: 'old' },
      { KEEP: '', REPLACE: 'new', ADD: 'value' },
      ['REMOVE']
    ),
    { KEEP: 'old', REPLACE: 'new', ADD: 'value' }
  );
});

test('SSE configurations clear stored stdio environment values', () => {
  assert.equal(
    encodeEnvironmentUpdate(
      'sse',
      '{"TOKEN":"legacy-secret"}',
      null
    ),
    null
  );
});

test('legacy plaintext JSON remains readable', () => {
  assert.deepEqual(decodeEnvironment('{"TOKEN":"legacy"}'), { TOKEN: 'legacy' });
});

test('MCP server DTO omits encrypted environment values', () => {
  const dto = toMcpServerDto({
    id: 'mcp-1',
    projectId: 'project-1',
    name: 'Local MCP',
    type: 'stdio',
    command: 'node',
    url: null,
    args: '["server.js"]',
    env: '{"TOKEN":"secret"}',
    enabled: true,
  });

  assert.deepEqual(dto.env, { TOKEN: { hasValue: true } });
  assert.doesNotMatch(JSON.stringify(dto), /secret/);
  assert.equal('projectId' in dto, false);
});
