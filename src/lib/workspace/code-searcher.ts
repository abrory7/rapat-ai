import fs from 'fs';
import path from 'path';
import { isIgnored } from './ignore-filter';

export interface SearchMatch {
  file: string;
  lineNumber: number;
  lineContent: string;
}

const MAX_SEARCH_RESULTS = 50;
const BINARY_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.mp3',
  '.mp4',
  '.db',
  '.sqlite',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.woff',
  '.woff2',
];

/**
 * Recursively searches for a substring query in repository files, subject to ignore filters.
 */
export function searchCode(
  rootPath: string,
  query: string,
  ignoreRules: string[] = []
): SearchMatch[] {
  if (!query || query.trim().length === 0) return [];
  const lowercaseQuery = query.toLowerCase();
  const results: SearchMatch[] = [];

  function traverse(dirPath: string) {
    if (results.length >= MAX_SEARCH_RESULTS) return;

    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (results.length >= MAX_SEARCH_RESULTS) return;

        const fullPath = path.join(dirPath, file);
        const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

        if (isIgnored(relativePath, ignoreRules)) {
          continue;
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (stat.isFile()) {
          const ext = path.extname(file).toLowerCase();
          // Skip binaries and files over 200KB for search
          if (BINARY_EXTENSIONS.includes(ext) || stat.size > 200 * 1024) {
            continue;
          }

          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.toLowerCase().includes(lowercaseQuery)) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(lowercaseQuery)) {
                results.push({
                  file: relativePath,
                  lineNumber: i + 1,
                  lineContent: lines[i].trim(),
                });
                if (results.length >= MAX_SEARCH_RESULTS) return;
              }
            }
          }
        }
      }
    } catch {
      return;
    }
  }

  traverse(rootPath);
  return results;
}
