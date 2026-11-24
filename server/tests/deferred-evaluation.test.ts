import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InterviewSession } from '../db';
import {
  pendingEvaluationJobs,
  runEvaluationJobs,
  sessionHasEveryAnswer,
} from '../api/interview/deferred-evaluation';

function sessionFixture(overrides: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: 'sess-perf',
    userId: 'usr-test',
    resumeId: 'resume-1',
    status: 'in_progress',
    options: {
      experienceLevel: 'mid',
      interviewType: 'technical',
      numberOfQuestions: 3,
      difficulty: 'medium',
    },
    questions: [
      { id: 'q-1', questionText: 'Q1', type: 'technical', topic: 'A', difficulty: 'medium', expectedConcepts: ['a'] },
      { id: 'q-2', questionText: 'Q2', type: 'technical', topic: 'B', difficulty: 'medium', expectedConcepts: ['b'] },
      { id: 'q-3', questionText: 'Q3', type: 'technical', topic: 'C', difficulty: 'medium', expectedConcepts: ['c'] },
    ],
    answers: {},
    evaluations: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('deferred evaluation jobs', () => {
  it('skips unanswered questions and questions that already have evaluations', () => {
    const session = sessionFixture({
      answers: { 'q-1': 'first', 'q-2': 'second' },
      evaluations: {
        'q-1': {
          id: 'ev-1',
          questionId: 'q-1',
          score: 80,
          clarityRating: 'good',
          feedback: 'ok',
          missingPoints: [],
          suggestedAnswer: '',
          evaluatedAt: new Date().toISOString(),
        },
      },
    });

    const jobs = pendingEvaluationJobs(session);
    assert.deepEqual(jobs.map((job) => job.questionId), ['q-2']);
    assert.equal(sessionHasEveryAnswer(session), false);
  });

  it('runs pending jobs concurrently so wall time tracks the slowest job', async () => {
    const delayMs = 40;
    const session = sessionFixture({
      answers: { 'q-1': 'a', 'q-2': 'b', 'q-3': 'c' },
    });
    const jobs = pendingEvaluationJobs(session);
    assert.equal(jobs.length, 3);

    const sequentialStarted = Date.now();
    for (const job of jobs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      void job;
    }
    const sequentialMs = Date.now() - sequentialStarted;

    const parallelStarted = Date.now();
    const results = await runEvaluationJobs(jobs, async (job) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return job.questionId;
    });
    const parallelMs = Date.now() - parallelStarted;

    assert.deepEqual(results.map((row) => row.result).sort(), ['q-1', 'q-2', 'q-3']);
    assert.ok(
      parallelMs < sequentialMs / 2,
      `expected concurrent jobs to beat sequential wall time, got parallel=${parallelMs}ms sequential=${sequentialMs}ms`
    );
  });
});
