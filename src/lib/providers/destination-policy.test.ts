import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeProviderUrl, safeProviderFetch } from './destination-policy';

test('allows HTTPS public providers and HTTP loopback providers', async () => {
  await assert.doesNotReject(() =>
    assertSafeProviderUrl('https://api.openai.com/v1/models', async () => ['104.18.7.192'])
  );
  await assert.doesNotReject(() =>
    assertSafeProviderUrl('http://localhost:11434/api/tags', async () => ['127.0.0.1'])
  );
});

test('rejects unsafe provider destinations', async () => {
  const cases = [
    ['http://example.com/v1', ['93.184.216.34']],
    ['https://192.168.1.10/v1', ['192.168.1.10']],
    ['https://169.254.169.254/latest/meta-data', ['169.254.169.254']],
    ['https://user:pass@example.com/v1', ['93.184.216.34']],
    ['file:///tmp/provider', []],
  ] as const;

  for (const [url, addresses] of cases) {
    await assert.rejects(() => assertSafeProviderUrl(url, async () => [...addresses]));
  }
});

test('rejects cross-origin redirects before forwarding credentials', async () => {
  const fetcher = async () =>
    new Response(null, {
      status: 302,
      headers: { location: 'https://attacker.example/collect' },
    });

  await assert.rejects(() =>
    safeProviderFetch(
      'https://api.openai.com/v1/models',
      { headers: { Authorization: 'Bearer secret' } },
      3,
      fetcher
    )
  );
});
