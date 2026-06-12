import assert from 'node:assert/strict';
import test from 'node:test';
import { decrypt, encrypt } from './encryption';

test('encrypts with a version prefix and decrypts the original value', () => {
  const ciphertext = encrypt('provider-secret');

  assert.match(ciphertext, /^v1:/);
  assert.equal(decrypt(ciphertext), 'provider-secret');
  assert.doesNotMatch(ciphertext, /provider-secret/);
});

test('rejects tampered ciphertext', () => {
  const ciphertext = encrypt('provider-secret');
  const tampered = `${ciphertext.slice(0, -1)}${ciphertext.endsWith('0') ? '1' : '0'}`;

  assert.throws(() => decrypt(tampered), /Decryption failed/);
});
