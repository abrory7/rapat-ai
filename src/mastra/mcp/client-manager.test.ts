import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetMcpClientCacheForTest,
  BUILT_IN_TOOL_NAMES,
  getOrCreateProjectMcpClient,
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

test('a client loaded before invalidation cannot enter the cache afterward', async () => {
  __resetMcpClientCacheForTest();

  let releaseStaleLoad: (() => void) | undefined;
  const staleLoadBlocked = new Promise<void>((resolve) => {
    releaseStaleLoad = resolve;
  });
  let loadCount = 0;
  const disconnectedClients: string[] = [];

  const loadConfigs = async () => {
    loadCount += 1;
    if (loadCount === 1) {
      await staleLoadBlocked;
      return [{ version: 'stale' }];
    }
    return [{ version: 'fresh' }];
  };
  const createClient = (configs: Array<{ version: string }>) => ({
    version: configs[0].version,
    disconnect: async () => {
      disconnectedClients.push(configs[0].version);
    },
  });

  const loadingClient = getOrCreateProjectMcpClient(
    'project-race',
    loadConfigs,
    createClient
  );
  await Promise.resolve();

  await invalidateProjectMcpAfter('project-race', async () => ({ success: true }));
  releaseStaleLoad?.();

  const client = await loadingClient;
  const cachedClient = await getOrCreateProjectMcpClient(
    'project-race',
    loadConfigs,
    createClient
  );

  assert.equal(client?.version, 'fresh');
  assert.equal(cachedClient, client);
  assert.equal(loadCount, 2);
  assert.deepEqual(disconnectedClients, []);
});

test('concurrent cache misses share one newly created client', async () => {
  __resetMcpClientCacheForTest();

  let releaseLoads: (() => void) | undefined;
  const loadsBlocked = new Promise<void>((resolve) => {
    releaseLoads = resolve;
  });
  let createCount = 0;
  const loadConfigs = async () => {
    await loadsBlocked;
    return [{ version: 'fresh' }];
  };
  const createClient = () => {
    createCount += 1;
    return {
      version: 'fresh',
      disconnect: async () => {},
    };
  };

  const firstClient = getOrCreateProjectMcpClient(
    'project-concurrent',
    loadConfigs,
    createClient
  );
  const secondClient = getOrCreateProjectMcpClient(
    'project-concurrent',
    loadConfigs,
    createClient
  );
  releaseLoads?.();

  const [first, second] = await Promise.all([firstClient, secondClient]);

  assert.equal(first, second);
  assert.equal(createCount, 1);
});
