import { z } from 'zod';

const environmentKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const nonEmptyString = z.string().trim().min(1);
const stringArray = z.array(z.string());
const environment = z.record(
  z.string().regex(environmentKeyPattern),
  z.string()
);
const environmentKeyArray = z.array(z.string().regex(environmentKeyPattern));

const httpUrl = z.string().trim().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'URL must use HTTP or HTTPS');

const commonFields = {
  name: nonEmptyString,
  enabled: z.boolean().optional(),
};

const stdioCreateSchema = z.strictObject({
  ...commonFields,
  type: z.literal('stdio'),
  command: nonEmptyString,
  args: stringArray.optional(),
  env: environment.optional(),
});

const sseCreateSchema = z.strictObject({
  ...commonFields,
  type: z.literal('sse'),
  url: httpUrl,
});

export const mcpServerCreateSchema = z.discriminatedUnion('type', [
  stdioCreateSchema,
  sseCreateSchema,
]);

export type McpServerCreateInput = z.infer<typeof mcpServerCreateSchema>;

const mcpServerUpdateSchema = z.strictObject({
  name: nonEmptyString.optional(),
  type: z.enum(['stdio', 'sse']).optional(),
  command: nonEmptyString.optional(),
  url: httpUrl.optional(),
  args: stringArray.optional(),
  env: environment.optional(),
  removedEnvKeys: environmentKeyArray.optional(),
  enabled: z.boolean().optional(),
});

type ExistingMcpServerConfig = {
  name: string;
  type: string;
  command: string | null;
  url: string | null;
  args: readonly string[];
  enabled: boolean;
};

export type McpServerUpdateInput = z.infer<typeof mcpServerUpdateSchema>;

export function parseMcpServerCreate(input: unknown): McpServerCreateInput {
  return mcpServerCreateSchema.parse(input);
}

export function parseMcpServerUpdate(
  input: unknown,
  existing: ExistingMcpServerConfig
): McpServerUpdateInput {
  const update = mcpServerUpdateSchema.parse(input);
  const effectiveType = update.type ?? existing.type;

  if (effectiveType === 'stdio') {
    if (update.url !== undefined) {
      throw new z.ZodError([]);
    }
    const command = update.command ?? existing.command;
    if (!command?.trim()) {
      throw new z.ZodError([]);
    }
  } else if (effectiveType === 'sse') {
    if (
      update.command !== undefined ||
      update.args !== undefined ||
      update.env !== undefined ||
      update.removedEnvKeys !== undefined
    ) {
      throw new z.ZodError([]);
    }
    const url = update.url ?? existing.url;
    httpUrl.parse(url);
  } else {
    throw new z.ZodError([]);
  }

  return update;
}
