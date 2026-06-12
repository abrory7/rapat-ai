interface Message {
  sender: string;
  content: string;
}

export interface RoleIdentity {
  name: string;
  slug: string;
}

/**
 * Computes which roles are currently closed based on their latest message contents.
 * Accepts role identity objects so sender can be matched by either name or slug.
 */
export function getClosedRoles(messages: Message[], roles: RoleIdentity[]): Set<string> {
  const closed = new Set<string>();
  const latestMessagePerRole = new Map<string, string>();

  // Build lookup: both slug and name (case-insensitive) -> canonical slug
  const senderToSlug = new Map<string, string>();
  for (const role of roles) {
    senderToSlug.set(role.slug.toLowerCase().trim(), role.slug);
    senderToSlug.set(role.name.toLowerCase().trim(), role.slug);
  }

  // Extract the last message from each role, resolving sender to canonical slug
  for (const msg of messages) {
    const senderKey = msg.sender.toLowerCase().trim();
    const canonicalSlug = senderToSlug.get(senderKey);
    if (canonicalSlug) {
      latestMessagePerRole.set(canonicalSlug, msg.content);
    }
  }

  // Check if latest message contains the [READY TO CLOSE] signal
  for (const [slug, content] of latestMessagePerRole.entries()) {
    if (/\[READY TO CLOSE\]/i.test(content)) {
      closed.add(slug);
    }
  }

  return closed;
}

interface TransitionInput {
  defaultFlow: string[];
  currentRoleSlug: string | null;
  currentRound: number;
  maxRounds: number;
  closedRoles: Set<string>;
  delegateToSlug?: string;
  needsMoreRound?: boolean;
}

interface TransitionResult {
  nextRoleSlug: string | null;
  nextRound: number;
  shouldCompile: boolean;
}

/**
 * Evaluates the next role and round transitions according to default flow,
 * explicit delegations, round limits, closures, and extra-round requests.
 */
export function getNextRoleAndRound({
  defaultFlow,
  currentRoleSlug,
  currentRound,
  maxRounds,
  closedRoles,
  delegateToSlug,
  needsMoreRound = false,
}: TransitionInput): TransitionResult {
  // If all roles in the template are closed, compile immediately
  if (defaultFlow.every((slug) => closedRoles.has(slug))) {
    return { nextRoleSlug: null, nextRound: currentRound, shouldCompile: true };
  }

  // 1. If explicit delegation to a different open registered role, route to them
  if (
    delegateToSlug &&
    delegateToSlug !== currentRoleSlug &&
    defaultFlow.includes(delegateToSlug) &&
    !closedRoles.has(delegateToSlug)
  ) {
    return { nextRoleSlug: delegateToSlug, nextRound: currentRound, shouldCompile: false };
  }

  // 2. Find next open role index in defaultFlow
  let currentIndex = -1;
  if (currentRoleSlug) {
    currentIndex = defaultFlow.indexOf(currentRoleSlug);
  }

  let nextIndex = (currentIndex + 1) % defaultFlow.length;
  let stepsChecked = 0;
  let round = currentRound;

  while (stepsChecked < defaultFlow.length * 2) {
    const candidate = defaultFlow[nextIndex];

    // Wrap-around increments round
    if (nextIndex === 0 && currentIndex !== -1) {
      round += 1;
    }

    // Exceeded max rounds: only allow if needsMoreRound and still within the one bounded extra round
    if (round > maxRounds) {
      if (!needsMoreRound || round > maxRounds + 1) {
        return { nextRoleSlug: null, nextRound: currentRound, shouldCompile: true };
      }
    }

    if (!closedRoles.has(candidate)) {
      return { nextRoleSlug: candidate, nextRound: round, shouldCompile: false };
    }

    currentIndex = nextIndex;
    nextIndex = (nextIndex + 1) % defaultFlow.length;
    stepsChecked++;
  }

  return { nextRoleSlug: null, nextRound: currentRound, shouldCompile: true };
}
