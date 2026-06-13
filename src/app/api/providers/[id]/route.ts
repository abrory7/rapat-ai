import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto/encryption';
import { toProviderDto } from '@/lib/providers/provider-dto';
import { assertSafeProviderUrl } from '@/lib/providers/destination-policy';
import { normalizeBaseUrl } from '@/lib/providers/url-normalizer';
import { deleteProviderPreservingRoles } from '@/lib/providers/provider-deletion';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const provider = await prisma.provider.findUnique({
      where: { id },
      include: { _count: { select: { roles: true } } },
    });
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
      include: { _count: { select: { roles: true } } },
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
    const result = await deleteProviderPreservingRoles(prisma, id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to delete provider:', error);
    return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 });
  }
}
