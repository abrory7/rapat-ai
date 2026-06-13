import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getOrchestrationErrorResponse,
} from '@/app/api/orchestrate/route';
import { OrchestrationCommandError } from './engine';

describe('getOrchestrationErrorResponse', () => {
  it('maps stable orchestration errors to HTTP status and JSON fields', () => {
    const cases = [
      ['SESSION_NOT_FOUND', 404],
      ['SESSION_ALREADY_ACTIVE', 409],
      ['INVALID_SESSION_STATE', 409],
      ['COMPILATION_FAILED', 422],
    ] as const;

    for (const [code, status] of cases) {
      const response = getOrchestrationErrorResponse(
        new OrchestrationCommandError(code, `Message for ${code}`)
      );
      assert.equal(response.status, status);
      assert.deepEqual(response.body, {
        code,
        error: `Message for ${code}`,
      });
    }
  });

  it('does not expose unexpected error details', () => {
    assert.deepEqual(getOrchestrationErrorResponse(new Error('database path')), {
      status: 500,
      body: {
        code: 'INTERNAL_ERROR',
        error: 'Action failed.',
      },
    });
  });
});
