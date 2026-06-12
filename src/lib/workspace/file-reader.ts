import fs from 'fs';
import path from 'path';
import { isIgnored } from './ignore-filter';

const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100 KB limit

/**
 * Reads the content of a file from the repository, checking ignore rules and size limits.
 */
export function readFile(
  rootPath: string,
  filePath: string,
  ignoreRules: string[] = []
): string {
  const safeRelativePath = path
    .normalize(filePath)
    .replace(/^(\.\.(\/|\\))+/, '')
    .replace(/\\/g, '/');

  if (isIgnored(safeRelativePath, ignoreRules)) {
    throw new Error(`Access Denied: File is ignored or restricted: ${safeRelativePath}`);
  }

  const fullPath = path.join(rootPath, safeRelativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${filePath}`);
  }

  if (stat.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File is too large (${Math.round(stat.size / 1024)}KB). Limit is ${MAX_FILE_SIZE_BYTES / 1024}KB.`
    );
  }

  return fs.readFileSync(fullPath, 'utf8');
}
