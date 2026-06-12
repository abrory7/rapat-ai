interface ParsedResponse {
  delegateTo?: string;
  flags: string[];
  isClosing: boolean;
  isNeedsMoreRound: boolean;
  decisions: string[];
  parkingLot: string[];
}

/**
 * Parses AI responses to detect structured control signals and metadata.
 */
export function parseResponse(content: string, registeredSlugs: string[]): ParsedResponse {
  const flags: string[] = [];
  const decisions: string[] = [];
  const parkingLot: string[] = [];
  
  // 1. Detect @SLUG mentions (strict exact match against registered slugs)
  let delegateTo: string | undefined;
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    const slug = match[1].toLowerCase().trim();
    if (registeredSlugs.includes(slug)) {
      delegateTo = slug;
      break; // Stop at first valid mention
    }
  }

  // 2. Detect [FLAG: ...] patterns
  const flagRegex = /\[FLAG:\s*(.*?)\]/gi;
  while ((match = flagRegex.exec(content)) !== null) {
    if (match[1].trim()) {
      flags.push(match[1].trim());
    }
  }

  // 3. Detect [READY TO CLOSE] signal
  const isClosing = /\[READY TO CLOSE\]/i.test(content);

  // 4. Detect [NEEDS ONE MORE ROUND] signal
  const isNeedsMoreRound = /\[NEEDS ONE MORE ROUND\]/i.test(content);

  // 5. Extract [DECISION: ...] decisions and line decisions
  const decisionRegex = /\[DECISION:\s*(.*?)\]/gi;
  while ((match = decisionRegex.exec(content)) !== null) {
    if (match[1].trim()) {
      decisions.push(match[1].trim());
    }
  }
  
  // Also support line format: "- [DECISION] item"
  const lineDecisionRegex = /(?:^|\n)\s*[-*]\s*\[DECISION\]\s*(.*?)(?=\n|$)/gi;
  while ((match = lineDecisionRegex.exec(content)) !== null) {
    if (match[1].trim()) {
      decisions.push(match[1].trim());
    }
  }

  // 6. Extract [PARKING_LOT: ...] or [PARKING LOT: ...] items
  const parkingLotRegex = /\[PARKING[-_]LOT:\s*(.*?)\]/gi;
  while ((match = parkingLotRegex.exec(content)) !== null) {
    if (match[1].trim()) {
      parkingLot.push(match[1].trim());
    }
  }
  
  // Also support line format: "- [PARKING LOT] item"
  const lineParkingRegex = /(?:^|\n)\s*[-*]\s*\[PARKING\s*LOT\]\s*(.*?)(?=\n|$)/gi;
  while ((match = lineParkingRegex.exec(content)) !== null) {
    if (match[1].trim()) {
      parkingLot.push(match[1].trim());
    }
  }

  return {
    delegateTo,
    flags,
    isClosing,
    isNeedsMoreRound,
    decisions: Array.from(new Set(decisions)), // De-duplicate
    parkingLot: Array.from(new Set(parkingLot)), // De-duplicate
  };
}

export default parseResponse;
