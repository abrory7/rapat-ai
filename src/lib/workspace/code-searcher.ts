import fs from 'fs';
import path from 'path';
import { isIgnored } from './ignore-filter';
import { resolveWorkspacePath } from './path-policy';

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

  const resolvedRoot = resolveWorkspacePath(rootPath, '');
  const visitedDirs = new Set<string>();

  function traverse(dirPath: string) {
    if (results.length >= MAX_SEARCH_RESULTS) return;

    let resolvedDir;
    try {
      resolvedDir = resolveWorkspacePath(rootPath, path.relative(resolvedRoot.absolutePath, dirPath));
    } catch {
      return;
    }

    const dirRealPath = resolvedDir.absolutePath;
    if (visitedDirs.has(dirRealPath)) {
      return;
    }
    visitedDirs.add(dirRealPath);

    let files;
    try {
      files = fs.readdirSync(resolvedDir.absolutePath);
    } catch {
      return;
    }

    for (const file of files) {
      if (results.length >= MAX_SEARCH_RESULTS) return;

      try {
        const fullPath = path.join(resolvedDir.absolutePath, file);
        const relativePath = path.relative(resolvedRoot.absolutePath, fullPath).replace(/\\/g, '/');

        if (isIgnored(relativePath, ignoreRules, rootPath)) {
          continue;
        }

        const resolvedFile = resolveWorkspacePath(rootPath, relativePath, { mustExist: true });
        const stat = fs.statSync(resolvedFile.absolutePath);
        if (stat.isDirectory()) {
          traverse(resolvedFile.absolutePath);
        } else if (stat.isFile()) {
          const ext = path.extname(file).toLowerCase();
          // Skip binaries and files over 200KB for search
          if (BINARY_EXTENSIONS.includes(ext) || stat.size > 200 * 1024) {
            continue;
          }

          const content = fs.readFileSync(resolvedFile.absolutePath, 'utf8');
          if (content.toLowerCase().includes(lowercaseQuery)) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(lowercaseQuery)) {
                results.push({
                  file: resolvedFile.relativePath,
                  lineNumber: i + 1,
                  lineContent: lines[i].trim(),
                });
                if (results.length >= MAX_SEARCH_RESULTS) return;
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
  }

  traverse(resolvedRoot.absolutePath);
  return results;
}
