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

export interface ExtractedFacts {
  decisions: string[];
  flags: string[];
  parkingLot: string[];
  unresolved: string[];
  conclusions: string[];
}

/**
 * Extracts unresolved questions using various tags, bracket shapes, and styles.
 */
export function extractUnresolvedQuestions(content: string): string[] {
  const list: string[] = [];
  let match;

  // 1. Bracket format with colon: [UNRESOLVED: content]
  const bracketColonRegex = /\[(?:UNRESOLVED|BELUM[_-]SELESAI|BELUM[_-]TERJAWAB|PERTANYAAN):\s*([^\]\n]+)\]/gi;
  while ((match = bracketColonRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }

  // 2. Bracket format without colon: [UNRESOLVED] content
  const bracketNoColonRegex = /(?:^|\n)\s*[-*]?\s*\[(?:UNRESOLVED|BELUM[_-]SELESAI|BELUM[_-]TERJAWAB|PERTANYAAN)\]\s*([^\n]+)/gi;
  while ((match = bracketNoColonRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }

  // 3. Bold format: **Unresolved**: content or **Unresolved** content
  const boldRegex = /(?:^|\n)\s*[-*]?\s*\*\*(?:Unresolved|Belum\s+Selesai|Belum\s+Terjawab|Pertanyaan)\*\*:\s*([^\n]+)/gi;
  while ((match = boldRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }
  const boldNoColonRegex = /(?:^|\n)\s*[-*]?\s*\*\*(?:Unresolved|Belum\s+Selesai|Belum\s+Terjawab|Pertanyaan)\*\*\s+([^\n]+)/gi;
  while ((match = boldNoColonRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }

  // 4. Plain text format: Unresolved: content
  const plainRegex = /(?:^|\n)\s*[-*]?\s*(?:Unresolved|Belum\s+Selesai|Belum\s+Terjawab|Pertanyaan):\s*([^\n]+)/gi;
  while ((match = plainRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }

  return Array.from(new Set(list));
}

/**
 * Extracts role conclusions using various tags, bracket shapes, and styles.
 */
export function extractConclusions(content: string, sender: string, isClosing: boolean): string[] {
  const list: string[] = [];
  let match;

  // 1. Bracket format with colon: [CONCLUSION: content]
  const bracketColonRegex = /\[(?:CONCLUSION|KESIMPULAN):\s*([^\]\n]+)\]/gi;
  while ((match = bracketColonRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }

  // 2. Bracket format without colon: [CONCLUSION] content
  const bracketNoColonRegex = /(?:^|\n)\s*[-*]?\s*\[(?:CONCLUSION|KESIMPULAN)\]\s*([^\n]+)/gi;
  while ((match = bracketNoColonRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }

  // 3. Bold format: **Conclusion**: content or **Conclusion** content
  const boldRegex = /(?:^|\n)\s*[-*]?\s*\*\*(?:Conclusion|Kesimpulan)\*\*:\s*([^\n]+)/gi;
  while ((match = boldRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }
  const boldNoColonRegex = /(?:^|\n)\s*[-*]?\s*\*\*(?:Conclusion|Kesimpulan)\*\*\s+([^\n]+)/gi;
  while ((match = boldNoColonRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }

  // 4. Plain text format: Conclusion: content
  const plainRegex = /(?:^|\n)\s*[-*]?\s*(?:Conclusion|Kesimpulan):\s*([^\n]+)/gi;
  while ((match = plainRegex.exec(content)) !== null) {
    if (match[1].trim()) list.push(match[1].trim());
  }

  if (isClosing) {
    list.push(`${sender} signaled READY TO CLOSE`);
  }

  return Array.from(new Set(list));
}

/**
 * Gathers and de-duplicates structured facts from a list of messages.
 */
export function extractFactsFromMessages(
  messages: Array<{ sender: string; content: string }>,
  registeredSlugs: string[]
): ExtractedFacts {
  const decisions: string[] = [];
  const flags: string[] = [];
  const parkingLot: string[] = [];
  const unresolved: string[] = [];
  const conclusions: string[] = [];

  for (const msg of messages) {
    const parsed = parseResponse(msg.content, registeredSlugs);
    decisions.push(...parsed.decisions);
    flags.push(...parsed.flags);
    parkingLot.push(...parsed.parkingLot);

    unresolved.push(...extractUnresolvedQuestions(msg.content));
    conclusions.push(...extractConclusions(msg.content, msg.sender, parsed.isClosing));
  }

  return {
    decisions: Array.from(new Set(decisions)),
    flags: Array.from(new Set(flags)),
    parkingLot: Array.from(new Set(parkingLot)),
    unresolved: Array.from(new Set(unresolved)),
    conclusions: Array.from(new Set(conclusions)),
  };
}

/**
 * Parses the structured facts section of a summary markdown.
 */
export function parseStructuredFacts(text: string): ExtractedFacts {
  const decisions: string[] = [];
  const flags: string[] = [];
  const parkingLot: string[] = [];
  const unresolved: string[] = [];
  const conclusions: string[] = [];

  let currentCategory: 'decisions' | 'flags' | 'parkingLot' | 'unresolved' | 'conclusions' | null = null;
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (lower.startsWith('decisions:')) {
      currentCategory = 'decisions';
    } else if (lower.startsWith('flags:')) {
      currentCategory = 'flags';
    } else if (lower.startsWith('parking lot:')) {
      currentCategory = 'parkingLot';
    } else if (lower.startsWith('unresolved questions:')) {
      currentCategory = 'unresolved';
    } else if (lower.startsWith('conclusions:')) {
      currentCategory = 'conclusions';
    } else if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
      const match = trimmed.match(/^[-*]\s*(.*)$/);
      const content = match ? match[1].trim() : '';
      if (content && currentCategory) {
        if (currentCategory === 'decisions') decisions.push(content);
        else if (currentCategory === 'flags') flags.push(content);
        else if (currentCategory === 'parkingLot') parkingLot.push(content);
        else if (currentCategory === 'unresolved') unresolved.push(content);
        else if (currentCategory === 'conclusions') conclusions.push(content);
      }
    }
  }

  return { decisions, flags, parkingLot, unresolved, conclusions };
}

/**
 * Extracts all structured facts from a legacy summary text without separators.
 */
export function extractFactsFromText(text: string, registeredSlugs: string[]): ExtractedFacts {
  const parsed = parseStructuredFacts(text);

  const inlineDecisions: string[] = [];
  let match;
  const decisionRegex = /\[DECISION:\s*([^\]\n]+)\]/gi;
  while ((match = decisionRegex.exec(text)) !== null) {
    if (match[1].trim()) inlineDecisions.push(match[1].trim());
  }
  const lineDecisionRegex = /(?:^|\n)\s*[-*]\s*\[DECISION\]\s*(.*?)(?=\n|$)/gi;
  while ((match = lineDecisionRegex.exec(text)) !== null) {
    if (match[1].trim()) inlineDecisions.push(match[1].trim());
  }

  const inlineFlags: string[] = [];
  const flagRegex = /\[FLAG:\s*([^\]\n]+)\]/gi;
  while ((match = flagRegex.exec(text)) !== null) {
    if (match[1].trim()) inlineFlags.push(match[1].trim());
  }

  const inlineParking: string[] = [];
  const parkingRegex = /\[PARKING[-_]LOT:\s*([^\]\n]+)\]/gi;
  while ((match = parkingRegex.exec(text)) !== null) {
    if (match[1].trim()) inlineParking.push(match[1].trim());
  }
  const lineParkingRegex = /(?:^|\n)\s*[-*]\s*\[PARKING\s*LOT\]\s*(.*?)(?=\n|$)/gi;
  while ((match = lineParkingRegex.exec(text)) !== null) {
    if (match[1].trim()) inlineParking.push(match[1].trim());
  }

  const unresolved = extractUnresolvedQuestions(text);
  const conclusions = extractConclusions(text, 'Legacy', false);

  return {
    decisions: Array.from(new Set([...parsed.decisions, ...inlineDecisions])),
    flags: Array.from(new Set([...parsed.flags, ...inlineFlags])),
    parkingLot: Array.from(new Set([...parsed.parkingLot, ...inlineParking])),
    unresolved: Array.from(new Set([...parsed.unresolved, ...unresolved])),
    conclusions: Array.from(new Set([...parsed.conclusions, ...conclusions])),
  };
}

/**
 * Binds extracted facts to prevent unbounded growth.
 * Limits each category to 50 most recent items and caps individual fact lengths to 500 characters.
 */
export function boundExtractedFacts(facts: ExtractedFacts): ExtractedFacts {
  const limitList = (list: string[]) =>
    list
      .map(item => item.length > 500 ? item.substring(0, 497) + '...' : item)
      .slice(-50);

  return {
    decisions: limitList(facts.decisions),
    flags: limitList(facts.flags),
    parkingLot: limitList(facts.parkingLot),
    unresolved: limitList(facts.unresolved),
    conclusions: limitList(facts.conclusions),
  };
}

/**
 * Formats extracted facts into markdown block.
 */
export function formatExtractedFacts(facts: ExtractedFacts): string {
  const lines: string[] = [];
  if (facts.decisions.length > 0) {
    lines.push(`Decisions:\n${facts.decisions.map(d => `  * ${d}`).join('\n')}`);
  }
  if (facts.flags.length > 0) {
    lines.push(`Flags:\n${facts.flags.map(f => `  * ${f}`).join('\n')}`);
  }
  if (facts.parkingLot.length > 0) {
    lines.push(`Parking Lot:\n${facts.parkingLot.map(p => `  * ${p}`).join('\n')}`);
  }
  if (facts.unresolved.length > 0) {
    lines.push(`Unresolved Questions:\n${facts.unresolved.map(u => `  * ${u}`).join('\n')}`);
  }
  if (facts.conclusions.length > 0) {
    lines.push(`Conclusions:\n${facts.conclusions.map(c => `  * ${c}`).join('\n')}`);
  }
  return lines.join('\n');
}

/**
 * Caps the narrative summary length by truncating oldest part (start of string) to preserve bounded context.
 */
export function enforceNarrativeLimit(narrative: string, maxChars = 5000): string {
  if (narrative.length > maxChars) {
    return '... [NARRATIVE TRUNCATED FROM START DUE TO SIZE LIMIT]\n' + narrative.substring(narrative.length - (maxChars - 60));
  }
  return narrative;
}

/**
 * Creates a deterministic fallback summary of messages when model generation fails or is skipped.
 */
export function createDeterministicSummary(
  messages: Array<{ sender: string; content: string }>,
  registeredSlugs: string[],
  previousSummary: string | null
): string {
  let previousNarrative = '';
  let oldFacts: ExtractedFacts = { decisions: [], flags: [], parkingLot: [], unresolved: [], conclusions: [] };

  if (previousSummary) {
    if (previousSummary.includes('### STRUCTURED FACTS')) {
      const parts = previousSummary.split('### STRUCTURED FACTS');
      previousNarrative = parts[0].trim();
      const oldStructuredPart = parts[1] || '';
      oldFacts = parseStructuredFacts(oldStructuredPart);
    } else {
      previousNarrative = previousSummary.trim();
      oldFacts = extractFactsFromText(previousSummary, registeredSlugs);
    }
  }

  const narrativeParts: string[] = [];
  if (previousNarrative) {
    narrativeParts.push(previousNarrative);
  }

  for (const msg of messages) {
    const excerpt = msg.content.length > 100 ? msg.content.substring(0, 97) + '...' : msg.content;
    narrativeParts.push(`- ${msg.sender} spoke: "${excerpt}"`);
  }

  const newNarrative = enforceNarrativeLimit(narrativeParts.join('\n'), 5000);

  const newFacts = extractFactsFromMessages(messages, registeredSlugs);

  const mergedFacts: ExtractedFacts = {
    decisions: Array.from(new Set([...oldFacts.decisions, ...newFacts.decisions])),
    flags: Array.from(new Set([...oldFacts.flags, ...newFacts.flags])),
    parkingLot: Array.from(new Set([...oldFacts.parkingLot, ...newFacts.parkingLot])),
    unresolved: Array.from(new Set([...oldFacts.unresolved, ...newFacts.unresolved])),
    conclusions: Array.from(new Set([...oldFacts.conclusions, ...newFacts.conclusions])),
  };

  const boundedFacts = boundExtractedFacts(mergedFacts);
  const formattedFacts = formatExtractedFacts(boundedFacts);

  let result = newNarrative;
  if (formattedFacts) {
    result += `\n\n### STRUCTURED FACTS\n${formattedFacts}`;
  }
  return result;
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

  const targetEndIndex = messages.length - 10;
  const startIndex = Math.max(2, summarizedMessageCount);

  if (startIndex >= targetEndIndex) {
    return null;
  }

  const messagesToSummarize = messages.slice(startIndex, targetEndIndex);

  let previousNarrative = '';
  let oldFacts: ExtractedFacts = { decisions: [], flags: [], parkingLot: [], unresolved: [], conclusions: [] };

  if (currentSummary) {
    if (currentSummary.includes('### STRUCTURED FACTS')) {
      const parts = currentSummary.split('### STRUCTURED FACTS');
      previousNarrative = parts[0].trim();
      const oldStructuredPart = parts[1] || '';
      oldFacts = parseStructuredFacts(oldStructuredPart);
    } else {
      previousNarrative = currentSummary.trim();
      oldFacts = extractFactsFromText(currentSummary, registeredSlugs);
    }
  }

  const newFacts = extractFactsFromMessages(messagesToSummarize, registeredSlugs);

  const mergedFacts: ExtractedFacts = {
    decisions: Array.from(new Set([...oldFacts.decisions, ...newFacts.decisions])),
    flags: Array.from(new Set([...oldFacts.flags, ...newFacts.flags])),
    parkingLot: Array.from(new Set([...oldFacts.parkingLot, ...newFacts.parkingLot])),
    unresolved: Array.from(new Set([...oldFacts.unresolved, ...newFacts.unresolved])),
    conclusions: Array.from(new Set([...oldFacts.conclusions, ...newFacts.conclusions])),
  };

  let newSummaryText = '';

  if (generateSummaryFn) {
    try {
      const textToSummarize = messagesToSummarize.map(m => `[${m.sender}]: ${m.content}`).join('\n\n');
      const prompt = `Write a concise narrative summary (max 4000 characters) of the discussion points below, integrating the previous summary context and the new messages. Do not list decisions, flags, or parking items as separate lists; focus on a coherent narrative of the progress and discussion.
Previous summary context:
${previousNarrative || 'None'}

New messages to summarize:
${textToSummarize}`;

      const generated = await generateSummaryFn(prompt);
      if (!generated || generated.trim() === '') {
        throw new Error('Model returned empty summary');
      }

      let modelNarrative = generated;
      let modelStructuredPart = '';
      if (generated.includes('### STRUCTURED FACTS')) {
        const parts = generated.split('### STRUCTURED FACTS');
        modelNarrative = parts[0].trim();
        modelStructuredPart = parts[1] || '';
      }

      const modelFacts = parseStructuredFacts(modelStructuredPart);
      const fullyMergedFacts: ExtractedFacts = {
        decisions: Array.from(new Set([...mergedFacts.decisions, ...modelFacts.decisions])),
        flags: Array.from(new Set([...mergedFacts.flags, ...modelFacts.flags])),
        parkingLot: Array.from(new Set([...mergedFacts.parkingLot, ...modelFacts.parkingLot])),
        unresolved: Array.from(new Set([...mergedFacts.unresolved, ...modelFacts.unresolved])),
        conclusions: Array.from(new Set([...mergedFacts.conclusions, ...modelFacts.conclusions])),
      };

      const boundedFacts = boundExtractedFacts(fullyMergedFacts);
      const formattedFacts = formatExtractedFacts(boundedFacts);
      const limitedNarrative = enforceNarrativeLimit(modelNarrative, 5000);

      newSummaryText = limitedNarrative;
      if (formattedFacts) {
        newSummaryText += `\n\n### STRUCTURED FACTS\n${formattedFacts}`;
      }
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
