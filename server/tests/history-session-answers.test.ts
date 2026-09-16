import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  historyClientQuestionKey,
  historyQuestionKeyByDbId,
} from '../api/interview/history-question-keys';

function hashToUuid(str: string): string {
  const hash = createHash('md5').update(str).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

describe('history session answer mapping', () => {
  it('keys answers by generated_questions.id, not a rehashed session id', () => {
    const originalSessionId = 'sess-live-token';
    const sessionUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const questionDbId = hashToUuid(`${originalSessionId}-q-1`);
    const answerText = 'I would add tracing spans at the service boundary.';

    const questionRows = [{ id: questionDbId }];
    const keyByDbId = historyQuestionKeyByDbId(questionRows);
    const clientKey = historyClientQuestionKey(0);

    assert.equal(clientKey, 'q-1');
    assert.equal(keyByDbId.get(questionDbId), 'q-1');

    const recomputedFromHistoryId = hashToUuid(`${sessionUuid}-q-1`);
    assert.notEqual(recomputedFromHistoryId, questionDbId);

    const answers: Record<string, string> = {};
    const qKey = keyByDbId.get(questionDbId);
    if (qKey) answers[qKey] = answerText;

    assert.equal(answers['q-1'], answerText);
  });
});
