import React from 'react';
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

export const renderLink = (props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { node, ...anchorProps } = props;
  const href = anchorProps.href || '';
  const isExternal = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');
  if (isExternal) {
    return React.createElement('a', { ...anchorProps, target: '_blank', rel: 'noopener noreferrer' });
  }
  return React.createElement('a', anchorProps);
};
