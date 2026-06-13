import { decrypt, encrypt } from '@/lib/crypto/encryption';

export type EnvironmentMap = Record<string, string>;

function isEnvironmentMap(value: unknown): value is EnvironmentMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

export function encodeEnvironment(environment: EnvironmentMap): string {
  return encrypt(JSON.stringify(environment));
}

export function decodeEnvironment(stored: string | null | undefined): EnvironmentMap {
  if (!stored) return {};

  const looksEncrypted = stored.startsWith('v1:') || stored.split(':').length === 3;
  const plaintext = looksEncrypted ? decrypt(stored) : stored;

  try {
    const parsed: unknown = JSON.parse(plaintext);
    return isEnvironmentMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function mergeEnvironmentUpdate(
  existing: EnvironmentMap,
  submitted: EnvironmentMap = {},
  removedKeys: string[] = []
): EnvironmentMap {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(submitted)) {
    if (value) merged[key] = value;
  }
  for (const key of removedKeys) delete merged[key];
  return merged;
}

export function encodeEnvironmentUpdate(
  connectionType: string,
  existingStoredEnvironment: string | null,
  nextEnvironment: EnvironmentMap | null
): string | null {
  if (connectionType === 'sse') return null;
  if (nextEnvironment === null) return existingStoredEnvironment;
  return Object.keys(nextEnvironment).length > 0
    ? encodeEnvironment(nextEnvironment)
    : null;
}

export function toEnvironmentMetadata(environment: EnvironmentMap) {
  return Object.fromEntries(
    Object.entries(environment).map(([key, value]) => [
      key,
      { hasValue: value.length > 0 },
    ])
  );
}

type McpServerRecord = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  command: string | null;
  url: string | null;
  args: string | null;
  env: string | null;
  enabled: boolean;
};

export function toMcpServerDto(server: McpServerRecord) {
  let args: string[] = [];
  try {
    const parsed: unknown = server.args ? JSON.parse(server.args) : [];
    if (Array.isArray(parsed)) {
      args = parsed.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    args = [];
  }

  return {
    id: server.id,
    name: server.name,
    type: server.type,
    command: server.command,
    url: server.url,
    args,
    env: toEnvironmentMetadata(decodeEnvironment(server.env)),
    enabled: server.enabled,
  };
}
