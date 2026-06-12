import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/crypto/encryption';

export async function GET() {
  try {
    const providers = await prisma.provider.findMany();
    const sanitized = providers.map((p) => {
      let parsedModels = [];
      try {
        parsedModels = JSON.parse(p.models);
      } catch (e) {
        parsedModels = [];
      }
      return {
        ...p,
        apiKey: '••••••••',
        models: parsedModels,
      };
    });
    return NextResponse.json(sanitized);
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
    const encryptedKey = encrypt(apiKey);
    const provider = await prisma.provider.create({
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
      parsedModels = JSON.parse(provider.models);
    } catch (e) {
      parsedModels = [];
    }
    return NextResponse.json({
      ...provider,
      apiKey: '••••••••',
      models: parsedModels,
    });
  } catch (error) {
    console.error('Failed to create provider:', error);
    return NextResponse.json({ error: 'Failed to create provider' }, { status: 500 });
  }
}
