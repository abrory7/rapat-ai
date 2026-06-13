type ProviderDeletionTransaction = {
  role: {
    count(args: { where: { providerId: string } }): Promise<number>;
    updateMany(args: {
      where: { providerId: string };
      data: { providerId: null };
    }): Promise<{ count: number }>;
  };
  provider: {
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
};

type ProviderDeletionDatabase = {
  $transaction<T>(
    operation: (transaction: ProviderDeletionTransaction) => Promise<T>
  ): Promise<T>;
};

export async function deleteProviderPreservingRoles(
  database: ProviderDeletionDatabase,
  providerId: string
) {
  return database.$transaction(async (transaction) => {
    const assignedRoleCount = await transaction.role.count({
      where: { providerId },
    });

    await transaction.role.updateMany({
      where: { providerId },
      data: { providerId: null },
    });

    await transaction.provider.delete({
      where: { id: providerId },
    });

    return {
      success: true as const,
      unassignedRoleCount: assignedRoleCount,
    };
  });
}

