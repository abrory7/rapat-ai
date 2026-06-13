export function toMcpMutationPayload<
  T extends {
    id?: string;
    type?: string;
    command?: unknown;
    args?: unknown;
    env?: unknown;
    removedEnvKeys?: string[];
  },
>(input: T, isUpdate: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...input };
  delete payload.id;
  if (!isUpdate) {
    delete payload.removedEnvKeys;
  }
  if (payload.type === 'sse') {
    delete payload.command;
    delete payload.args;
    delete payload.env;
    delete payload.removedEnvKeys;
  }
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) delete payload[key];
  }
  return payload;
}
