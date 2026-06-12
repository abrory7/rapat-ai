import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { prisma } from '../../lib/db';
import { writeOutputTool } from './workspace';

describe('writeOutputTool', () => {
  let tempDir: string;
  let projectRepo: string;
  const projectId = 'test-project-id';
  let symlinksSupported = true;
  let originalFindUnique: unknown;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapat-ai-tool-test-'));
    projectRepo = path.join(tempDir, 'project-repo');
    fs.mkdirSync(projectRepo);

    // Create output folder structure inside project repo
    fs.mkdirSync(path.join(projectRepo, '.rapat-ai'));
    fs.mkdirSync(path.join(projectRepo, '.rapat-ai', 'outputs'));

    // Mock prisma.project.findUnique to avoid database dependencies (hermetic test)
    originalFindUnique = prisma.project.findUnique;
    (prisma.project.findUnique as unknown) = async (args: { where: { id: string } }) => {
      if (args.where.id === projectId) {
        return {
          id: projectId,
          name: 'Test Project',
          repoPath: projectRepo,
          ignoreRules: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return null;
    };

    // Create a file outside the project root to target via symlink
    fs.writeFileSync(path.join(tempDir, 'outside.txt'), 'outside secret');

    // Create a symlink resolving to the outside file inside the outputs directory
    try {
      fs.symlinkSync(
        path.join(tempDir, 'outside.txt'),
        path.join(projectRepo, '.rapat-ai', 'outputs', 'linked-file.md')
      );
    } catch {
      symlinksSupported = false;
    }
  });

  after(() => {
    // Restore original prisma function
    if (originalFindUnique) {
      (prisma.project.findUnique as unknown) = originalFindUnique;
    }

    // Clean up directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore directory cleanup error
    }
  });

  it('successfully writes output when fileName is safe', async () => {
    assert.ok(writeOutputTool.execute);
    const result = await writeOutputTool.execute(
      {
        projectId,
        fileName: 'safe_output.md',
        content: 'hello world',
      },
      {} as any
    ) as { success: boolean; filePath?: string; error?: string };

    assert.equal(result.success, true);
    assert.equal(result.filePath, '.rapat-ai/outputs/safe_output.md');

    // Verify file actually exists and has content
    const content = fs.readFileSync(path.join(projectRepo, '.rapat-ai', 'outputs', 'safe_output.md'), 'utf8');
    assert.equal(content, 'hello world');
  });

  it('rejects traversal or invalid filenames', async () => {
    assert.ok(writeOutputTool.execute);

    // Relative directory traversal
    const result1 = await writeOutputTool.execute(
      {
        projectId,
        fileName: '../escaped.md',
        content: 'hack',
      },
      {} as any
    ) as { success: boolean; error?: string };
    assert.equal(result1.success, false);

    // Empty filename
    const result2 = await writeOutputTool.execute(
      {
        projectId,
        fileName: '',
        content: 'hack',
      },
      {} as any
    ) as { success: boolean; error?: string };
    assert.equal(result2.success, false);

    // Dot filename
    const result3 = await writeOutputTool.execute(
      {
        projectId,
        fileName: '.',
        content: 'hack',
      },
      {} as any
    ) as { success: boolean; error?: string };
    assert.equal(result3.success, false);
  });

  it('rejects a symlink resolving outside the workspace (resolver check)', async () => {
    assert.ok(writeOutputTool.execute);

    const result = await writeOutputTool.execute(
      {
        projectId,
        fileName: 'linked-file.md',
        content: 'malicious write',
      },
      {} as any
    ) as { success: boolean; error?: string };

    // The resolver resolves linked-file.md -> outside.txt which is outside repoPath, so it throws Access Denied
    assert.equal(result.success, false);
    assert.match(result.error || '', /Access Denied/i);

    // Verify the outside file was NOT modified
    const outsideContent = fs.readFileSync(path.join(tempDir, 'outside.txt'), 'utf8');
    assert.equal(outsideContent, 'outside secret');
  });

  it('proves O_NOFOLLOW flag prevents writing to a symlink directly', (t) => {
    if (!symlinksSupported) {
      t.skip('Symlinks not supported by host OS');
      return;
    }
    const symlinkPath = path.join(projectRepo, '.rapat-ai', 'outputs', 'linked-file.md');

    // Writing with O_NOFOLLOW should throw ELOOP
    assert.throws(() => {
      fs.writeFileSync(symlinkPath, 'test', {
        flag: (fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW) as unknown as string
      });
    }, /ELOOP/);
  });
});
