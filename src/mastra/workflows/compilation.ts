import { createAgentFromRole } from '../agents/factory';
import { prisma } from '@/lib/db';
import { parseResponse } from '@/lib/orchestrator/response-parser';

export function buildCompilationPrompt({
  topic,
  templateName,
  roleGuidance,
  uniqueDecisions,
  uniqueParkingLot,
  messages,
  contextSummary
}: {
  topic: string;
  templateName: string;
  roleGuidance: string;
  uniqueDecisions: string[];
  uniqueParkingLot: string[];
  messages: Array<{ sender: string; content: string; createdAt: Date | string }>;
  contextSummary?: string | null;
}) {
  let currentLength = 0;
  const transcriptParts: string[] = [];
  const OMISSION_MARKER = "[... older messages omitted due to length constraints ...]";
  const MAX_CHARS = 60000;
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const dateStr = m.createdAt instanceof Date ? m.createdAt.toLocaleTimeString() : new Date(m.createdAt).toLocaleTimeString();
    const prefix = `[${m.sender}] (${dateStr}):\n`;
    const fullPart = prefix + m.content;
    const separatorLength = transcriptParts.length > 0 ? 2 : 0; // "\n\n"
    
    // Check if adding this message and the omission marker exceeds the limit
    if (currentLength + separatorLength + fullPart.length + OMISSION_MARKER.length + 2 > MAX_CHARS) {
       // We must include the omission marker. How much space is left for this message?
       // The total budget minus what we already have, minus the separator and the marker length and its separator.
       // It's exactly:
       const allowedLength = MAX_CHARS - currentLength - separatorLength - OMISSION_MARKER.length - 2;
       
       if (allowedLength > prefix.length + 20) {
         // There is enough space to at least include the prefix and a snippet of the content
         const truncatedContent = m.content.substring(0, allowedLength - prefix.length - 16) + '... [TRUNCATED]';
         transcriptParts.unshift(prefix + truncatedContent);
       }
       transcriptParts.unshift(OMISSION_MARKER);
       break;
    }
    transcriptParts.unshift(fullPart);
    currentLength += separatorLength + fullPart.length;
  }
  
  const transcript = transcriptParts.join('\n\n');

  let prompt = `You are the Project Coordinator and Compiler. The discussion session for the topic "${topic}" (Template: "${templateName}") is now complete. 
Your task is to review the accumulated decisions, parking lot items, context summary, and conversation transcript below, and compile a final, comprehensive, and professional **Planning & Strategy Document** in Markdown.\n\n`;

  if (contextSummary) {
    prompt += `### PREVIOUS DISCUSSION SUMMARY:\n${contextSummary}\n\n`;
  }

  prompt += `### ACCUMULATED DECISIONS:\n${uniqueDecisions.length > 0 ? uniqueDecisions.map((d) => `- ${d}`).join('\n') : 'None recorded.'}\n\n### PARKING LOT (DEFERRED ITEMS):\n${uniqueParkingLot.length > 0 ? uniqueParkingLot.map((p) => `- ${p}`).join('\n') : 'None recorded.'}\n\n### LATEST DISCUSSION TRANSCRIPT:\n${transcript}\n\n### COMPILATION GUIDELINES:
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
   - The final planning document MUST be written in the primary language of the topic: "${topic}".
   - Output ONLY the final markdown content. Do not include chat greetings or conversational remarks.`;

  return prompt;
}

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

  const roleGuidance = session.template.templateRoles
    .map((tr) => `- **${tr.role.name} (@${tr.role.slug})**: Synthesize and integrate their specific domain insights, designs, and decisions.`)
    .join('\n');



  const compilationPrompt = buildCompilationPrompt({
    topic: session.topic,
    templateName: session.template.name,
    roleGuidance,
    uniqueDecisions,
    uniqueParkingLot,
    messages: session.messages,
    contextSummary: session.contextSummary,
  });

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
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await compilePlanningDocumentInternal(sessionId);
    } catch (err: unknown) {
      lastError = err;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[Compilation] Attempt ${attempt} failed: ${errorMessage}`);
      if (attempt < maxAttempts) {
        const delay = attempt * 2000;
        console.log(`[Compilation] Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error('Compilation failed after maximum retry attempts');
}
