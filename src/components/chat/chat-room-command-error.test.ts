import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const chatRoomPath = new URL('./ChatRoom.tsx', import.meta.url);

describe('ChatRoom command errors', () => {
  it('renders command failures inline in the header without browser alerts', async () => {
    const source = await readFile(chatRoomPath, 'utf8');

    assert.doesNotMatch(source, /\balert\s*\(/);
    assert.match(source, /commandError/);
    assert.match(source, /role="alert"/);

    const headerStart = source.indexOf('<header');
    const headerEnd = source.indexOf('</header>');
    const commandErrorPosition = source.indexOf('{commandError');
    assert.ok(commandErrorPosition > headerStart);
    assert.ok(commandErrorPosition < headerEnd);
  });
});
