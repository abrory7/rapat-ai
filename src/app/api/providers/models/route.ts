import { NextResponse } from 'next/server';
import { normalizeBaseUrl, diagnoseError } from '@/lib/providers/url-normalizer';
import { decrypt } from '@/lib/crypto/encryption';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, baseUrl, apiKey } = body;

    if (!type || !apiKey) {
      return NextResponse.json({ success: false, error: 'Missing type or apiKey' }, { status: 400 });
    }

    let actualApiKey = apiKey;
    try {
      if (apiKey.includes(':')) {
        actualApiKey = decrypt(apiKey);
      }
    } catch {
      // Use as-is
    }

    const normalizedUrl = normalizeBaseUrl(baseUrl, type);
    let models: string[] = [];

    if (type === 'openai' || type === 'openai-compatible') {
      const url = `${normalizedUrl || 'https://api.openai.com/v1'}/models`;
      try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${actualApiKey}` }});
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.data)) {
            models = data.data.map((m: any) => m.id);
          }
        } else {
           return NextResponse.json({ success: false, error: `Failed to fetch models from ${url} (Status: ${res.status})` });
        }
      } catch (err) {
        return NextResponse.json({ success: false, error: diagnoseError(err as Error) });
      }
    } else if (type === 'anthropic' || type === 'anthropic-compatible') {
      const url = `${normalizedUrl || 'https://api.anthropic.com'}/v1/models`;
      try {
        const res = await fetch(url, { headers: { 'x-api-key': actualApiKey, 'anthropic-version': '2023-06-01' }});
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.data)) {
            models = data.data.map((m: any) => m.id);
          } else if (Array.isArray(data)) {
            models = data.map((m: any) => m.id);
          }
        } else {
           return NextResponse.json({ success: false, error: 'Provider does not expose a standard /models endpoint or request failed.' });
        }
      } catch (err) {
        return NextResponse.json({ success: false, error: diagnoseError(err as Error) });
      }
    } else if (type === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${actualApiKey}`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.models)) {
            models = data.models.map((m: any) => m.name.replace('models/', ''));
          }
        } else {
          return NextResponse.json({ success: false, error: `Failed to fetch models from Google (Status: ${res.status})` });
        }
      } catch (err) {
        return NextResponse.json({ success: false, error: diagnoseError(err as Error) });
      }
    } else if (type === 'ollama') {
      const url = `${normalizedUrl || 'http://localhost:11434'}/api/tags`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.models)) {
            models = data.models.map((m: any) => m.name);
          }
        } else {
          return NextResponse.json({ success: false, error: `Failed to fetch models from Ollama (Status: ${res.status})` });
        }
      } catch (err) {
        return NextResponse.json({ success: false, error: diagnoseError(err as Error) });
      }
    } else {
      return NextResponse.json({ success: false, error: 'Unsupported provider type for fetching models' });
    }

    // Filter and sort models uniquely
    models = Array.from(new Set(models.filter(Boolean))).sort();
    return NextResponse.json({ success: true, models });

  } catch (error) {
    const errorVal = error as Error;
    return NextResponse.json({ success: false, error: errorVal?.message || 'Internal server error' }, { status: 500 });
  }
}
