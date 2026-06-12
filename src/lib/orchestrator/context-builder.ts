import { parseResponse } from './response-parser';

interface Message {
  sender: string;
  content: string;
}

interface SessionInput {
  topic: string;
  template: {
    name: string;
    rules?: string | null;
  };
}

interface RoleInput {
  name: string;
  slug: string;
}

/**
 * Compiles accumulated discussion state (decisions, parking lot, flags) and formats the sliding window message history.
 */
export async function buildContext({
  session,
  role,
  messages,
  registeredSlugs,
}: {
  session: SessionInput;
  role: RoleInput;
  messages: Message[];
  registeredSlugs: string[];
}) {
  const accumulatedDecisions: string[] = [];
  const accumulatedParkingLot: string[] = [];
  const accumulatedFlags: string[] = [];

  // Parse all messages to gather state
  for (const msg of messages) {
    if (msg.sender !== 'USER' && msg.sender !== 'SYSTEM') {
      const parsed = parseResponse(msg.content, registeredSlugs);
      accumulatedDecisions.push(...parsed.decisions);
      accumulatedParkingLot.push(...parsed.parkingLot);
      accumulatedFlags.push(...parsed.flags);
    }
  }

  const decisions = Array.from(new Set(accumulatedDecisions));
  const parkingLot = Array.from(new Set(accumulatedParkingLot));
  const flags = Array.from(new Set(accumulatedFlags));

  // Build the discussion context system block
  let contextPrompt = `### CURRENT DISCUSSION STATE
- **Topic:** ${session.topic}
- **Discussion Template:** ${session.template.name}
`;

  if (session.template.rules) {
    contextPrompt += `\n**Discussion Rules & Guidelines:**\n${session.template.rules}\n`;
  }

  if (decisions.length > 0) {
    contextPrompt += `\n**Accumulated Decisions:**\n${decisions.map((d) => `- [DECISION] ${d}`).join('\n')}\n`;
  }

  if (parkingLot.length > 0) {
    contextPrompt += `\n**Parking Lot (Deferred items):**\n${parkingLot.map((p) => `- [PARKING LOT] ${p}`).join('\n')}\n`;
  }

  if (flags.length > 0) {
    contextPrompt += `\n**Active Flags (Risks/Blockers):**\n${flags.map((f) => `- [FLAG] ${f}`).join('\n')}\n`;
  }

  contextPrompt += `
### YOUR CURRENT TURN
You are speaking as **${role.name}** (@${role.slug}).
Act as if you are in a real, dynamic professional meeting. Review the conversation history and make your contribution:
- **Use Workspace Tools & Codebase Exploration Protocol**:
  You have access to local workspace tools (\`list_files\`, \`read_file\`, and \`search_code\`) to inspect the project's codebase. You MUST follow this protocol when exploring:
  1. *Follow Imports*: If a file imports a local module (e.g., \`import { X } from '@/lib/Y'\`) and you need its logic to make a decision, follow the path and read that file.
  2. *Error Handling & Recovery*:
     - If a file path is not found, use \`list_files\` on the parent folder to verify exact filenames and extensions (avoid guessing filenames or extensions).
     - If a file is too large (>100KB) or reading fails, use \`search_code\` with specific function or class names to pinpoint the relevant lines instead of reading the whole file.
     - If access to a file is ignored/blocked by ignore rules, do not try to read it; respect the boundary, explain it to the team, or look for placeholder files (like \`.env.example\`).
  3. *Verify Patterns*: Always list files of directories before proposing new folders to match the existing project naming convention (e.g., kebab-case vs camelCase).
- **Language of Discussion**: You MUST respond and discuss in the same language used in the discussion topic: "${session.topic}". For example, if the topic is written in Indonesian, you must discuss and respond in Indonesian; if the topic is written in English, you must discuss and respond in English.
- **Think critically and actively participate**: Do NOT simply agree with previous points (avoid sycophancy). If a proposal has flaws, politely challenge it, suggest alternatives, or play the devil's advocate to ensure robustness. Clarify ambiguities, negotiate, and steer the focus toward actionable technical planning.
- **Be concise, direct, and conversational**: Avoid robotic greetings, cliches, or overly formal language. Speak like a real human expert.
- **NO FULL CODE DUMPS**: This is a planning discussion, not an IDE. DO NOT write full code implementations or large scripts. If absolutely necessary, use ONLY short pseudo-code or minimal snippets to illustrate a concept. Keep the focus on high-level architecture and task breakdown.
- **Address others directly**: Ask questions, challenge assumptions, or delegate tasks using their @SLUG (available: ${registeredSlugs.map((s) => `@${s}`).join(', ')}).
- **Focus on the end goal**: Ensure the discussion ultimately generates concrete data and technical planning.

(Optional System Tags - Use sparingly only when strictly necessary):
- To finalize a firm agreement: "- [DECISION] <content>"
- To defer an off-topic idea: "- [PARKING LOT] <content>"
- To highlight a critical blocker/risk: "[FLAG: <reason>]"
- If you have nothing more to add for this round: "[READY TO CLOSE]"
`;

  // Sliding window context: keep the first 2 (intro) and last 10 messages
  const maxMessages = 12;
  let historyMessages = [...messages];
  let summaryText = '';

  if (messages.length > maxMessages) {
    const firstMessages = messages.slice(0, 2);
    const lastMessages = messages.slice(-10);
    const middleCount = messages.length - 12;
    summaryText = `[System: ${middleCount} historical messages omitted for context size limit. Active decisions and parking lot are listed above.]\n`;
    historyMessages = [...firstMessages, ...lastMessages];
  }

  return {
    systemContext: contextPrompt,
    messages: historyMessages,
    summaryText,
  };
}

export default buildContext;
