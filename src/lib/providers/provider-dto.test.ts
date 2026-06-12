import assert from 'node:assert/strict';
import test from 'node:test';
import { toProviderDto, toProviderSummary } from './provider-dto';

const provider = {
  id: 'provider-1',
  name: 'Example',
  type: 'openai',
  baseUrl: null,
  apiKey: 'v1:ciphertext',
  models: '["model-a"]',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

test('provider DTO never exposes the stored API key', () => {
  const dto = toProviderDto(provider);

  assert.equal(dto.hasApiKey, true);
  assert.deepEqual(dto.models, ['model-a']);
  assert.equal('apiKey' in dto, false);
  assert.doesNotMatch(JSON.stringify(dto), /ciphertext/);
});

test('provider summary exposes only fields needed by role screens', () => {
  assert.deepEqual(toProviderSummary(provider), {
    id: 'provider-1',
    name: 'Example',
    type: 'openai',
    models: ['model-a'],
  });
});

