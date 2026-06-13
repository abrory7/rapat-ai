import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildCompilationPrompt } from './compilation';

describe('Compilation Workflow Prompt Builder', () => {
  it('should bound transcript text at 60,000 characters', () => {
    const longContent = 'A'.repeat(30000); // 30k chars
    const messages = [
      { sender: 'USER', content: longContent, createdAt: new Date() },
      { sender: 'PM', content: longContent, createdAt: new Date() },
      { sender: 'ARCHITECT', content: longContent, createdAt: new Date() } // 90k chars total
    ];
    
    const prompt = buildCompilationPrompt({
      topic: 'Test topic',
      templateName: 'Test template',
      roleGuidance: '',
      uniqueDecisions: [],
      uniqueParkingLot: [],
      messages
    });
    
    // The prompt should omit the oldest message to keep transcript bounded
    assert.ok(prompt.includes('omitted due to length constraints'));
    assert.ok(prompt.includes('[ARCHITECT]')); // youngest
    assert.ok(!prompt.includes('[USER]')); // oldest, should be omitted
  });

  it('should preserve language from the topic (Indonesian)', () => {
    const prompt = buildCompilationPrompt({
      topic: 'Bagaimana cara membuat aplikasi',
      templateName: 'Test',
      roleGuidance: '',
      uniqueDecisions: [],
      uniqueParkingLot: [],
      messages: []
    });
    assert.ok(prompt.includes('MUST be written in the primary language of the topic: "Bagaimana cara membuat aplikasi"'));
  });

  it('should preserve language from the topic (English)', () => {
    const prompt = buildCompilationPrompt({
      topic: 'How to build an app',
      templateName: 'Test',
      roleGuidance: '',
      uniqueDecisions: [],
      uniqueParkingLot: [],
      messages: []
    });
    assert.ok(prompt.includes('MUST be written in the primary language of the topic: "How to build an app"'));
  });

  it('should use persisted context summary and not fail if absent', () => {
    const promptWithSummary = buildCompilationPrompt({
      topic: 'Test',
      templateName: 'Test',
      roleGuidance: '',
      uniqueDecisions: [],
      uniqueParkingLot: [],
      messages: [],
      contextSummary: 'Here is a summary.'
    });
    assert.ok(promptWithSummary.includes('Here is a summary.'));
    
    const promptWithoutSummary = buildCompilationPrompt({
      topic: 'Test',
      templateName: 'Test',
      roleGuidance: '',
      uniqueDecisions: [],
      uniqueParkingLot: [],
      messages: []
    });
    assert.ok(!promptWithoutSummary.includes('PREVIOUS DISCUSSION SUMMARY:'));
  });
});
