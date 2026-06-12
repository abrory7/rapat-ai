import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveWorkspacePath } from './path-policy';

describe('resolveWorkspacePath', () => {
  let tempDir: string;
  let workspaceRoot: string;

  before(() => {
    // Create a temporary workspace root
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapat-ai-test-'));
    workspaceRoot = path.join(tempDir, 'workspace');
    fs.mkdirSync(workspaceRoot);

    // Create some test files/folders inside the workspace root
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'app.ts'), 'console.log("hello");');
    fs.mkdirSync(path.join(workspaceRoot, 'dist'));

    // Create a file outside the workspace root
    fs.writeFileSync(path.join(tempDir, 'outside.txt'), 'secret outside');

    // Create symlinks (only if supported by the OS/environment)
    try {
      // Symlink resolving outside the workspace
      fs.symlinkSync(path.join(tempDir, 'outside.txt'), path.join(workspaceRoot, 'unsafe-symlink'));
      // Symlink resolving inside the workspace
      fs.symlinkSync(path.join(workspaceRoot, 'src', 'app.ts'), path.join(workspaceRoot, 'safe-symlink'));
      // Dangling symlink resolving outside the workspace
      fs.symlinkSync(path.join(tempDir, 'non-existent-outside.txt'), path.join(workspaceRoot, 'dangling-unsafe-symlink'));
      // Dangling symlink resolving inside the workspace
      fs.symlinkSync(path.join(workspaceRoot, 'non-existent-inside.txt'), path.join(workspaceRoot, 'dangling-safe-symlink'));
    } catch (err) {
      console.warn('Symlink creation not fully supported in this environment, skipping symlink tests:', err);
    }
  });

  after(() => {
    // Clean up temporary workspace
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Failed to clean up temp dir:', err);
    }
  });

  it('resolves relative paths inside the registered root', () => {
    const result = resolveWorkspacePath(workspaceRoot, 'src/app.ts');
    assert.equal(result.rootRealPath, fs.realpathSync(workspaceRoot));
    assert.equal(result.relativePath, 'src/app.ts');
    assert.equal(result.absolutePath, path.join(fs.realpathSync(workspaceRoot), 'src/app.ts'));
  });

  it('rejects absolute paths inside the registered root', () => {
    const absPath = path.join(fs.realpathSync(workspaceRoot), 'src/app.ts');
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, absPath);
    }, /Access Denied/);
  });

  it('rejects absolute paths outside the registered root', () => {
    const absPath = path.join(tempDir, 'outside.txt');
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, absPath);
    }, /Access Denied/);
  });

  it('rejects .. traversal at the beginning of a path', () => {
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, '../outside.txt');
    }, /Access Denied/);
  });

  it('rejects .. traversal in the middle of a path', () => {
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, 'src/../dist/../../outside.txt');
    }, /Access Denied/);
  });

  it('rejects null bytes in the path', () => {
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, 'src/app.ts\0.txt');
    }, /Access Denied/);
  });

  it('rejects a symlink resolving outside the workspace', () => {
    const symlinkPath = path.join(workspaceRoot, 'unsafe-symlink');
    if (fs.existsSync(symlinkPath)) {
      assert.throws(() => {
        resolveWorkspacePath(workspaceRoot, 'unsafe-symlink', { mustExist: true });
      }, /Access Denied/);
    }
  });

  it('rejects a dangling symlink resolving outside the workspace', () => {
    const symlinkPath = path.join(workspaceRoot, 'dangling-unsafe-symlink');
    try {
      if (fs.lstatSync(symlinkPath).isSymbolicLink()) {
        assert.throws(() => {
          resolveWorkspacePath(workspaceRoot, 'dangling-unsafe-symlink');
        }, /Access Denied/);
      }
    } catch {}
  });

  it('resolves a dangling symlink resolving inside the workspace (when mustExist is false)', () => {
    const symlinkPath = path.join(workspaceRoot, 'dangling-safe-symlink');
    try {
      if (fs.lstatSync(symlinkPath).isSymbolicLink()) {
        const result = resolveWorkspacePath(workspaceRoot, 'dangling-safe-symlink', { mustExist: false });
        assert.equal(result.relativePath, 'non-existent-inside.txt');
      }
    } catch {}
  });

  it('resolves a symlink resolving to another location inside the workspace', () => {
    const symlinkPath = path.join(workspaceRoot, 'safe-symlink');
    if (fs.existsSync(symlinkPath)) {
      const result = resolveWorkspacePath(workspaceRoot, 'safe-symlink');
      assert.equal(result.relativePath, 'src/app.ts');
    }
  });

  it('throws on a missing path if mustExist is true', () => {
    assert.throws(() => {
      resolveWorkspacePath(workspaceRoot, 'src/non-existent.ts', { mustExist: true });
    }, /File not found/);
  });

  it('does not throw on a missing path if mustExist is false', () => {
    const result = resolveWorkspacePath(workspaceRoot, 'src/non-existent.ts', { mustExist: false });
    assert.equal(result.relativePath, 'src/non-existent.ts');
  });
});
