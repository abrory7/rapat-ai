/**
 * Parses ignore rules from a newline-separated string.
 * Skips comments (#) and empty lines.
 */
export function parseIgnoreRules(rulesString?: string | null): string[] {
  if (!rulesString) return [];
  return rulesString
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/**
 * Checks if a given file path is ignored based on gitignore-like rules.
 */
export function isIgnored(filePath: string, rules: string[]): boolean {
  // Always ignore version control, dependencies, and outputs
  const defaultIgnores = ['.git', 'node_modules', '.next', '.rapat-ai', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');

  if (parts.some((part) => defaultIgnores.includes(part))) {
    return true;
  }

  for (const rule of rules) {
    let cleanRule = rule.trim();
    if (!cleanRule) continue;
    
    const isDirOnly = cleanRule.endsWith('/');
    if (isDirOnly) {
      cleanRule = cleanRule.slice(0, -1);
    }

    // Convert wildcards: * -> .*, ? -> .
    let regexStr = cleanRule
      .replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&') // escape regex chars
      .replace(/\\\*/g, '.*')                  // match any characters for *
      .replace(/\\\?/g, '.');                  // match single character for ?

    if (cleanRule.includes('/')) {
      if (cleanRule.startsWith('/')) {
        regexStr = '^' + regexStr.substring(2);
      } else {
        regexStr = '^' + regexStr;
      }
    } else {
      regexStr = '(^|\\/)' + regexStr + '($|\\/)';
    }

    try {
      const regex = new RegExp(regexStr);
      if (regex.test(normalizedPath)) {
        return true;
      }
    } catch (e) {
      // Ignore invalid regex patterns from bad rules
      console.warn(`Invalid ignore rule regex pattern: ${regexStr}`, e);
    }
  }

  return false;
}
