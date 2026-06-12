import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto/encryption';
import { toProviderDto } from '@/lib/providers/provider-dto';
import { assertSafeProviderUrl } from '@/lib/providers/destination-policy';
import { normalizeBaseUrl } from '@/lib/providers/url-normalizer';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }
    return NextResponse.json(toProviderDto(provider));
  } catch (error) {
    console.error('Failed to fetch provider:', error);
    return NextResponse.json({ error: 'Failed to fetch provider' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, type, baseUrl, apiKey, models } = body;

    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const normalizedBaseUrl = normalizeBaseUrl(baseUrl, type);
    if (normalizedBaseUrl) await assertSafeProviderUrl(normalizedBaseUrl);

    let encryptedKey = provider.apiKey;
    if (typeof apiKey === 'string' && apiKey.trim()) {
      encryptedKey = encrypt(apiKey.trim());
    }

    const updated = await prisma.provider.update({
      where: { id },
      data: {
        name,
        type,
        baseUrl: normalizedBaseUrl,
        apiKey: encryptedKey,
        models: JSON.stringify(models),
      },
    });

    return NextResponse.json(toProviderDto(updated));
  } catch (error) {
    console.error('Failed to update provider:', error);
    return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.provider.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete provider:', error);
    return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 });
  }
}
