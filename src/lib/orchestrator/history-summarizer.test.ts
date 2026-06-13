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
});
