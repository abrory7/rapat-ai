export type ProviderRecord = {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  apiKey: string;
  models: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    roles: number;
  };
};

function parseModels(models: string): string[] {
  try {
    const parsed = JSON.parse(models);
    return Array.isArray(parsed)
      ? parsed.filter((model): model is string => typeof model === 'string')
      : [];
  } catch {
    return [];
  }
}

export function toProviderDto(provider: ProviderRecord) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    models: parseModels(provider.models),
    assignedRoleCount: provider._count?.roles ?? 0,
    hasApiKey: provider.apiKey.length > 0,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

export function toProviderSummary(
  provider: Pick<ProviderRecord, 'id' | 'name' | 'type' | 'models'>
) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    models: parseModels(provider.models),
  };
}
