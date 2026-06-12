import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSensitiveText } from './redaction';

test('redacts bearer tokens and credential query parameters', () => {
  const input =
    'Authorization: Bearer sk-secret https://example.com/models?key=google-secret&safe=yes';

  const redacted = redactSensitiveText(input);

  assert.doesNotMatch(redacted, /sk-secret|google-secret/);
  assert.match(redacted, /Bearer \[REDACTED\]/);
  assert.match(redacted, /key=%5BREDACTED%5D/);
});

