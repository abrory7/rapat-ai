import { prisma } from '../db';
import { decrypt } from '../crypto/encryption';
import { parseResponse } from '@/lib/orchestrator/response-parser';

async function main() {
  const sessionId = '989f6f60-1d4f-4d19-b3b9-37da0130341b';
  console.log(`fetching prompt for session ${sessionId}...`);

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      template: {
        include: {
          templateRoles: {
            include: { role: true }
          }
        }
      },
      messages: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!session) throw new Error('Session not found');

  const pmTemplateRole = session.template.templateRoles.find((tr) => tr.role.slug === 'pm');
  let pmRole = pmTemplateRole?.role || await prisma.role.findFirst({ where: { slug: 'pm' } });
  if (!pmRole) throw new Error('PM role not found');

  const provider = pmRole.providerId
    ? await prisma.provider.findUnique({ where: { id: pmRole.providerId } })
    : await prisma.provider.findFirst();
  if (!provider) throw new Error('Provider not found');

  const registeredSlugs = session.template.templateRoles.map((tr) => tr.role.slug);
  const decisions: string[] = [];
  const parkingLot: string[] = [];

  for (const msg of session.messages) {
    if (msg.sender !== 'USER' && msg.sender !== 'SYSTEM') {
      const parsed = parseResponse(msg.content, registeredSlugs);
      decisions.push(...parsed.decisions);
      parkingLot.push(...parsed.parkingLot);
    }
  }

  const uniqueDecisions = Array.from(new Set(decisions));
  const uniqueParkingLot = Array.from(new Set(parkingLot));

  const transcript = session.messages
    .map((m) => `[${m.sender}] (${new Date(m.createdAt).toLocaleTimeString()}):\n${m.content}`)
    .join('\n\n');

  const compilationPrompt = `You are the Project Manager. The discussion session is now complete. Review the accumulated decisions, parking lot items, and full conversation transcript below, and compile a final, comprehensive, and professional **Planning Document** in Markdown.

Topic: ${session.topic}

### ACCUMULATED DECISIONS:
${uniqueDecisions.length > 0 ? uniqueDecisions.map((d) => `- ${d}`).join('\n') : 'None recorded.'}

### PARKING LOT (DEFERRED ITEMS):
${uniqueParkingLot.length > 0 ? uniqueParkingLot.map((p) => `- ${p}`).join('\n') : 'None recorded.'}

### DISCUSSION TRANSCRIPT:
${transcript}

Compile a detailed Planning Document in Markdown. Ensure it has:
- **Title** (based on the Topic)
- **Executive Summary**
- **System Architecture & Tech Stack** (integrating Lead Architect's inputs)
- **Implementation Plan & Task Breakdown** (integrating Lead Engineer's inputs)
- **Quality Assurance & Security Strategy** (integrating QA-Sec's inputs)
- **Deferred Items & Next Steps** (integrating parking lot items)

Output ONLY the final markdown content. Do not include chat greetings or conversational remarks.`;

  const apiKey = decrypt(provider.apiKey);
  const url = `${provider.baseUrl || 'http://localhost:20128/v1'}/chat/completions`;
  const model = pmRole.modelId || 'gemini/gemini-3.1-flash-lite-preview';

  console.log(`Direct fetch to URL: ${url}`);
  console.log(`Model: ${model}`);

  const payload = {
    model,
    messages: [
      { role: 'user', content: compilationPrompt }
    ],
    stream: true
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  console.log(`HTTP Status: ${response.status} ${response.statusText}`);
  console.log('Headers:');
  response.headers.forEach((val, key) => console.log(`  ${key}: ${val}`));

  console.log('\nResponse Stream Body:');
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let chunksCount = 0;
    while (!done) {
      const { value, done: doneRead } = await reader.read();
      done = doneRead;
      if (value) {
        chunksCount++;
        const text = decoder.decode(value);
        console.log(`Chunk #${chunksCount} (${value.length} bytes):`);
        console.log(text.substring(0, 500));
        console.log('-------------------------------------------');
      }
    }
    console.log(`Stream finished. Chunks count: ${chunksCount}`);
  } else {
    console.log('Response body is null');
  }
}

main().catch(console.error);
