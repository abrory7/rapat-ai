import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto/encryption';
import { toProviderDto } from '@/lib/providers/provider-dto';
import { assertSafeProviderUrl } from '@/lib/providers/destination-policy';
import { normalizeBaseUrl } from '@/lib/providers/url-normalizer';

export async function GET() {
  try {
    const providers = await prisma.provider.findMany();
    return NextResponse.json(providers.map(toProviderDto));
  } catch (error) {
    console.error('Failed to fetch providers:', error);
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, type, baseUrl, apiKey, models } = body;
    if (!name || !type || !apiKey || !models) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl, type);
    if (normalizedBaseUrl) await assertSafeProviderUrl(normalizedBaseUrl);
    const encryptedKey = encrypt(apiKey);
    const provider = await prisma.provider.create({
      data: {
        name,
        type,
        baseUrl: normalizedBaseUrl,
        apiKey: encryptedKey,
        models: JSON.stringify(models),
      },
    });
    return NextResponse.json(toProviderDto(provider));
  } catch (error) {
    console.error('Failed to create provider:', error);
    return NextResponse.json({ error: 'Failed to create provider' }, { status: 500 });
  }
}
