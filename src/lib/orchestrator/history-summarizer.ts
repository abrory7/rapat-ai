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
    if (parsed.decisions.length > 0) {
      actions.push(`Decisions:\n${parsed.decisions.map(d => `    * ${d}`).join('\n')}`);
    }
    if (parsed.flags.length > 0) {
      actions.push(`Flags:\n${parsed.flags.map(f => `    * ${f}`).join('\n')}`);
    }
    if (parsed.parkingLot.length > 0) {
      actions.push(`Parking Lot:\n${parsed.parkingLot.map(p => `    * ${p}`).join('\n')}`);
    }
    if (parsed.delegateTo) {
      actions.push(`Delegated to @${parsed.delegateTo}`);
    }

    // Extract unresolved questions
    const unresolvedRegex = /(?:^|\n)\s*[-*]?\s*(?:\[(?:UNRESOLVED|BELUM[_-]SELESAI|BELUM[_-]TERJAWAB|PERTANYAAN).*?\]|\*\*(?:Unresolved|Belum\s+Selesai|Belum\s+Terjawab|Pertanyaan).*?\*\*|(?:Unresolved|Belum\s+Selesai|Belum\s+Terjawab|Pertanyaan).*?:\s*)(.*?)(?=\n|$)/gi;
    const unresolved: string[] = [];
    let uMatch;
    while ((uMatch = unresolvedRegex.exec(msg.content)) !== null) {
      if (uMatch[1].trim()) unresolved.push(uMatch[1].trim());
    }
    if (unresolved.length > 0) {
      actions.push(`Unresolved Questions:\n${unresolved.map(u => `    * ${u}`).join('\n')}`);
    }

    // Extract role conclusions
    const conclusionRegex = /(?:^|\n)\s*[-*]?\s*(?:\[(?:CONCLUSION|KESIMPULAN).*?\]|\*\*(?:Conclusion|Kesimpulan).*?\*\*|(?:Conclusion|Kesimpulan).*?:\s*)(.*?)(?=\n|$)/gi;
    const conclusions: string[] = [];
    let cMatch;
    while ((cMatch = conclusionRegex.exec(msg.content)) !== null) {
      if (cMatch[1].trim()) conclusions.push(cMatch[1].trim());
    }
    if (parsed.isClosing) {
      conclusions.push("Signaled READY TO CLOSE");
    }
    if (conclusions.length > 0) {
      actions.push(`Role Conclusions:\n${conclusions.map(c => `    * ${c}`).join('\n')}`);
    }
    
    if (actions.length > 0) {
      summaryLine += `\n  Extracted Data:\n  ${actions.join('\n  ')}`;
    }
    parts.push(summaryLine);
  }

  return parts.join('\n\n');
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
  const targetEndIndex = messages.length - 10;
  const startIndex = Math.max(2, summarizedMessageCount);
  
  if (startIndex >= targetEndIndex) {
    return null;
  }

  const messagesToSummarize = messages.slice(startIndex, targetEndIndex);
  
  let newSummaryText = currentSummary || '';
  
  if (generateSummaryFn) {
    try {
      const textToSummarize = messagesToSummarize.map(m => `[${m.sender}]: ${m.content}`).join('\n\n');
      const generated = await generateSummaryFn(`Summarize the following discussion points, retaining decisions, flags, parking items, unresolved questions, and role conclusions. Previous summary context: ${currentSummary || 'None'}\n\nNew messages:\n${textToSummarize}`);
      if (!generated || generated.trim() === '') {
        throw new Error('Model returned empty summary');
      }
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
