import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { searchCode } from './code-searcher';

describe('code-searcher', () => {
  let tempDir: string;
  let workspaceRoot: string;
  let symlinksSupported = true;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapat-ai-search-test-'));
    workspaceRoot = path.join(tempDir, 'workspace');
    fs.mkdirSync(workspaceRoot);

    // Create subfolders
    fs.mkdirSync(path.join(workspaceRoot, 'dir1'));
    fs.mkdirSync(path.join(workspaceRoot, 'dir2'));

    // Create valid files
    fs.writeFileSync(path.join(workspaceRoot, 'dir1', 'file1.txt'), 'contains query_term here');
    fs.writeFileSync(path.join(workspaceRoot, 'dir2', 'file2.txt'), 'contains query_term too');

    // Create outside file
    fs.writeFileSync(path.join(tempDir, 'outside.txt'), 'contains query_term outside');

    // Create symlinks
    try {
      // 1. Unsafe symlink pointing outside (should be ignored/skipped by searchCode)
      fs.symlinkSync(path.join(tempDir, 'outside.txt'), path.join(workspaceRoot, 'dir1', 'unsafe-symlink.txt'));
      
      // 2. Symlink cycle (should not cause infinite loop)
      fs.symlinkSync(workspaceRoot, path.join(workspaceRoot, 'dir2', 'cycle-link'));
    } catch {
      symlinksSupported = false;
    }
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('searches for patterns in valid files', () => {
    const matches = searchCode(workspaceRoot, 'query_term');
    const files = matches.map((m) => m.file);
    assert.ok(files.includes('dir1/file1.txt'));
    assert.ok(files.includes('dir2/file2.txt'));
  });

  it('continues search even if a directory contains a symlink pointing outside (per-entry continuation)', (t) => {
    if (!symlinksSupported) {
      t.skip('Symlinks not supported by host OS');
      return;
    }

    const matches = searchCode(workspaceRoot, 'query_term');
    const files = matches.map((m) => m.file);

    // Should NOT include the outside file/unsafe-symlink
    assert.equal(files.includes('dir1/unsafe-symlink.txt'), false);
    // Should still successfully find file2.txt
    assert.ok(files.includes('dir2/file2.txt'));
  });

  it('avoids infinite loops and duplicates from symlink cycles', (t) => {
    if (!symlinksSupported) {
      t.skip('Symlinks not supported by host OS');
      return;
    }

    const matches = searchCode(workspaceRoot, 'query_term');
    const files = matches.map((m) => m.file);

    // Count appearances of file1.txt
    const appearances = files.filter((f) => f === 'dir1/file1.txt').length;
    assert.equal(appearances, 1);
  });
});
