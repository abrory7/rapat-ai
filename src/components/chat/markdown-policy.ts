import { defaultSchema } from 'rehype-sanitize';

const allowedClasses = [
  'mention',
  'decisionBadge',
  'parkingBadge',
  'flagBadge',
  'signalBadge',
  'close',
  'extra',
  'thoughtAccordion',
  'thoughtContent'
];

export const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'details', 'summary', 'div', 'span'],
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...(defaultSchema.attributes?.div || []),
      ['className', ...allowedClasses],
      ['class', ...allowedClasses],
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['className', ...allowedClasses],
      ['class', ...allowedClasses],
    ],
    details: [
      ...(defaultSchema.attributes?.details || []),
      ['className', ...allowedClasses],
      ['class', ...allowedClasses],
    ],
    summary: [
      ...(defaultSchema.attributes?.summary || []),
      ['className', ...allowedClasses],
      ['class', ...allowedClasses],
    ]
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto']
  }
};
