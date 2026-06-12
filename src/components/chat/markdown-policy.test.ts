import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema, renderLink } from './markdown-policy';

test('Markdown Policy Sanity Tests', async (t) => {
  const components = { a: renderLink };

  const render = (md: string) => renderToString(
    React.createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]],
      components
    }, md)
  );

  await t.test('strips script tags', () => {
    const output = render('<script>alert("xss")</script>Hello');
    assert.ok(!output.includes('<script>'));
    assert.ok(output.includes('Hello'));
  });

  await t.test('strips inline event handlers', () => {
    const output = render('<a href="#" onclick="alert(1)">Link</a>');
    assert.ok(!output.includes('onclick'));
    assert.ok(output.includes('href="'));
  });

  await t.test('strips javascript: URLs', () => {
    const output = render('[Evil](javascript:alert(1))');
    assert.ok(!output.includes('javascript:'));
  });

  await t.test('strips unsafe images', () => {
    const output = render('![alt](javascript:alert(1))');
    assert.ok(!output.includes('javascript:alert'));
  });

  await t.test('allows custom badge markup', () => {
    const output = render('<div class="decisionBadge">Decision</div>');
    assert.ok(output.includes('class="decisionBadge"'));
  });

  await t.test('strips arbitrary classes', () => {
    const output = render('<div class="evilClass">Content</div>');
    assert.ok(!output.includes('evilClass'));
  });

  await t.test('adds target and rel only to external links', () => {
    const output1 = render('[External](https://example.com)');
    assert.ok(output1.includes('target="_blank"'));
    assert.ok(output1.includes('rel="noopener noreferrer"'));

    const output2 = render('[Protocol Relative](//example.com)');
    assert.ok(output2.includes('target="_blank"'));
    assert.ok(output2.includes('rel="noopener noreferrer"'));

    const output3 = render('[Internal](/about)');
    assert.ok(!output3.includes('target="_blank"'));
    assert.ok(!output3.includes('rel="noopener noreferrer"'));
  });
});
