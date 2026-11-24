import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterAnswerSubmitAction,
  formatAnswerSaveError,
} from './live-interview-submit.ts';

describe('afterAnswerSubmitAction', () => {
  it('stays on the current question when save fails, including the last question', () => {
    assert.equal(afterAnswerSubmitAction(false, false), 'stay');
    assert.equal(afterAnswerSubmitAction(false, true), 'stay');
  });

  it('advances after a successful mid-session save', () => {
    assert.equal(afterAnswerSubmitAction(true, false), 'next');
  });

  it('finishes after a successful save on the last question', () => {
    assert.equal(afterAnswerSubmitAction(true, true), 'finish');
  });
});

describe('formatAnswerSaveError', () => {
  it('returns the thrown Error message from a failed save', () => {
    assert.equal(formatAnswerSaveError(new Error('Failed to fetch')), 'Failed to fetch');
  });

  it('returns a stay-on-question fallback when the failure has no message', () => {
    const fallback =
      'Network issue. Your answer was not saved. Stay on this question and try again.';
    assert.equal(formatAnswerSaveError({}), fallback);
    assert.equal(formatAnswerSaveError(new Error('   ')), fallback);
    assert.equal(formatAnswerSaveError(''), fallback);
  });
});
