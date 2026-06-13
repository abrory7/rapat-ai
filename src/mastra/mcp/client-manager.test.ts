import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILT_IN_TOOL_NAMES,
  invalidateProjectMcpAfter,
  mergeCustomTools,
} from './client-manager';

test('successful configuration changes disconnect the cached project client', async () => {
  const calls: string[] = [];

  const result = await invalidateProjectMcpAfter(
    'project-1',
    async () => {
      calls.push('mutate');
      return { id: 'server-1' };
    },
    async (projectId) => {
      calls.push(`disconnect:${projectId}`);
    }
  );

  assert.deepEqual(result, { id: 'server-1' });
  assert.deepEqual(calls, ['mutate', 'disconnect:project-1']);
});

test('failed configuration changes leave the cached project client connected', async () => {
  let disconnected = false;

  await assert.rejects(() =>
    invalidateProjectMcpAfter(
      'project-1',
      async () => {
        throw new Error('mutation failed');
      },
      async () => {
        disconnected = true;
      }
    )
  );

  assert.equal(disconnected, false);
});

test('custom MCP tools cannot replace built-in workspace tools', () => {
  const builtInTool = { id: 'built-in' };
  const customTool = { id: 'custom' };
  const logs: string[] = [];
  const builtInTools = {
    listFilesTool: builtInTool,
  };

  const merged = mergeCustomTools(
    builtInTools,
    {
      listFilesTool: customTool,
      remote_search: customTool,
    },
    (message) => logs.push(message)
  );

  assert.equal(merged.listFilesTool, builtInTool);
  assert.equal(merged.remote_search, customTool);
  assert.deepEqual(logs, [
    'Skipped custom MCP tool "listFilesTool" because it collides with a built-in tool.',
  ]);
  assert.equal(BUILT_IN_TOOL_NAMES.has('listFilesTool'), true);
});

