import assert from 'node:assert/strict';
import test from 'node:test';

import { getSidebarPresentation } from './sidebar-presentation';

test('expanded sidebar exposes collapse controls and visible labels', () => {
  assert.deepEqual(getSidebarPresentation(false), {
    toggleLabel: 'Collapse sidebar',
    isIconOnly: false,
    ariaExpanded: true,
  });
});

test('collapsed sidebar exposes expand controls and icon-only labels', () => {
  assert.deepEqual(getSidebarPresentation(true), {
    toggleLabel: 'Expand sidebar',
    isIconOnly: true,
    ariaExpanded: false,
  });
});
