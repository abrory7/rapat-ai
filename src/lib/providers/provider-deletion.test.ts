import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteProviderPreservingRoles } from './provider-deletion';

test('provider deletion unassigns roles before deleting the provider', async () => {
  const calls: string[] = [];
  const roles: Array<{ id: string; providerId: string | null }> = [
    { id: 'role-1', providerId: 'provider-1' },
    { id: 'role-2', providerId: 'provider-1' },
    { id: 'role-3', providerId: 'provider-2' },
  ];

  const database = {
    $transaction: async <T>(
      operation: (transaction: {
        role: {
          count: (args: unknown) => Promise<number>;
          updateMany: (args: unknown) => Promise<{ count: number }>;
        };
        provider: {
          delete: (args: unknown) => Promise<{ id: string }>;
        };
      }) => Promise<T>
    ) =>
      operation({
        role: {
          count: async () => {
            calls.push('count');
            return roles.filter((role) => role.providerId === 'provider-1').length;
          },
          updateMany: async () => {
            calls.push('unassign');
            let count = 0;
            for (const role of roles) {
              if (role.providerId === 'provider-1') {
                role.providerId = null;
                count += 1;
              }
            }
            return { count };
          },
        },
        provider: {
          delete: async () => {
            calls.push('delete');
            assert.equal(
              roles.some((role) => role.providerId === 'provider-1'),
              false
            );
            return { id: 'provider-1' };
          },
        },
      }),
  };

  const result = await deleteProviderPreservingRoles(database, 'provider-1');

  assert.deepEqual(calls, ['count', 'unassign', 'delete']);
  assert.deepEqual(result, { success: true, unassignedRoleCount: 2 });
  assert.deepEqual(roles, [
    { id: 'role-1', providerId: null },
    { id: 'role-2', providerId: null },
    { id: 'role-3', providerId: 'provider-2' },
  ]);
});
