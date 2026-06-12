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
  '*-wal',
  '*-shm',
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  '.rapat-ai',
];

/**
 * Parses ignore rules from a newline-separated string.
 * The output is passed directly to the 'ignore' library which natively handles
 * gitignore semantics including comments, empty lines, and trailing spaces.
 */
export function parseIgnoreRules(rulesString?: string | null): string[] {
  if (!rulesString) return [];
  // Split by newline but DO NOT trim, as gitignore semantics rely on exact matches
  // (e.g. trailing spaces, escaped spaces). The 'ignore' library handles comments natively.
  return rulesString.split(/\r?\n/);
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
