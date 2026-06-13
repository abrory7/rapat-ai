import { parseResponse } from './response-parser';

export interface SummarizeInput {
  messages: Array<{ sender: string; content: string }>;
  currentSummary: string | null;
  summarizedMessageCount: number;
  registeredSlugs: string[];
}

export interface SummarizeResult {
  newSummary: string;
  newSummarizedCount: number;
}

/**
 * Creates a deterministic fallback summary of messages when model generation fails or is skipped.
 */
export function createDeterministicSummary(
  messages: Array<{ sender: string; content: string }>,
  registeredSlugs: string[],
  previousSummary: string | null
): string {
  const parts: string[] = [];
  if (previousSummary) {
    parts.push(previousSummary);
  }

  for (const msg of messages) {
    const parsed = parseResponse(msg.content, registeredSlugs);
    const excerpt = msg.content.length > 100 ? msg.content.substring(0, 97) + '...' : msg.content;
    let summaryLine = `- ${msg.sender} spoke: "${excerpt}"`;
    
    const actions: string[] = [];
    if (parsed.decisions.length > 0) actions.push(`Decisions: ${parsed.decisions.length}`);
    if (parsed.flags.length > 0) actions.push(`Flags: ${parsed.flags.length}`);
    if (parsed.parkingLot.length > 0) actions.push(`Parking Lot: ${parsed.parkingLot.length}`);
    if (parsed.delegateTo) actions.push(`Delegated to @${parsed.delegateTo}`);
    
    if (actions.length > 0) {
      summaryLine += ` (${actions.join(', ')})`;
    }
    parts.push(summaryLine);
  }

  return parts.join('\n');
}

/**
 * Summarizes older messages in the history to keep the context window bounded.
 */
export async function summarizeHistoryIfNeeded(
  input: SummarizeInput,
  generateSummaryFn?: (textToSummarize: string) => Promise<string>
): Promise<SummarizeResult | null> {
  const { messages, currentSummary, summarizedMessageCount, registeredSlugs } = input;
  
  if (messages.length <= 12) {
    return null;
  }

  // We keep first 2 and last 10.
  // The messages that need to be summarized are from index 2 up to length - 10.
  const targetEndIndex = messages.length - 10;
  
  // We only summarize messages that haven't been summarized yet.
  // summarizedMessageCount tracks how many messages from the start of the array have been summarized.
  // However, the first 2 messages are NEVER summarized (they are the intro).
  // So the first message to be summarized is index 2.
  // If summarizedMessageCount is 0, we start at index 2.
  // If summarizedMessageCount > 2, we start at index `summarizedMessageCount`.
  const startIndex = Math.max(2, summarizedMessageCount);
  
  if (startIndex >= targetEndIndex) {
    return null; // Nothing new to summarize
  }

  const messagesToSummarize = messages.slice(startIndex, targetEndIndex);
  
  let newSummaryText = currentSummary || '';
  
  if (generateSummaryFn) {
    try {
      const textToSummarize = messagesToSummarize.map(m => `[${m.sender}]: ${m.content}`).join('\n\n');
      const generated = await generateSummaryFn(`Summarize the following discussion points, retaining decisions, flags, parking items, unresolved questions, and role conclusions. Previous summary context: ${currentSummary || 'None'}\n\nNew messages:\n${textToSummarize}`);
      newSummaryText = generated;
    } catch (e) {
      console.warn('Model summarization failed, falling back to deterministic summary', e);
      newSummaryText = createDeterministicSummary(messagesToSummarize, registeredSlugs, currentSummary);
    }
  } else {
    newSummaryText = createDeterministicSummary(messagesToSummarize, registeredSlugs, currentSummary);
  }

  return {
    newSummary: newSummaryText,
    newSummarizedCount: targetEndIndex,
  };
}
