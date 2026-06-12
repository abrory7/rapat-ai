import path from 'path';
import fs from 'fs';

export interface ResolvedWorkspacePath {
  rootRealPath: string;
  relativePath: string;
  absolutePath: string;
}

export function resolveWorkspacePath(
  rootPath: string,
  requestedPath: string,
  options?: { mustExist?: boolean },
): ResolvedWorkspacePath {
  // Reject absolute paths
  if (path.isAbsolute(requestedPath)) {
    throw new Error('Access Denied');
  }

  if (requestedPath.includes('\0')) {
    throw new Error('Access Denied');
  }

  let rootRealPath: string;
  try {
    rootRealPath = fs.realpathSync(rootPath);
  } catch {
    throw new Error('Access Denied');
  }

  // Determine base absolute path
  let resolvedAbsolutePath = path.resolve(rootRealPath, requestedPath);

  // Manually follow symlinks (including dangling symlinks) to verify their real targets
  const visitedSymlinks = new Set<string>();
  while (true) {
    let isSym = false;
    try {
      isSym = fs.lstatSync(resolvedAbsolutePath).isSymbolicLink();
    } catch {
      // Path component does not exist, break symlink resolution
      break;
    }

    if (!isSym) {
      break;
    }

    if (visitedSymlinks.has(resolvedAbsolutePath)) {
      throw new Error('Access Denied'); // Symlink loop
    }
    visitedSymlinks.add(resolvedAbsolutePath);

    try {
      const target = fs.readlinkSync(resolvedAbsolutePath);
      resolvedAbsolutePath = path.resolve(path.dirname(resolvedAbsolutePath), target);
    } catch {
      throw new Error('Access Denied');
    }
  }

  // Check if exists
  const exists = fs.existsSync(resolvedAbsolutePath);
  if (options?.mustExist && !exists) {
    throw new Error(`File not found: ${requestedPath}`);
  }

  if (exists) {
    try {
      resolvedAbsolutePath = fs.realpathSync(resolvedAbsolutePath);
    } catch {
      throw new Error('Access Denied');
    }
  } else {
    // If not exists, resolve symlinks in the existing ancestor path
    let current = resolvedAbsolutePath;
    let suffix = '';
    while (current && !fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) break;
      suffix = path.join(path.basename(current), suffix);
      current = parent;
    }
    if (fs.existsSync(current)) {
      try {
        const realCurrent = fs.realpathSync(current);
        resolvedAbsolutePath = path.resolve(realCurrent, suffix);
      } catch {
        throw new Error('Access Denied');
      }
    }
  }

  // Reject unless it equals rootRealPath or starts with rootRealPath + path.sep
  const isInside =
    resolvedAbsolutePath === rootRealPath ||
    resolvedAbsolutePath.startsWith(rootRealPath + path.sep);

  if (!isInside) {
    throw new Error('Access Denied');
  }

  const relativePath = path.relative(rootRealPath, resolvedAbsolutePath).replace(/\\/g, '/');

  return {
    rootRealPath,
    relativePath,
    absolutePath: resolvedAbsolutePath,
  };
}
