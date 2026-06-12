import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAnthropicTestBody,
  buildGoogleTestBody,
  buildOllamaTestBody,
  buildOpenAIChatTestBody,
  buildOpenAICompletionTestBody,
  buildOpenAIResponsesTestBody,
} from './provider-test-request';
import { PROVIDER_TEST_MAX_OUTPUT_TOKENS } from './provider-test-policy';

const modelId = 'test-model';
const prompt = 'Ping. Reply with "pong" only.';

test('limits OpenAI Responses output', () => {
  assert.deepEqual(buildOpenAIResponsesTestBody(modelId, prompt), {
    model: modelId,
    input: prompt,
    temperature: 0.7,
    max_output_tokens: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
  });
});

test('limits OpenAI Chat output', () => {
  assert.deepEqual(buildOpenAIChatTestBody(modelId, prompt), {
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
  });
});

test('limits OpenAI completion output', () => {
  assert.deepEqual(buildOpenAICompletionTestBody(modelId, prompt), {
    model: modelId,
    prompt,
    max_tokens: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
    temperature: 0.7,
  });
});

test('limits Anthropic output', () => {
  assert.deepEqual(buildAnthropicTestBody(modelId, prompt), {
    model: modelId,
    max_tokens: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });
});

test('limits Google output', () => {
  assert.deepEqual(buildGoogleTestBody(prompt), {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
      temperature: 0.7,
    },
  });
});

test('limits Ollama output', () => {
  assert.deepEqual(buildOllamaTestBody(modelId, prompt), {
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: {
      num_predict: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
    },
  });
});
