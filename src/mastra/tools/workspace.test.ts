import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { prisma } from '../../lib/db';
import { writeOutputTool } from './workspace';

describe('writeOutputTool', () => {
  let tempDir: string;
  let projectId: string;
  let symlinksSupported = true;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapat-ai-tool-test-'));
    const projectRepo = path.join(tempDir, 'project-repo');
    fs.mkdirSync(projectRepo);
    
    // Create output folder structure inside project repo
    fs.mkdirSync(path.join(projectRepo, '.rapat-ai'));
    fs.mkdirSync(path.join(projectRepo, '.rapat-ai', 'outputs'));

    // Create a dummy project in sqlite
    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        repoPath: projectRepo,
      },
    });
    projectId = project.id;

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

  after(async () => {
    // Delete dummy project
    if (projectId) {
      try {
        await prisma.project.delete({
          where: { id: projectId },
        });
      } catch {
        // Ignore db cleanup error
      }
    }

    // Clean up directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore directory cleanup error
    }
  });

  it('successfully writes output when fileName is safe', async () => {
    const result = await writeOutputTool.execute({
      projectId,
      fileName: 'safe_output.md',
      content: 'hello world',
    });

    assert.equal(result.success, true);
    assert.equal(result.filePath, '.rapat-ai/outputs/safe_output.md');

    // Verify file actually exists and has content
    const content = fs.readFileSync(path.join(tempDir, 'project-repo', '.rapat-ai', 'outputs', 'safe_output.md'), 'utf8');
    assert.equal(content, 'hello world');
  });

  it('rejects traversal or invalid filenames', async () => {
    // Relative directory traversal
    const result1 = await writeOutputTool.execute({
      projectId,
      fileName: '../escaped.md',
      content: 'hack',
    });
    assert.equal(result1.success, false);

    // Empty filename
    const result2 = await writeOutputTool.execute({
      projectId,
      fileName: '',
      content: 'hack',
    });
    assert.equal(result2.success, false);

    // Dot filename
    const result3 = await writeOutputTool.execute({
      projectId,
      fileName: '.',
      content: 'hack',
    });
    assert.equal(result3.success, false);
  });

  it('fails to write to a symlink at the destination path (O_NOFOLLOW check)', async (t) => {
    if (!symlinksSupported) {
      t.skip('Symlinks not supported by host OS');
      return;
    }

    const result = await writeOutputTool.execute({
      projectId,
      fileName: 'linked-file.md',
      content: 'malicious write',
    });

    // It should fail due to O_NOFOLLOW (ELOOP)
    assert.equal(result.success, false);
    assert.match(result.error || '', /ELOOP|Access Denied/i);

    // Verify the outside file was NOT modified
    const outsideContent = fs.readFileSync(path.join(tempDir, 'outside.txt'), 'utf8');
    assert.equal(outsideContent, 'outside secret');
  });
});
