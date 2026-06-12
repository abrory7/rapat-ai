import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isIgnored } from './ignore-filter';

describe('ignore-filter', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapat-ai-ignore-test-'));
    // Write a dummy .gitignore in the temp directory
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored-by-gitignore.txt\n*.log\n');
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('ignores permanent exclusions (.git, .env, .secret, node_modules, etc.)', () => {
    assert.equal(isIgnored('.git/config', []), true);
    assert.equal(isIgnored('.env', []), true);
    assert.equal(isIgnored('.env.production', []), true);
    assert.equal(isIgnored('.secret', []), true);
    assert.equal(isIgnored('cert.pem', []), true);
    assert.equal(isIgnored('db.sqlite', []), true);
    assert.equal(isIgnored('db.sqlite-journal', []), true);
    assert.equal(isIgnored('node_modules/lodash/index.js', []), true);
    assert.equal(isIgnored('.next/cache/123', []), true);
    assert.equal(isIgnored('.rapat-ai/outputs/doc.md', []), true);
  });

  it('ensures custom negation rules cannot re-enable permanent exclusions', () => {
    // Attempting to negate .env or node_modules via custom rules
    const customRules = ['!.env', '!node_modules/'];
    assert.equal(isIgnored('.env', customRules), true);
    assert.equal(isIgnored('node_modules/lodash/index.js', customRules), true);
  });

  it('merges project .gitignore and custom project rules', () => {
    const customRules = ['custom-ignored.txt'];
    
    // File ignored by .gitignore
    assert.equal(isIgnored('ignored-by-gitignore.txt', customRules, tempDir), true);
    assert.equal(isIgnored('app.log', customRules, tempDir), true);
    
    // File ignored by custom rules
    assert.equal(isIgnored('custom-ignored.txt', customRules, tempDir), true);
    
    // Non-ignored file
    assert.equal(isIgnored('src/app.ts', customRules, tempDir), false);
  });
});
