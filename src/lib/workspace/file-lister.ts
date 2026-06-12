import fs from 'fs';
import path from 'path';
import { isIgnored } from './ignore-filter';

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
  const targetDir = path.join(rootPath, relativePath);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory does not exist: ${relativePath}`);
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${relativePath}`);
  }

  const items = fs.readdirSync(targetDir);
  const result: FileEntry[] = [];

  for (const item of items) {
    // Ensure relative path is clean and normalized
    const cleanRelativePath = relativePath
      ? path.join(relativePath, item).replace(/\\/g, '/')
      : item;

    if (isIgnored(cleanRelativePath, ignoreRules)) {
      continue;
    }

    try {
      const itemFullPath = path.join(rootPath, cleanRelativePath);
      const itemStat = fs.statSync(itemFullPath);
      const isDir = itemStat.isDirectory();

      let childrenCount = 0;
      if (isDir) {
        try {
          childrenCount = fs.readdirSync(itemFullPath).filter((child) => {
            const childRelative = path.join(cleanRelativePath, child).replace(/\\/g, '/');
            return !isIgnored(childRelative, ignoreRules);
          }).length;
        } catch {
          childrenCount = 0;
        }
      }

      result.push({
        name: item,
        path: cleanRelativePath,
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
