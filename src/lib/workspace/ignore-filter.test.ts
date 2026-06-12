import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isIgnored, parseIgnoreRules } from './ignore-filter';

describe('ignore-filter', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapat-ai-ignore-test-'));
    // Write a dummy .gitignore in the temp directory
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored-by-gitignore.txt\n*.log\nsecret\\ \n');
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('parses ignore rules preserving exact semantics including trailing spaces', () => {
    const rulesString = 'rule1\nrule2 \nrule3\\ \n#comment\n\nrule4';
    const parsed = parseIgnoreRules(rulesString);
    // Empty lines and comments are preserved because the `ignore` library handles them natively.
    // Trailing spaces are preserved because we no longer call `.trim()`.
    assert.deepEqual(parsed, ['rule1', 'rule2 ', 'rule3\\ ', '#comment', '', 'rule4']);
  });

  it('ignores permanent exclusions (.git, .env, .secret, node_modules, etc.)', () => {
    assert.equal(isIgnored('.git/config', []), true);
    assert.equal(isIgnored('.env', []), true);
    assert.equal(isIgnored('.env.production', []), true);
    assert.equal(isIgnored('.secret', []), true);
    assert.equal(isIgnored('cert.pem', []), true);
    assert.equal(isIgnored('db.sqlite', []), true);
    assert.equal(isIgnored('db.sqlite-journal', []), true);
    assert.equal(isIgnored('db.sqlite-wal', []), true);
    assert.equal(isIgnored('db.sqlite-shm', []), true);
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
    
    // File ignored by .gitignore with escaped trailing space
    assert.equal(isIgnored('secret ', customRules, tempDir), true);
    // Ensure the non-spaced version is not ignored
    assert.equal(isIgnored('secret', customRules, tempDir), false);

    // File ignored by custom rules
    assert.equal(isIgnored('custom-ignored.txt', customRules, tempDir), true);
    
    // Non-ignored file
    assert.equal(isIgnored('src/app.ts', customRules, tempDir), false);
  });
});
