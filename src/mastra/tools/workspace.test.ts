import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { prisma } from '../../lib/db';
import { writeOutputTool } from './workspace';

type ExecParams = Parameters<NonNullable<typeof writeOutputTool.execute>>;
type ContextType = ExecParams[1];
const mockCtx = {} as ContextType;

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
      mockCtx
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
      mockCtx
    ) as { success: boolean; error?: string };
    assert.equal(result1.success, false);

    // Empty filename
    const result2 = await writeOutputTool.execute(
      {
        projectId,
        fileName: '',
        content: 'hack',
      },
      mockCtx
    ) as { success: boolean; error?: string };
    assert.equal(result2.success, false);

    // Dot filename
    const result3 = await writeOutputTool.execute(
      {
        projectId,
        fileName: '.',
        content: 'hack',
      },
      mockCtx
    ) as { success: boolean; error?: string };
    assert.equal(result3.success, false);
  });

  it('rejects writing to symlinks via O_NOFOLLOW (prevents dangling symlink exploits)', async (t) => {
    if (!symlinksSupported) {
      t.skip('Symlinks not supported by host OS');
      return;
    }
    assert.ok(writeOutputTool.execute);

    const result = await writeOutputTool.execute(
      {
        projectId,
        fileName: 'linked-file.md',
        content: 'malicious write',
      },
      mockCtx
    ) as { success: boolean; error?: string };

    // Since we pass the unresolved symlink path to writeFileSync with O_NOFOLLOW,
    // the OS immediately rejects it with ELOOP, regardless of where it points.
    assert.equal(result.success, false);
    assert.match(result.error || '', /ELOOP|Access Denied/i);

    // Verify the outside file was NOT modified
    const outsideContent = fs.readFileSync(path.join(tempDir, 'outside.txt'), 'utf8');
    assert.equal(outsideContent, 'outside secret');
  });
});
