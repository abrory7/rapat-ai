import fs from 'fs';
import { isIgnored } from './ignore-filter';
import { resolveWorkspacePath } from './path-policy';

const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100 KB limit

/**
 * Reads the content of a file from the repository, checking ignore rules and size limits.
 */
export function readFile(
  rootPath: string,
  filePath: string,
  ignoreRules: string[] = []
): string {
  const resolved = resolveWorkspacePath(rootPath, filePath, { mustExist: true });

  if (isIgnored(resolved.relativePath, ignoreRules, rootPath)) {
    throw new Error(`Access Denied: File is ignored or restricted: ${resolved.relativePath}`);
  }

  const stat = fs.statSync(resolved.absolutePath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${filePath}`);
  }

  if (stat.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File is too large (${Math.round(stat.size / 1024)}KB). Limit is ${MAX_FILE_SIZE_BYTES / 1024}KB.`
    );
  }

  return fs.readFileSync(resolved.absolutePath, 'utf8');
}
