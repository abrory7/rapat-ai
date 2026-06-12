import assert from 'node:assert/strict';
import test from 'node:test';
import { revealProviderTestResult } from './provider-test-result';

test('does nothing when the provider test result is not rendered', () => {
  assert.doesNotThrow(() => revealProviderTestResult(null));
});

test('scrolls the provider test result into view and focuses it', () => {
  const calls: unknown[] = [];
  const element = {
    scrollIntoView(options: ScrollIntoViewOptions) {
      calls.push(['scrollIntoView', options]);
    },
    focus(options?: FocusOptions) {
      calls.push(['focus', options]);
    },
  };

  revealProviderTestResult(element);

  assert.deepEqual(calls, [
    ['scrollIntoView', { behavior: 'smooth', block: 'nearest' }],
    ['focus', { preventScroll: true }],
  ]);
});
