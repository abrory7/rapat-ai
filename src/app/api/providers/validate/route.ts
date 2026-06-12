import { NextResponse } from 'next/server';
import { normalizeBaseUrl, diagnoseError } from '@/lib/providers/url-normalizer';
import { decrypt } from '@/lib/crypto/encryption';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, baseUrl, apiKey, modelId } = body;

    if (!type || !apiKey) {
      return NextResponse.json({ valid: false, error: 'Missing type or apiKey' }, { status: 400 });
    }

    let actualApiKey = apiKey;
    try {
      if (apiKey.includes(':')) {
        actualApiKey = decrypt(apiKey);
      }
    } catch {
      // Use as-is
    }

    let isValid = false;
    let errorMessage = '';
    let rawResponse: unknown = null;

    const normalizedUrl = normalizeBaseUrl(baseUrl, type);

    if (type === 'openai' || type === 'openai-compatible') {
      const url = `${normalizedUrl || 'https://api.openai.com/v1'}/models`;
      try {
        let res = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${actualApiKey}`,
          },
        });

        // Fallback to chat completions or completions if models endpoint returns any error (common on custom compatibility servers)
        if (res.status !== 200 && res.status !== 201 && modelId) {
          const chatUrl = `${normalizedUrl || 'https://api.openai.com/v1'}/chat/completions`;
          try {
            const chatRes = await fetch(chatUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${actualApiKey}`,
              },
              body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
              }),
            });

            if (chatRes.status === 200 || chatRes.status === 201) {
              res = chatRes;
            } else {
              // If chat completions fails (common for completion-only/code models), try legacy completions endpoint
              const completionsUrl = `${normalizedUrl || 'https://api.openai.com/v1'}/completions`;
              const compRes = await fetch(completionsUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${actualApiKey}`,
                },
                body: JSON.stringify({
                  model: modelId,
                  prompt: 'ping',
                  max_tokens: 1,
                }),
              });

              if (compRes.status === 200 || compRes.status === 201) {
                res = compRes;
              } else {
                res = chatRes; // fall back to using chatRes for diagnosis
              }
            }
          } catch {
            // keep original models response
          }
        }

        if (res.status === 200 || res.status === 201) {
          isValid = true;
        } else {
          const contentType = res.headers.get('content-type') || '';
          let errMessage = '';
          if (contentType.includes('application/json')) {
            const data = await res.json().catch(() => ({}));
            rawResponse = data;
            errMessage = typeof data?.error === 'string'
              ? data.error
              : data?.error?.message || `API responded with status ${res.status}`;
          } else {
            const text = await res.text().catch(() => '');
            rawResponse = { rawText: text };
            const snippet = text.slice(0, 300).trim();
            errMessage = `API responded with status ${res.status} (non-JSON). Raw response preview: "${snippet}"`;
          }
          errorMessage = diagnoseError(new Error(errMessage));
        }
      } catch (err) {
        errorMessage = diagnoseError(err as Error);
      }
    } else if (type === 'anthropic' || type === 'anthropic-compatible') {
      const url = `${normalizedUrl || 'https://api.anthropic.com'}/v1/models`;
      try {
        let res = await fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': actualApiKey,
            'anthropic-version': '2023-06-01',
          },
        });

        // Fallback to messages API check if models returns anything other than 200/201
        if (res.status !== 200 && res.status !== 201 && modelId) {
          const chatUrl = `${normalizedUrl || 'https://api.anthropic.com'}/v1/messages`;
          try {
            const chatRes = await fetch(chatUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': actualApiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
              }),
            });
            if (chatRes.status === 200 || chatRes.status === 201) {
              res = chatRes;
            }
          } catch {
            // keep original models response
          }
        }

        if (res.status === 200 || res.status === 201) {
          isValid = true;
        } else {
          const contentType = res.headers.get('content-type') || '';
          let errMessage = '';
          if (contentType.includes('application/json')) {
            const data = await res.json().catch(() => ({}));
            rawResponse = data;
            errMessage = typeof data?.error === 'string'
              ? data.error
              : data?.error?.message || `API responded with status ${res.status}`;
          } else {
            const text = await res.text().catch(() => '');
            rawResponse = { rawText: text };
            const snippet = text.slice(0, 300).trim();
            errMessage = `API responded with status ${res.status} (non-JSON). Raw response preview: "${snippet}"`;
          }
          errorMessage = diagnoseError(new Error(errMessage));
        }
      } catch (err) {
        errorMessage = diagnoseError(err as Error);
      }
    } else if (type === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${actualApiKey}`;
      try {
        const res = await fetch(url, { method: 'GET' });
        if (res.status === 200) {
          isValid = true;
        } else {
          const contentType = res.headers.get('content-type') || '';
          let errMessage = '';
          if (contentType.includes('application/json')) {
            const data = await res.json().catch(() => ({}));
            rawResponse = data;
            errMessage = typeof data?.error === 'string'
              ? data.error
              : data?.error?.message || `API responded with status ${res.status}`;
          } else {
            const text = await res.text().catch(() => '');
            rawResponse = { rawText: text };
            const snippet = text.slice(0, 300).trim();
            errMessage = `API responded with status ${res.status} (non-JSON). Raw response preview: "${snippet}"`;
          }
          errorMessage = diagnoseError(new Error(errMessage));
        }
      } catch (err) {
        errorMessage = diagnoseError(err as Error);
      }
    } else if (type === 'ollama') {
      const url = `${normalizedUrl || 'http://localhost:11434'}/api/tags`;
      try {
        const res = await fetch(url, { method: 'GET' });
        if (res.status === 200) {
          isValid = true;
        } else {
          const text = await res.text().catch(() => '');
          rawResponse = { rawText: text };
          const snippet = text.slice(0, 300).trim();
          const errMessage = `Ollama responded with status ${res.status}. Raw response preview: "${snippet}"`;
          errorMessage = diagnoseError(new Error(errMessage));
        }
      } catch (err) {
        errorMessage = diagnoseError(err as Error);
      }
    } else {
      errorMessage = `Unsupported provider type: ${type}`;
    }

    return NextResponse.json({ valid: isValid, error: errorMessage, raw: rawResponse });
  } catch (error) {
    const errorVal = error as Error;
    console.error('Validation error:', errorVal);
    return NextResponse.json({ valid: false, error: errorVal?.message || 'Internal server error' }, { status: 500 });
  }
}
