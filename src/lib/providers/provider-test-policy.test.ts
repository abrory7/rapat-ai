import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getProviderTestPrompt,
  PROVIDER_TEST_MAX_OUTPUT_TOKENS,
  PROVIDER_TEST_MAX_RESPONSE_CHARS,
  PROVIDER_TEST_PROMPTS,
  truncateProviderTestResponse,
} from './provider-test-policy';

test('resolves every approved provider test prompt by ID', () => {
  assert.deepEqual(PROVIDER_TEST_PROMPTS, [
    {
      id: 'ping',
      label: 'Ping',
      prompt: 'Ping. Reply with "pong" only.',
    },
    {
      id: 'hello',
      label: 'Hello',
      prompt: 'Hello. Reply with one short greeting.',
    },
    {
      id: 'connection-test',
      label: 'Connection test',
      prompt: 'Confirm the connection works in one short sentence.',
    },
    {
      id: 'model-check',
      label: 'Model check',
      prompt: 'State your model name only. If unavailable, reply "unknown".',
    },
  ]);

  for (const preset of PROVIDER_TEST_PROMPTS) {
    assert.equal(getProviderTestPrompt(preset.id), preset.prompt);
  }
});

test('rejects unknown provider test prompt IDs', () => {
  assert.equal(getProviderTestPrompt('write-an-essay'), undefined);
  assert.equal(getProviderTestPrompt(undefined), undefined);
});

test('uses a small provider test output limit', () => {
  assert.equal(PROVIDER_TEST_MAX_OUTPUT_TOKENS, 128);
});

test('keeps short provider test responses unchanged', () => {
  assert.equal(truncateProviderTestResponse('pong'), 'pong');
});

test('truncates oversized provider test responses', () => {
  const response = 'a'.repeat(PROVIDER_TEST_MAX_RESPONSE_CHARS + 20);
  const truncated = truncateProviderTestResponse(response);

  assert.equal(
    truncated,
    `${'a'.repeat(PROVIDER_TEST_MAX_RESPONSE_CHARS)}\n\n[Response truncated]`
  );
});
