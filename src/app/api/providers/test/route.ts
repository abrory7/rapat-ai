import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto/encryption';
import { diagnoseError, normalizeBaseUrl } from '@/lib/providers/url-normalizer';
import { safeProviderFetch } from '@/lib/providers/destination-policy';

type ProviderRecord = {
  type: string;
  apiKey: string;
  baseUrl?: string | null;
};

type TestPayload = {
  providerId?: string;
  modelId?: string;
  prompt?: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function extractJsonErrorMessage(data: unknown, fallbackStatus: number): string {
  if (isRecord(data)) {
    if (typeof data.error === 'string') return data.error;

    if (isRecord(data.error) && typeof data.error.message === 'string') {
      return data.error.message;
    }
  }

  return `API responded with status ${fallbackStatus}`;
}

function extractOpenAIText(data: unknown): string {
  if (!isRecord(data)) return '';

  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';

  const firstChoice = choices[0];
  if (!isRecord(firstChoice)) return '';

  const message = firstChoice.message;
  if (isRecord(message)) {
    const content = message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part: unknown) => {
          if (isRecord(part) && typeof part.text === 'string') return part.text;
          return '';
        })
        .filter(Boolean)
        .join('');
    }

    if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
      return message.reasoning_content;
    }

    if (typeof message.reasoning === 'string' && message.reasoning.trim()) {
      return message.reasoning;
    }
  }

  if (typeof firstChoice.text === 'string') return firstChoice.text;
  return '';
}

function extractAnthropicText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.content)) return '';
  return data.content
    .map((part: unknown) => {
      if (isRecord(part) && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean)
    .join('');
}

function extractGoogleText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.candidates) || data.candidates.length === 0) return '';

  const firstCandidate = data.candidates[0];
  if (!isRecord(firstCandidate)) return '';

  const content = firstCandidate.content;
  if (!isRecord(content) || !Array.isArray(content.parts)) return '';

  return content.parts
    .map((part: unknown) => {
      if (isRecord(part) && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean)
    .join('');
}

function extractOllamaText(data: unknown): string {
  if (!isRecord(data)) return '';

  if (isRecord(data.message) && typeof data.message.content === 'string') return data.message.content;
  if (typeof data.response === 'string') return data.response;
  return '';
}

function isDeepSeekModel(modelId: string, baseUrl?: string | null): boolean {
  const lowerModel = modelId.toLowerCase();
  const lowerBaseUrl = (baseUrl || '').toLowerCase();
  return lowerModel.startsWith('deepseek-') || lowerBaseUrl.includes('api.deepseek.com') || lowerBaseUrl.includes('deepseek.com');
}

function extractTextFromEventStream(rawText: string): string {
  if (!rawText.includes('data:')) return '';

  const fragments: string[] = [];
  const chunks = rawText.split(/\n\n+/);

  for (const chunk of chunks) {
    const lines = chunk.split(/\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let event: unknown;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      if (!isRecord(event)) continue;

      if (typeof event.type === 'string') {
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          fragments.push(event.delta);
          continue;
        }

        if (event.type === 'response.reasoning_summary_text.delta' && typeof event.delta === 'string') {
          fragments.push(event.delta);
          continue;
        }
      }

      const choices = event.choices;
      if (!Array.isArray(choices) || choices.length === 0) continue;

      for (const choice of choices) {
        if (!isRecord(choice)) continue;
        const delta = choice.delta;
        if (!isRecord(delta)) continue;

        if (typeof delta.content === 'string' && delta.content.trim()) {
          fragments.push(delta.content);
        }
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.trim()) {
          fragments.push(delta.reasoning_content);
        }
        if (typeof delta.reasoning === 'string' && delta.reasoning.trim()) {
          fragments.push(delta.reasoning);
        }
      }
    }
  }

  return fragments.join('').trim();
}

function extractOpenAIResponsesText(data: unknown): string {
  if (!isRecord(data)) return '';

  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  const output = data.output;
  if (!Array.isArray(output)) return '';

  const parts: string[] = [];

  for (const item of output) {
    if (!isRecord(item)) continue;

    if (typeof item.output_text === 'string' && item.output_text.trim()) {
      parts.push(item.output_text);
      continue;
    }

    if (typeof item.text === 'string' && item.text.trim()) {
      parts.push(item.text);
      continue;
    }

    if (Array.isArray(item.content)) {
      for (const contentPart of item.content) {
        if (!isRecord(contentPart)) continue;
        if (typeof contentPart.text === 'string' && contentPart.text.trim()) {
          parts.push(contentPart.text);
        }
        if (typeof contentPart.output_text === 'string' && contentPart.output_text.trim()) {
          parts.push(contentPart.output_text);
        }
      }
    }

    if (isRecord(item.response) && typeof item.response.output_text === 'string') {
      parts.push(item.response.output_text);
    }
  }

  return parts.join('').trim();
}

async function readJsonOrTextResponse(res: Response): Promise<{ data: unknown; rawText: string; contentType: string }> {
  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text().catch(() => '');

  if (contentType.includes('application/json')) {
    try {
      return { data: JSON.parse(rawText), rawText, contentType };
    } catch {
      return { data: { rawText }, rawText, contentType };
    }
  }

  return { data: { rawText }, rawText, contentType };
}

async function runOpenAIStyleTest({
  baseUrl,
  apiKey,
  modelId,
  prompt,
}: {
  baseUrl?: string | null;
  apiKey: string;
  modelId: string;
  prompt: string;
}): Promise<string> {
  const endpoint = `${baseUrl || 'https://api.openai.com/v1'}/chat/completions`;
  const response = await safeProviderFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (response.status === 200 || response.status === 201) {
    const { data, rawText, contentType } = await readJsonOrTextResponse(response);
    const text = extractOpenAIText(data);
    if (text) return text;

    if (contentType.includes('text/event-stream')) {
      const streamed = extractTextFromEventStream(rawText);
      if (streamed) return streamed;
    }

    throw new Error('OpenAI-compatible provider returned a response, but no assistant text was found.');
  }

  const { data, rawText } = await readJsonOrTextResponse(response);
  const preview = rawText.slice(0, 300).trim();
  throw new Error(
    `${extractJsonErrorMessage(data, response.status)} (non-success status ${response.status}). Raw response preview: "${preview}"`
  );
}

async function runOpenAIResponsesTest({
  baseUrl,
  apiKey,
  modelId,
  prompt,
}: {
  baseUrl?: string | null;
  apiKey: string;
  modelId: string;
  prompt: string;
}): Promise<string> {
  const endpoint = `${baseUrl || 'https://api.openai.com/v1'}/responses`;
  const response = await safeProviderFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      input: prompt,
      temperature: 0.7,
    }),
  });

  if (response.status === 200 || response.status === 201) {
    const { data, rawText, contentType } = await readJsonOrTextResponse(response);
    const text = extractOpenAIResponsesText(data);
    if (text) return text;

    if (contentType.includes('text/event-stream')) {
      const streamed = extractTextFromEventStream(rawText);
      if (streamed) return streamed;
    }

    throw new Error(
      'OpenAI responses provider returned a response, but no output text was found.',
    );
  }

  const { data, rawText } = await readJsonOrTextResponse(response);
  const preview = rawText.slice(0, 300).trim();
  throw new Error(
    `${extractJsonErrorMessage(data, response.status)} (non-success status ${response.status}). Raw response preview: "${preview}"`
  );
}

async function runOpenAICompletionFallback({
  baseUrl,
  apiKey,
  modelId,
  prompt,
}: {
  baseUrl?: string | null;
  apiKey: string;
  modelId: string;
  prompt: string;
}): Promise<string> {
  const endpoint = `${baseUrl || 'https://api.openai.com/v1'}/completions`;
  const response = await safeProviderFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      prompt,
      max_tokens: 256,
      temperature: 0.7,
    }),
  });

  if (response.status === 200 || response.status === 201) {
    const { data } = await readJsonOrTextResponse(response);
    const text = extractOpenAIText(data);
    if (text) return text;

    throw new Error('Completion-style provider returned a response, but no text was found.');
  }

  const { data, rawText } = await readJsonOrTextResponse(response);
  const preview = rawText.slice(0, 300).trim();
  throw new Error(
    `${extractJsonErrorMessage(data, response.status)} (non-success status ${response.status}). Raw response preview: "${preview}"`
  );
}

async function runAnthropicStyleTest({
  baseUrl,
  apiKey,
  modelId,
  prompt,
}: {
  baseUrl?: string | null;
  apiKey: string;
  modelId: string;
  prompt: string;
}): Promise<string> {
  const endpoint = `${baseUrl || 'https://api.anthropic.com'}/v1/messages`;
  const response = await safeProviderFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (response.status === 200 || response.status === 201) {
    const { data, rawText, contentType } = await readJsonOrTextResponse(response);
    const text = extractAnthropicText(data);
    if (text) return text;

    if (contentType.includes('text/event-stream')) {
      const streamed = extractTextFromEventStream(rawText);
      if (streamed) return streamed;
    }

    throw new Error('Anthropic-compatible provider returned a response, but no assistant text was found.');
  }

  const { data, rawText } = await readJsonOrTextResponse(response);
  const preview = rawText.slice(0, 300).trim();
  throw new Error(
    `${extractJsonErrorMessage(data, response.status)} (non-success status ${response.status}). Raw response preview: "${preview}"`
  );
}

async function runGoogleTest({
  apiKey,
  modelId,
  prompt,
}: {
  apiKey: string;
  modelId: string;
  prompt: string;
}): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await safeProviderFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 256,
        temperature: 0.7,
      },
    }),
  });

  if (response.status === 200 || response.status === 201) {
    const { data, rawText, contentType } = await readJsonOrTextResponse(response);
    const text = extractGoogleText(data);
    if (text) return text;

    if (contentType.includes('text/event-stream')) {
      const streamed = extractTextFromEventStream(rawText);
      if (streamed) return streamed;
    }

    throw new Error('Google provider returned a response, but no assistant text was found.');
  }

  const { data, rawText } = await readJsonOrTextResponse(response);
  const preview = rawText.slice(0, 300).trim();
  throw new Error(
    `${extractJsonErrorMessage(data, response.status)} (non-success status ${response.status}). Raw response preview: "${preview}"`
  );
}

async function runOllamaTest({
  baseUrl,
  modelId,
  prompt,
}: {
  baseUrl?: string | null;
  modelId: string;
  prompt: string;
}): Promise<string> {
  const endpoint = `${baseUrl || 'http://localhost:11434'}/api/chat`;
  const response = await safeProviderFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  });

  if (response.status === 200 || response.status === 201) {
    const { data, rawText, contentType } = await readJsonOrTextResponse(response);
    const text = extractOllamaText(data);
    if (text) return text;

    if (contentType.includes('text/event-stream')) {
      const streamed = extractTextFromEventStream(rawText);
      if (streamed) return streamed;
    }

    throw new Error('Ollama returned a response, but no assistant text was found.');
  }

  const { data, rawText } = await readJsonOrTextResponse(response);
  const preview = rawText.slice(0, 300).trim();
  throw new Error(
    `${extractJsonErrorMessage(data, response.status)} (non-success status ${response.status}). Raw response preview: "${preview}"`
  );
}

export async function POST(req: Request) {
  let requestBody: TestPayload | undefined;

  try {
    requestBody = (await req.json()) as TestPayload;
    const { providerId, modelId, prompt } = requestBody;

    if (!providerId || !modelId || !prompt) {
      return NextResponse.json(
        { error: 'Missing providerId, modelId, or prompt' },
        { status: 400 }
      );
    }

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const decryptedApiKey = decrypt(provider.apiKey);
    const normalizedUrl = normalizeBaseUrl(provider.baseUrl, provider.type);
    const providerRecord: ProviderRecord = {
      type: provider.type,
      apiKey: decryptedApiKey,
      baseUrl: provider.baseUrl,
    };

    let responseText = '';

    if (providerRecord.type === 'openai' || providerRecord.type === 'openai-compatible') {
      const deepSeekLike = isDeepSeekModel(modelId, normalizedUrl);

      if (deepSeekLike) {
        try {
          responseText = await runOpenAIStyleTest({
            baseUrl: normalizedUrl,
            apiKey: providerRecord.apiKey,
            modelId,
            prompt: prompt.trim(),
          });
        } catch (chatErr) {
          const chatMessage = (chatErr as Error).message || '';
          if (
            chatMessage.includes('non-success status 400') ||
            chatMessage.includes('non-success status 404') ||
            chatMessage.includes('non-success status 405') ||
            chatMessage.includes('no assistant text was found')
          ) {
            responseText = await runOpenAICompletionFallback({
              baseUrl: normalizedUrl,
              apiKey: providerRecord.apiKey,
              modelId,
              prompt: prompt.trim(),
            });
          } else {
            throw chatErr;
          }
        }
      } else {
        try {
          responseText = await runOpenAIResponsesTest({
            baseUrl: normalizedUrl,
            apiKey: providerRecord.apiKey,
            modelId,
            prompt: prompt.trim(),
          });
        } catch (err) {
          const message = (err as Error).message || '';
          if (
            message.includes('non-success status 400') ||
            message.includes('non-success status 404') ||
            message.includes('non-success status 405') ||
            message.includes('no output text was found')
          ) {
            try {
              responseText = await runOpenAIStyleTest({
                baseUrl: normalizedUrl,
                apiKey: providerRecord.apiKey,
                modelId,
                prompt: prompt.trim(),
              });
            } catch (chatErr) {
              const chatMessage = (chatErr as Error).message || '';
              if (
                chatMessage.includes('non-success status 400') ||
                chatMessage.includes('non-success status 404') ||
                chatMessage.includes('non-success status 405') ||
                chatMessage.includes('no assistant text was found')
              ) {
                responseText = await runOpenAICompletionFallback({
                  baseUrl: normalizedUrl,
                  apiKey: providerRecord.apiKey,
                  modelId,
                  prompt: prompt.trim(),
                });
              } else {
                throw chatErr;
              }
            }
          } else {
            throw err;
          }
        }
      }
    } else if (providerRecord.type === 'anthropic' || providerRecord.type === 'anthropic-compatible') {
      responseText = await runAnthropicStyleTest({
        baseUrl: normalizedUrl,
        apiKey: providerRecord.apiKey,
        modelId,
        prompt: prompt.trim(),
      });
    } else if (providerRecord.type === 'google') {
      responseText = await runGoogleTest({
        apiKey: providerRecord.apiKey,
        modelId,
        prompt: prompt.trim(),
      });
    } else if (providerRecord.type === 'ollama') {
      responseText = await runOllamaTest({
        baseUrl: normalizedUrl,
        modelId,
        prompt: prompt.trim(),
      });
    } else {
      return NextResponse.json(
        { error: `Unsupported provider type: ${providerRecord.type}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ response: responseText });
  } catch (error) {
    const errorVal = error as Error;
    console.error('Failed to run model test:', errorVal);

    const diagnosed = diagnoseError(errorVal);

    return NextResponse.json(
      { error: diagnosed },
      { status: 500 }
    );
  }
}
