import { createAgentFromRole } from '../agents/factory';
import { prisma } from '@/lib/db';
import { parseResponse } from '@/lib/orchestrator/response-parser';

/**
 * Orchestrates the final Project Manager compilation step. 
 * Gathers decisions, parking lot, and transcripts, and compiles the final Planning Document.
 */
async function compilePlanningDocumentInternal(sessionId: string): Promise<string> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      project: true,
      template: {
        include: {
          templateRoles: {
            include: {
              role: true,
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!session) {
    throw new Error(`Session with ID "${sessionId}" not found.`);
  }

  // Find PM role in this template, or fallback to the built-in PM role
  const pmTemplateRole = session.template.templateRoles.find(
    (tr) => tr.role.slug === 'pm'
  );
  let pmRole = pmTemplateRole?.role;
  if (!pmRole) {
    pmRole =
      (await prisma.role.findFirst({
        where: { slug: 'pm' },
      })) || undefined;
  }

  if (!pmRole) {
    throw new Error('Project Manager role not found to compile the planning document.');
  }

  // Find a provider configured for compiling
  const provider = pmRole.providerId
    ? await prisma.provider.findUnique({ where: { id: pmRole.providerId } })
    : await prisma.provider.findFirst();

  if (!provider) {
    throw new Error(
      `No AI Provider assigned to the Project Manager role or configured in the workspace. Please check settings.`
    );
  }

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

  // Build formatted transcript
  const transcript = session.messages
    .map((m) => `[${m.sender}] (${new Date(m.createdAt).toLocaleTimeString()}):\n${m.content}`)
    .join('\n\n');

  const roleGuidance = session.template.templateRoles
    .map((tr) => `- **${tr.role.name} (@${tr.role.slug})**: Synthesize and integrate their specific domain insights, designs, and decisions.`)
    .join('\n');

  const compilationPrompt = `You are the Project Coordinator and Compiler. The discussion session for the topic "${session.topic}" (Template: "${session.template.name}") is now complete. 
Your task is to review the accumulated decisions, parking lot items, and full conversation transcript below, and compile a final, comprehensive, and professional **Planning & Strategy Document** in Markdown.

### ACCUMULATED DECISIONS:
${uniqueDecisions.length > 0 ? uniqueDecisions.map((d) => `- ${d}`).join('\n') : 'None recorded.'}

### PARKING LOT (DEFERRED ITEMS):
${uniqueParkingLot.length > 0 ? uniqueParkingLot.map((p) => `- ${p}`).join('\n') : 'None recorded.'}

### DISCUSSION TRANSCRIPT:
${transcript}

### COMPILATION GUIDELINES:
1. **Lineup Roles to Integrate**:
   This discussion involved the following roles. You must integrate their respective inputs:
${roleGuidance}

2. **Dynamic Document Structure**:
   Structure the document logically using Markdown. The format must adapt to the topic and the participating roles. You should include:
   - **Title**: A professional title derived from the topic.
   - **Executive Summary / Overview**: Context, discussion goals, and high-level outcomes.
   - **Core Domain Specifications**: Dedicated sections reflecting the contributions of the participating roles (e.g., if a Lead Architect was present, include System Architecture; if a Marketing Strategist was present, include Marketing Strategy & Brand Positioning, etc.).
   - **Action Plan & Implementation Steps**: A concrete breakdown of next steps, technical tasks, or campaign milestones.
   - **Deferred Items & Future Phases**: Incorporate parking lot items as areas for future consideration.

3. **Critical Rules**:
   - Keep the information concise, but DO NOT lose any technical detail, specific requirements, code schemas, design mockups, or strategic decisions discussed.
   - The final planning document MUST be written entirely in English.
   - Output ONLY the final markdown content. Do not include chat greetings or conversational remarks.`;

  // Instantiate PM Agent
  const pmAgent = createAgentFromRole({
    role: pmRole,
    provider,
    skills: [],
    tools: {}, // No workspace tools needed for compilation
  });

  console.log(`[Compilation debug] [Session ID: ${sessionId}] Calling pmAgent.stream with prompt...`);
  
  const streamPromise = (async () => {
    const stream = await pmAgent.stream(compilationPrompt);
    console.log(`[Compilation debug] [Session ID: ${sessionId}] Stream object received. Starting textStream iteration...`);
    
    let planningDoc = '';
    let chunkCount = 0;
    for await (const chunk of stream.textStream) {
      chunkCount++;
      planningDoc += chunk;
      if (chunkCount === 1 || chunkCount % 10 === 0) {
        console.log(`[Compilation debug] Received chunk #${chunkCount} (length: ${chunk.length}). Total content length: ${planningDoc.length}`);
      }
    }
    return planningDoc;
  })();

  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error('Compilation timed out after 90 seconds')), 90000);
  });

  const planningDoc = await Promise.race([streamPromise, timeoutPromise]);
  console.log(`[Compilation debug] [Session ID: ${sessionId}] Stream consumed. Total Length: ${planningDoc?.length}`);

  if (!planningDoc || planningDoc.trim() === '') {
    console.error(`[Compilation debug] [Session ID: ${sessionId}] Error: Generated planning document is empty!`);
    throw new Error('Generated planning document is empty');
  }

  console.log(`[Compilation debug] [Session ID: ${sessionId}] Saving planning document and updating status to COMPLETED...`);
  // Save compiled document to database and set status to completed
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      planningDocument: planningDoc,
      status: 'COMPLETED',
    },
  });
  console.log(`[Compilation debug] [Session ID: ${sessionId}] Database update done.`);

  return planningDoc;
}

export async function compilePlanningDocument(sessionId: string): Promise<string> {
  const maxAttempts = 3;
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await compilePlanningDocumentInternal(sessionId);
    } catch (err: any) {
      lastError = err;
      console.warn(`[Compilation] Attempt ${attempt} failed: ${err.message || err}`);
      if (attempt < maxAttempts) {
        const delay = attempt * 2000;
        console.log(`[Compilation] Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error('Compilation failed after maximum retry attempts');
}
