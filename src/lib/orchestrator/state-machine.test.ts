import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getClosedRoles, getNextRoleAndRound } from './state-machine';

const roles = [
  { name: 'Project Manager', slug: 'pm' },
  { name: 'Lead Architect', slug: 'architect' },
  { name: 'Lead Engineer', slug: 'engineer' },
  { name: 'QA & Security Reviewer', slug: 'qa-sec' },
];

const defaultFlow = roles.map((r) => r.slug);

describe('getClosedRoles', () => {
  it('maps role names to slugs when checking READY TO CLOSE', () => {
    const closed = getClosedRoles(
      [
        { sender: 'Project Manager', content: '[READY TO CLOSE]' },
        { sender: 'Lead Architect', content: 'Still discussing.' },
      ],
      roles
    );
    assert.deepEqual([...closed], ['pm']);
  });

  it('uses latest message from each role — retract close if reopened', () => {
    const closed = getClosedRoles(
      [
        { sender: 'Project Manager', content: '[READY TO CLOSE]' },
        { sender: 'Project Manager', content: 'Reopened with more input.' },
      ],
      roles
    );
    assert.deepEqual([...closed], []);
  });

  it('also works when sender is the slug directly', () => {
    const closed = getClosedRoles(
      [{ sender: 'pm', content: '[READY TO CLOSE]' }],
      roles
    );
    assert.deepEqual([...closed], ['pm']);
  });
});

describe('getNextRoleAndRound', () => {
  it('compiles when all roles are closed', () => {
    const transition = getNextRoleAndRound({
      defaultFlow,
      currentRoleSlug: 'qa-sec',
      currentRound: 1,
      maxRounds: 2,
      closedRoles: new Set(defaultFlow),
    });
    assert.deepEqual(transition, {
      nextRoleSlug: null,
      nextRound: 1,
      shouldCompile: true,
    });
  });

  it('advances to next role in default flow', () => {
    const transition = getNextRoleAndRound({
      defaultFlow,
      currentRoleSlug: 'pm',
      currentRound: 1,
      maxRounds: 2,
      closedRoles: new Set(),
    });
    assert.deepEqual(transition, {
      nextRoleSlug: 'architect',
      nextRound: 1,
      shouldCompile: false,
    });
  });

  it('ignores self-delegation and advances default flow', () => {
    const transition = getNextRoleAndRound({
      defaultFlow,
      currentRoleSlug: 'architect',
      currentRound: 1,
      maxRounds: 2,
      closedRoles: new Set(),
      delegateToSlug: 'architect',
    });
    assert.deepEqual(transition, {
      nextRoleSlug: 'engineer',
      nextRound: 1,
      shouldCompile: false,
    });
  });

  it('honors delegation to another open role', () => {
    const transition = getNextRoleAndRound({
      defaultFlow,
      currentRoleSlug: 'pm',
      currentRound: 1,
      maxRounds: 2,
      closedRoles: new Set(),
      delegateToSlug: 'qa-sec',
    });
    assert.deepEqual(transition, {
      nextRoleSlug: 'qa-sec',
      nextRound: 1,
      shouldCompile: false,
    });
  });

  it('ignores delegation to a closed role', () => {
    const transition = getNextRoleAndRound({
      defaultFlow,
      currentRoleSlug: 'pm',
      currentRound: 1,
      maxRounds: 2,
      closedRoles: new Set(['qa-sec']),
      delegateToSlug: 'qa-sec',
    });
    assert.deepEqual(transition, {
      nextRoleSlug: 'architect',
      nextRound: 1,
      shouldCompile: false,
    });
  });

  it('compiles when max rounds exceeded without needsMoreRound', () => {
    const transition = getNextRoleAndRound({
      defaultFlow,
      currentRoleSlug: 'qa-sec',
      currentRound: 2,
      maxRounds: 2,
      closedRoles: new Set(),
    });
    assert.deepEqual(transition, {
      nextRoleSlug: null,
      nextRound: 2,
      shouldCompile: true,
    });
  });

  it('allows one extra round when needsMoreRound is true at max round', () => {
    const transition = getNextRoleAndRound({
      defaultFlow,
      currentRoleSlug: 'qa-sec',
      currentRound: 2,
      maxRounds: 2,
      closedRoles: new Set(),
      needsMoreRound: true,
    });
    assert.deepEqual(transition, {
      nextRoleSlug: 'pm',
      nextRound: 3,
      shouldCompile: false,
    });
  });

  it('compiles after extra round even with needsMoreRound', () => {
    const transition = getNextRoleAndRound({
      defaultFlow,
      currentRoleSlug: 'qa-sec',
      currentRound: 3,
      maxRounds: 2,
      closedRoles: new Set(),
      needsMoreRound: true,
    });
    assert.deepEqual(transition, {
      nextRoleSlug: null,
      nextRound: 3,
      shouldCompile: true,
    });
  });
});
