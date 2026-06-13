import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildContext } from './context-builder';

describe('context-builder summary projection', () => {
  it('uses a bounded context summary in the active-agent prompt', async () => {
    const contextSummary = [
      'N'.repeat(8000),
      '### STRUCTURED FACTS',
      'Decisions:',
      ...Array.from({ length: 200 }, (_, index) => `  * Decision ${index}: ${'X'.repeat(200)}`),
    ].join('\n');
    const messages = Array.from({ length: 15 }, (_, index) => ({
      sender: index === 0 ? 'USER' : 'PM',
      content: `Message ${index}`,
    }));

    const context = await buildContext({
      session: {
        topic: 'Test topic',
        projectId: 'project-1',
        template: { name: 'Test template' },
        contextSummary,
      },
      role: { name: 'Project Manager', slug: 'pm' },
      messages,
      registeredSlugs: ['pm'],
    });

    assert.ok(context.summaryText.length < 13000);
    assert.ok(context.summaryText.includes('SUMMARY CONTENT OMITTED DUE TO SIZE LIMIT'));
    assert.ok(context.summaryText.includes('Decision 199'));
    assert.ok(!context.summaryText.includes('Decision 0:'));
  });
});
