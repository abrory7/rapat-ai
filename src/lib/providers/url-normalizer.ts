export function normalizeBaseUrl(url: string | null | undefined, providerType: string): string | undefined {
  if (!url) return undefined;
  let cleaned = url.trim();

  // Strip trailing slashes
  while (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }

  // Strip trailing '/chat/completions' or '/messages' if user mistakenly added it
  if (cleaned.endsWith('/chat/completions')) {
    cleaned = cleaned.replace(/\/chat\/completions$/, '');
  }
  if (cleaned.endsWith('/messages')) {
    cleaned = cleaned.replace(/\/messages$/, '');
  }

  // Standardize openai/anthropic compatible endpoints
  if (providerType === 'openai-compatible' || providerType === 'openai' || providerType === 'anthropic-compatible') {
    const lower = cleaned.toLowerCase();

    // Some OpenAI-compatible providers expose chat endpoints at the root
    // rather than under /v1. DeepSeek is one of them.
    if (lower.includes('api.deepseek.com') || lower.includes('deepseek.com')) {
      return cleaned;
    }
    
    // Check if it is missing version suffix
    const hasVersion = /\/v\d+(\.\d+)?(beta)?$/i.test(cleaned) || lower.endsWith('/api') || lower.endsWith('/api/v1');
    if (!hasVersion) {
      if (lower.includes('openrouter.ai') || lower.includes('openagentic.id')) {
        cleaned = `${cleaned}/api/v1`;
      } else {
        cleaned = `${cleaned}/v1`;
      }
    }
  }

  return cleaned;
}

export function diagnoseError(err: Error): string {
  return err.message || '';
}
