import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

const PERMANENT_EXCLUSIONS = [
  '.git',
  '.env',
  '.env.*',
  '.secret',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.db',
  '*.sqlite',
  '*-journal',
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  '.rapat-ai',
];

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
export function isIgnored(filePath: string, rules: string[], rootPath?: string): boolean {
  // Normalize path separators to forward slashes for matching
  const normalizedPath = filePath.replace(/\\/g, '/');

  // 1. Enforce permanent exclusions first (immutable and non-negatable)
  const permIgnore = ignore().add(PERMANENT_EXCLUSIONS);
  if (permIgnore.ignores(normalizedPath)) {
    return true;
  }

  // 2. Load and parse .gitignore from rootPath if available
  const mergedRules = [...rules];
  if (rootPath) {
    const gitignorePath = path.join(rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const parsed = parseIgnoreRules(content);
        mergedRules.push(...parsed);
      } catch {
        // Ignore read errors
      }
    }
  }

  // 3. Match against combined custom project rules and .gitignore
  if (mergedRules.length > 0) {
    const customIgnore = ignore().add(mergedRules);
    return customIgnore.ignores(normalizedPath);
  }

  return false;
}
