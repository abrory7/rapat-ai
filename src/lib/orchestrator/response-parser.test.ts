import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseResponse } from './response-parser';

const registeredSlugs = ['pm', 'architect', 'engineer', 'qa-sec'];

describe('parseResponse', () => {
  it('extracts first valid delegation mention', () => {
    const parsed = parseResponse('Please ask @architect, then @engineer.', registeredSlugs);
    assert.equal(parsed.delegateTo, 'architect');
  });

  it('ignores unregistered mentions', () => {
    const parsed = parseResponse('Please ask @unknown about this.', registeredSlugs);
    assert.equal(parsed.delegateTo, undefined);
  });

  it('detects [READY TO CLOSE] signal', () => {
    const parsed = parseResponse('[READY TO CLOSE]', registeredSlugs);
    assert.equal(parsed.isClosing, true);
  });

  it('detects [NEEDS ONE MORE ROUND] signal', () => {
    const parsed = parseResponse('[NEEDS ONE MORE ROUND]', registeredSlugs);
    assert.equal(parsed.isNeedsMoreRound, true);
  });

  it('extracts both close and extra round signals together', () => {
    const parsed = parseResponse('[READY TO CLOSE]\n[NEEDS ONE MORE ROUND]', registeredSlugs);
    assert.equal(parsed.isClosing, true);
    assert.equal(parsed.isNeedsMoreRound, true);
  });

  it('extracts [FLAG: ...] patterns', () => {
    const parsed = parseResponse('[FLAG: Missing tests]', registeredSlugs);
    assert.deepEqual(parsed.flags, ['Missing tests']);
  });

  it('extracts [DECISION: ...] patterns', () => {
    const parsed = parseResponse('[DECISION: Use Prisma]', registeredSlugs);
    assert.deepEqual(parsed.decisions, ['Use Prisma']);
  });

  it('extracts line-format decisions', () => {
    const parsed = parseResponse('- [DECISION] Use Prisma.', registeredSlugs);
    assert.deepEqual(parsed.decisions, ['Use Prisma.']);
  });

  it('extracts [PARKING_LOT: ...] patterns', () => {
    const parsed = parseResponse('[PARKING_LOT: Revisit auth]', registeredSlugs);
    assert.deepEqual(parsed.parkingLot, ['Revisit auth']);
  });

  it('extracts line-format parking lot items', () => {
    const parsed = parseResponse('- [PARKING LOT] Revisit auth.', registeredSlugs);
    assert.deepEqual(parsed.parkingLot, ['Revisit auth.']);
  });

  it('returns empty arrays when no signals present', () => {
    const parsed = parseResponse('Just a regular response.', registeredSlugs);
    assert.equal(parsed.delegateTo, undefined);
    assert.equal(parsed.isClosing, false);
    assert.equal(parsed.isNeedsMoreRound, false);
    assert.deepEqual(parsed.flags, []);
    assert.deepEqual(parsed.decisions, []);
    assert.deepEqual(parsed.parkingLot, []);
  });
});
