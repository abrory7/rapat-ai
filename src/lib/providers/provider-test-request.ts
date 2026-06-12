import { PROVIDER_TEST_MAX_OUTPUT_TOKENS } from './provider-test-policy';

export function buildOpenAIResponsesTestBody(modelId: string, prompt: string) {
  return {
    model: modelId,
    input: prompt,
    temperature: 0.7,
    max_output_tokens: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
  };
}

export function buildOpenAIChatTestBody(modelId: string, prompt: string) {
  return {
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
  };
}

export function buildOpenAICompletionTestBody(modelId: string, prompt: string) {
  return {
    model: modelId,
    prompt,
    max_tokens: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
    temperature: 0.7,
  };
}

export function buildAnthropicTestBody(modelId: string, prompt: string) {
  return {
    model: modelId,
    max_tokens: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  };
}

export function buildGoogleTestBody(prompt: string) {
  return {
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
  };
}

export function buildOllamaTestBody(modelId: string, prompt: string) {
  return {
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: {
      num_predict: PROVIDER_TEST_MAX_OUTPUT_TOKENS,
    },
  };
}
