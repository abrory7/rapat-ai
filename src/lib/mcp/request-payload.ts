export function toMcpMutationPayload<
  T extends { id?: string; removedEnvKeys?: string[] },
>(input: T, isUpdate: boolean): Omit<T, 'id'> {
  const payload = { ...input };
  delete payload.id;
  if (!isUpdate) {
    delete payload.removedEnvKeys;
  }
  return payload;
}

