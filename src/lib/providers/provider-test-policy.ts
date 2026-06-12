export const PROVIDER_TEST_PROMPTS = [
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
] as const;

export type ProviderTestPromptId = (typeof PROVIDER_TEST_PROMPTS)[number]['id'];

export const PROVIDER_TEST_MAX_OUTPUT_TOKENS = 128;
export const PROVIDER_TEST_MAX_RESPONSE_CHARS = 2_000;

export function getProviderTestPrompt(promptId: unknown): string | undefined {
  return PROVIDER_TEST_PROMPTS.find((preset) => preset.id === promptId)?.prompt;
}

export function truncateProviderTestResponse(response: string): string {
  if (response.length <= PROVIDER_TEST_MAX_RESPONSE_CHARS) return response;

  return `${response.slice(0, PROVIDER_TEST_MAX_RESPONSE_CHARS)}\n\n[Response truncated]`;
}
