import fs from 'fs';
import path from 'path';
import { isIgnored } from './ignore-filter';
import { resolveWorkspacePath } from './path-policy';

export interface FileEntry {
  name: string;
  path: string; // Relative path from rootPath
  type: 'file' | 'dir';
  size: number;
  childrenCount?: number;
}

/**
 * Lists the contents of a directory, filtered by ignore rules.
 */
export function listFiles(
  rootPath: string,
  relativePath: string = '',
  ignoreRules: string[] = []
): FileEntry[] {
  const resolved = resolveWorkspacePath(rootPath, relativePath, { mustExist: true });

  const stat = fs.statSync(resolved.absolutePath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${relativePath}`);
  }

  const items = fs.readdirSync(resolved.absolutePath);
  const result: FileEntry[] = [];

  for (const item of items) {
    // Ensure relative path is clean and normalized
    const cleanRelativePath = resolved.relativePath
      ? path.join(resolved.relativePath, item).replace(/\\/g, '/')
      : item;

    if (isIgnored(cleanRelativePath, ignoreRules, rootPath)) {
      continue;
    }

    try {
      const resolvedItem = resolveWorkspacePath(rootPath, cleanRelativePath, { mustExist: true });
      const itemStat = fs.statSync(resolvedItem.absolutePath);
      const isDir = itemStat.isDirectory();

      let childrenCount = 0;
      if (isDir) {
        try {
          childrenCount = fs.readdirSync(resolvedItem.absolutePath).filter((child) => {
            const childRelative = path.join(resolvedItem.relativePath, child).replace(/\\/g, '/');
            return !isIgnored(childRelative, ignoreRules, rootPath);
          }).length;
        } catch {
          childrenCount = 0;
        }
      }

      result.push({
        name: item,
        path: resolvedItem.relativePath,
        type: isDir ? 'dir' : 'file',
        size: isDir ? 0 : itemStat.size,
        childrenCount: isDir ? childrenCount : undefined,
      });
    } catch {
      continue;
    }
  }

  return result.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'dir' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
