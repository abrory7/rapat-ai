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

export const SUMMARY_PROMPT_MAX_CHARS = 12000;
const SUMMARY_OMISSION_MARKER = '[... SUMMARY CONTENT OMITTED DUE TO SIZE LIMIT ...]';
const STRUCTURED_FACTS_SEPARATOR = '### STRUCTURED FACTS';

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

function parseLegacyStructuredFacts(text: string): ExtractedFacts {
  const facts: ExtractedFacts = {
    decisions: [],
    flags: [],
    parkingLot: [],
    unresolved: [],
    conclusions: [],
  };
  let currentCategory: keyof ExtractedFacts | null = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indentation = line.length - line.trimStart().length;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('decisions:')) {
      currentCategory = 'decisions';
      continue;
    }
    if (lower.startsWith('flags:')) {
      currentCategory = 'flags';
      continue;
    }
    if (lower.startsWith('parking lot:')) {
      currentCategory = 'parkingLot';
      continue;
    }
    if (lower.startsWith('unresolved questions:')) {
      currentCategory = 'unresolved';
      continue;
    }
    if (lower.startsWith('role conclusions:') || lower.startsWith('conclusions:')) {
      currentCategory = 'conclusions';
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s*(.*)$/);
    if (bulletMatch && indentation > 0 && currentCategory) {
      const content = bulletMatch[1].trim();
      if (content) facts[currentCategory].push(content);
      continue;
    }

    if (indentation === 0) {
      currentCategory = null;
    }
  }

  return facts;
}

/**
 * Extracts all structured facts from a legacy summary text without separators.
 */
export function extractFactsFromText(text: string): ExtractedFacts {
  const parsed = parseLegacyStructuredFacts(text);

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

function splitSummary(summary: string): { narrative: string; structuredPart: string } {
  const separatorIndex = summary.indexOf(STRUCTURED_FACTS_SEPARATOR);
  if (separatorIndex === -1) {
    return { narrative: summary.trim(), structuredPart: '' };
  }

  return {
    narrative: summary.slice(0, separatorIndex).trim(),
    structuredPart: summary.slice(separatorIndex + STRUCTURED_FACTS_SEPARATOR.length).trim(),
  };
}

function projectTextTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= SUMMARY_OMISSION_MARKER.length + 1) {
    return SUMMARY_OMISSION_MARKER.slice(0, maxChars);
  }
  const contentLength = maxChars - SUMMARY_OMISSION_MARKER.length - 1;
  return `${SUMMARY_OMISSION_MARKER}\n${text.slice(-contentLength)}`;
}

/**
 * Creates a bounded prompt-only view of a durable summary.
 */
export function projectSummaryForPrompt(
  summary: string,
  maxChars = SUMMARY_PROMPT_MAX_CHARS
): string {
  if (!summary || summary.length <= maxChars) return summary;
  if (maxChars <= 0) return '';

  const { narrative, structuredPart } = splitSummary(summary);
  if (!structuredPart) {
    return projectTextTail(narrative, maxChars);
  }

  const narrativeBudget = Math.min(4000, Math.floor(maxChars / 3));
  const projectedNarrative = narrative.length > narrativeBudget
    ? narrative.slice(-narrativeBudget)
    : narrative;
  const facts = parseStructuredFacts(structuredPart);
  const selected: ExtractedFacts = {
    decisions: [],
    flags: [],
    parkingLot: [],
    unresolved: [],
    conclusions: [],
  };
  const categories: Array<keyof ExtractedFacts> = [
    'decisions',
    'flags',
    'parkingLot',
    'unresolved',
    'conclusions',
  ];
  const positions = Object.fromEntries(
    categories.map((category) => [category, facts[category].length - 1])
  ) as Record<keyof ExtractedFacts, number>;

  const render = () => {
    const parts = [SUMMARY_OMISSION_MARKER];
    if (projectedNarrative) parts.push(projectedNarrative);
    const formattedFacts = formatExtractedFacts(selected);
    if (formattedFacts) parts.push(`${STRUCTURED_FACTS_SEPARATOR}\n${formattedFacts}`);
    return parts.join('\n\n');
  };

  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (const category of categories) {
      const position = positions[category];
      if (position < 0) continue;

      const original = facts[category][position];
      const projected = original.length > 1000
        ? `${original.slice(0, 997)}...`
        : original;
      selected[category].unshift(projected);

      if (render().length <= maxChars) {
        positions[category] -= 1;
        madeProgress = true;
      } else {
        selected[category].shift();
        positions[category] = -1;
      }
    }
  }

  return render().slice(0, maxChars);
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
    if (previousSummary.includes(STRUCTURED_FACTS_SEPARATOR)) {
      const { narrative, structuredPart: oldStructuredPart } = splitSummary(previousSummary);
      previousNarrative = narrative;
      oldFacts = parseStructuredFacts(oldStructuredPart);
    } else {
      previousNarrative = previousSummary.trim();
      oldFacts = extractFactsFromText(previousSummary);
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

  const formattedFacts = formatExtractedFacts(mergedFacts);

  let result = newNarrative;
  if (formattedFacts) {
    result += `\n\n${STRUCTURED_FACTS_SEPARATOR}\n${formattedFacts}`;
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
    if (currentSummary.includes(STRUCTURED_FACTS_SEPARATOR)) {
      const { narrative, structuredPart: oldStructuredPart } = splitSummary(currentSummary);
      previousNarrative = narrative;
      oldFacts = parseStructuredFacts(oldStructuredPart);
    } else {
      previousNarrative = currentSummary.trim();
      oldFacts = extractFactsFromText(currentSummary);
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
      if (generated.includes(STRUCTURED_FACTS_SEPARATOR)) {
        const generatedParts = splitSummary(generated);
        modelNarrative = generatedParts.narrative;
        modelStructuredPart = generatedParts.structuredPart;
      }

      const modelFacts = parseStructuredFacts(modelStructuredPart);
      const fullyMergedFacts: ExtractedFacts = {
        decisions: Array.from(new Set([...mergedFacts.decisions, ...modelFacts.decisions])),
        flags: Array.from(new Set([...mergedFacts.flags, ...modelFacts.flags])),
        parkingLot: Array.from(new Set([...mergedFacts.parkingLot, ...modelFacts.parkingLot])),
        unresolved: Array.from(new Set([...mergedFacts.unresolved, ...modelFacts.unresolved])),
        conclusions: Array.from(new Set([...mergedFacts.conclusions, ...modelFacts.conclusions])),
      };

      const formattedFacts = formatExtractedFacts(fullyMergedFacts);
      const limitedNarrative = enforceNarrativeLimit(modelNarrative, 5000);

      newSummaryText = limitedNarrative;
      if (formattedFacts) {
        newSummaryText += `\n\n${STRUCTURED_FACTS_SEPARATOR}\n${formattedFacts}`;
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
