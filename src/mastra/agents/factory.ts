import { Agent } from '@mastra/core/agent';
import { decrypt } from '@/lib/crypto/encryption';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { normalizeBaseUrl } from '@/lib/providers/url-normalizer';
import { safeProviderFetch } from '@/lib/providers/destination-policy';

interface RoleInput {
  id: string;
  name: string;
  slug: string;
  systemPrompt: string;
  modelId?: string | null;
}

interface ProviderInput {
  type: string;
  apiKey: string;
  baseUrl?: string | null;
}

interface SkillInput {
  name: string;
  content: string;
}

/**
 * Dynamically creates a Mastra Agent from DB role, provider, skills, and tools config.
 */
export function createAgentFromRole({
  role,
  provider,
  skills,
  tools,
}: {
  role: RoleInput;
  provider?: ProviderInput | null;
  skills: SkillInput[];
  tools: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}): Agent {
  if (!provider) {
    throw new Error(
      `AI Provider is not configured for role "${role.name}" (@${role.slug}). Please assign a provider to this role in settings.`
    );
  }

  let decryptedKey = '';
  try {
    decryptedKey = decrypt(provider.apiKey);
  } catch {
    throw new Error(`Failed to decrypt credentials for role "${role.name}".`);
  }

  // Compile prompt instructions with attached skills content
  let instructions = role.systemPrompt;
  if (skills.length > 0) {
    instructions += '\n\n### ADDITIONAL INSTRUCTIONS & GUIDELINES\nYou must strictly follow these instructions in your responses:';
    for (const skill of skills) {
      instructions += `\n\n--- SKILL GUIDELINES: ${skill.name.toUpperCase()} ---\n${skill.content}\n---------------------------------------------`;
    }
  }

  // Resolve model configuration
  const normalizedUrl = normalizeBaseUrl(provider.baseUrl, provider.type);
  let agentModel:
    | ReturnType<ReturnType<typeof createOpenAI>>
    | ReturnType<ReturnType<typeof createAnthropic>>
    | {
        providerId: string;
        modelId: string;
        apiKey?: string;
        url?: string;
      };

  const customFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlString =
      typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    return safeProviderFetch(urlString, init);
  };

  if (provider.type === 'openai-compatible') {
    const customOpenAI = createOpenAI({
      baseURL: normalizedUrl,
      apiKey: decryptedKey,
      fetch: customFetch,
    });
    agentModel = customOpenAI.chat(role.modelId || 'default');
  } else if (provider.type === 'anthropic-compatible') {
    const customAnthropic = createAnthropic({
      baseURL: normalizedUrl,
      apiKey: decryptedKey,
      fetch: customFetch,
    });
    agentModel = customAnthropic(role.modelId || 'default');
  } else {
    // Construct standard Mastra model configuration structure
    agentModel = {
      providerId: provider.type,
      modelId: role.modelId || 'default',
      apiKey: decryptedKey,
      url: normalizedUrl,
    };
  }

  const agentConfig: any = {
    id: role.slug,
    name: role.name,
    model: agentModel,
    tools,
  };

  if (instructions && instructions.trim()) {
    agentConfig.instructions = instructions;
  }

  return new Agent(agentConfig);
}
export default createAgentFromRole;
