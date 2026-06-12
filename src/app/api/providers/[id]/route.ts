import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto/encryption';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }
    let decryptedKey = '';
    try {
      decryptedKey = decrypt(provider.apiKey);
    } catch {
      decryptedKey = '';
    }
    let parsedModels = [];
    try {
      parsedModels = JSON.parse(provider.models);
    } catch (e) {
      parsedModels = [];
    }
    return NextResponse.json({
      ...provider,
      apiKey: decryptedKey,
      models: parsedModels,
    });
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

    let encryptedKey = provider.apiKey;
    if (apiKey && apiKey !== '••••••••') {
      encryptedKey = encrypt(apiKey);
    }

    const updated = await prisma.provider.update({
      where: { id },
      data: {
        name,
        type,
        baseUrl,
        apiKey: encryptedKey,
        models: JSON.stringify(models),
      },
    });

    let parsedModels = [];
    try {
      parsedModels = JSON.parse(updated.models);
    } catch (e) {
      parsedModels = [];
    }

    return NextResponse.json({
      ...updated,
      apiKey: '••••••••',
      models: parsedModels,
    });
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
