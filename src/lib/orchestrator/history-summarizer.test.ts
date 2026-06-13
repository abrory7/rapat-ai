import { describe, it } from 'node:test';
import assert from 'node:assert';
import { summarizeHistoryIfNeeded } from './history-summarizer';

describe('history-summarizer', () => {
  it('should return null if messages are 12 or less', async () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({ sender: 'USER', content: `Message ${i}` }));
    const result = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: null,
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    });
    assert.strictEqual(result, null);
  });

  it('should summarize old messages when there are more than 12 messages', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({ sender: 'PM', content: `Message ${i}` }));
    const result = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: null,
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    });
    
    assert.ok(result);
    assert.strictEqual(result.newSummarizedCount, 5); // length (15) - 10 = 5
    // Should contain deterministic summary for index 2, 3, 4
    assert.ok(result.newSummary.includes('Message 2'));
    assert.ok(result.newSummary.includes('Message 4'));
  });

  it('should use provided model summarization and fallback on failure', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({ sender: 'PM', content: `Message ${i}` }));
    
    // Model success
    const successResult = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: 'Old summary',
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    }, async () => 'Model Summary');
    
    assert.ok(successResult);
    assert.strictEqual(successResult.newSummary, 'Model Summary');
    
    // Model failure
    const failResult = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: 'Old summary',
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    }, async () => { throw new Error('Model failed'); });
    
    assert.ok(failResult);
    assert.ok(failResult.newSummary.includes('Old summary'));
    assert.ok(failResult.newSummary.includes('Message 2'));
  });

  it('should only summarize messages not already covered by summarizedMessageCount', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({ sender: 'PM', content: `Message ${i}` }));
    const result = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: 'Existing summary',
      summarizedMessageCount: 4,
      registeredSlugs: ['PM']
    });
    
    assert.ok(result);
    assert.strictEqual(result.newSummarizedCount, 5);
    // Should only summarize index 4
    assert.ok(!result.newSummary.includes('Message 3'));
    assert.ok(result.newSummary.includes('Message 4'));
  });

  it('should extract Indonesian and English unresolved/conclusion tags in deterministic summary', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => {
      let content = `Message ${i}`;
      if (i === 2) {
        content += '\n- [BELUM_SELESAI] Pertanyaan bahasa Indonesia';
      }
      if (i === 3) {
        content += '\nKesimpulan: Akhir dari kesepakatan';
      }
      return { sender: 'PM', content };
    });

    const result = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: null,
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    });

    assert.ok(result);
    assert.ok(result.newSummary.includes('Pertanyaan bahasa Indonesia'));
    assert.ok(result.newSummary.includes('Akhir dari kesepakatan'));
  });

  it('should extract tag berkolon inside brackets', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => {
      let content = `Message ${i}`;
      if (i === 2) {
        content += '\n[UNRESOLVED: siapa pemilik?]';
      }
      if (i === 3) {
        content += '\n[KESIMPULAN: desain siap]';
      }
      return { sender: 'PM', content };
    });

    const result = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: null,
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    });

    assert.ok(result);
    assert.ok(result.newSummary.includes('siapa pemilik?'));
    assert.ok(result.newSummary.includes('desain siap'));
  });

  it('should enforce narrative summary size limit by truncating from the start (retaining end)', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({
      sender: 'PM',
      content: i === 4 ? 'NewestImportantMessage' : `Message ${i}`
    }));
    const result = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: 'A'.repeat(6000),
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    });

    assert.ok(result);
    assert.ok(result.newSummary.includes('[NARRATIVE TRUNCATED FROM START DUE TO SIZE LIMIT]'));
    // Old A should be truncated, but the newest message should be retained at the end
    assert.ok(result.newSummary.includes('NewestImportantMessage'));
    assert.ok(!result.newSummary.startsWith('A'.repeat(6000)));
    assert.ok(result.newSummary.length < 5500);
  });

  it('should merge deterministic structured facts with model summary path', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => {
      let content = `Message ${i}`;
      if (i === 2) {
        content += '\n- [DECISION] Release on Friday';
      }
      if (i === 3) {
        content += '\n- [FLAG: Risk found]';
      }
      return { sender: 'PM', content };
    });

    // Even if model returns narrative only (e.g. "Model summary text"), it should merge structured facts
    const result = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: null,
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    }, async () => 'Model summary text');

    assert.ok(result);
    assert.ok(result.newSummary.includes('Model summary text'));
    assert.ok(result.newSummary.includes('### STRUCTURED FACTS'));
    assert.ok(result.newSummary.includes('Release on Friday'));
    assert.ok(result.newSummary.includes('Risk found'));
  });

  it('should extract facts from legacy summary format without structured facts separator', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({ sender: 'PM', content: `Message ${i}` }));
    const result = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: 'We discussed timeline.\n- [DECISION] LegacyDecisionApproved\n[UNRESOLVED: LegacyQuestionOwner?]',
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    });

    assert.ok(result);
    assert.ok(result.newSummary.includes('LegacyDecisionApproved'));
    assert.ok(result.newSummary.includes('LegacyQuestionOwner?'));
  });

  it('should bound structured facts categories and truncate individual item characters', async () => {
    // Generate 60 decisions in messages, one of which is very long
    const messages = Array.from({ length: 15 }, (_, i) => {
      let content = `Message ${i}`;
      if (i === 2) {
        // 60 decisions
        content += Array.from({ length: 60 }, (_, j) => `\n- [DECISION] DecisionNumber${j}`).join('');
        // One very long decision
        content += `\n- [DECISION] VeryLongDecision` + 'X'.repeat(600);
      }
      return { sender: 'PM', content };
    });

    const result = await summarizeHistoryIfNeeded({
      messages,
      currentSummary: null,
      summarizedMessageCount: 0,
      registeredSlugs: ['PM']
    });

    assert.ok(result);
    // Categorical list is capped to 50 items in the structured facts section
    const parts = result.newSummary.split('### STRUCTURED FACTS');
    const structuredPart = parts[1] || '';
    const decisionMatches = structuredPart.match(/DecisionNumber/g);
    assert.ok(decisionMatches && decisionMatches.length <= 50);
    // VeryLongDecision should be truncated to 500 chars (approx. 500 chars, so contains X but is not full length)
    assert.ok(result.newSummary.includes('VeryLongDecision'));
    const truncatedLine = result.newSummary.split('\n').find(line => line.includes('VeryLongDecision'));
    assert.ok(truncatedLine && truncatedLine.length < 520);
    assert.ok(truncatedLine.includes('...'));
  });
});
