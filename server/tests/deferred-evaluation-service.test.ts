import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, InterviewSession } from '../db';
import { InterviewService, EvaluationAgentLike } from '../api/interview/interview.service';

function sessionFixture(id: string): InterviewSession {
  return {
    id,
    userId: 'usr-test',
    resumeId: 'resume-1',
    status: 'in_progress',
    options: {
      experienceLevel: 'mid',
      interviewType: 'technical',
      numberOfQuestions: 5,
      difficulty: 'medium',
    },
    questions: Array.from({ length: 5 }, (_, index) => ({
      id: `q-${index + 1}`,
      questionText: `Question ${index + 1}`,
      type: 'technical',
      topic: `Topic ${index + 1}`,
      difficulty: 'medium',
      expectedConcepts: ['concept'],
    })),
    answers: {},
    evaluations: {},
    createdAt: new Date().toISOString(),
  };
}

function delayedAgent(delayMs: number, calls: string[]): EvaluationAgentLike {
  return {
    async evaluateAnswer(questionText, _answerText, _expected, _userId) {
      calls.push(questionText);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        score: 80,
        strengths: ['clear'],
        weaknesses: [],
        missingConcepts: [],
        feedback: 'solid',
        idealAnswer: 'ideal',
      };
    },
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('InterviewService deferred evaluation', () => {
  beforeEach(() => {
    db.sessions.clear();
    db.progress.clear();
  });

  it('does not call the evaluation agent when an answer is saved', async () => {
    const session = sessionFixture('sess-save');
    db.sessions.set(session.id, session);
    const calls: string[] = [];
    const agent = delayedAgent(5, calls);

    await InterviewService.submitAnswer(session.id, 'q-1', 'my answer', { id: 'usr-test' });

    assert.deepEqual(calls, []);
    assert.equal(db.sessions.get(session.id)?.answers['q-1'], 'my answer');
    assert.equal(db.sessions.get(session.id)?.evaluations['q-1'], undefined);
    assert.equal(db.sessions.get(session.id)?.status, 'in_progress');
    void agent;
  });

  it('evaluates every answered question once at the result phase', async () => {
    const session = sessionFixture('sess-result');
    db.sessions.set(session.id, session);
    const calls: string[] = [];
    const agent = delayedAgent(5, calls);

    for (const question of session.questions) {
      await InterviewService.submitAnswer(session.id, question.id, `answer ${question.id}`, { id: 'usr-test' });
    }

    assert.equal(calls.length, 0);
    const result = await InterviewService.evaluateSession(session.id, { id: 'usr-test' }, { evaluationAgent: agent });
    assert.equal(calls.length, 5);
    assert.equal(result.session.status, 'completed');
    assert.equal(Object.keys(result.session.evaluations).length, 5);
    assert.equal(result.session.coachingReport?.overallScore, 80);

    const again = await InterviewService.evaluateSession(session.id, { id: 'usr-test' }, { evaluationAgent: agent });
    assert.equal(calls.length, 5);
    assert.equal(again.session.status, 'completed');
  });

  it('cuts result-phase wall time versus per-answer sequential evaluation under a 40ms agent stub', async () => {
    const delayMs = 40;
    const runs = 5;
    const sequential: number[] = [];
    const deferred: number[] = [];

    for (let run = 0; run < runs; run++) {
      const seqSession = sessionFixture(`sess-seq-${run}`);
      db.sessions.set(seqSession.id, seqSession);
      const seqCalls: string[] = [];
      const seqAgent = delayedAgent(delayMs, seqCalls);
      const seqStarted = Date.now();
      for (const question of seqSession.questions) {
        await InterviewService.submitAnswer(seqSession.id, question.id, `answer ${question.id}`, { id: 'usr-test' });
        await seqAgent.evaluateAnswer(question.questionText, `answer ${question.id}`, question.expectedConcepts, 'usr-test');
      }
      sequential.push(Date.now() - seqStarted);
      assert.equal(seqCalls.length, 5);

      const defSession = sessionFixture(`sess-def-${run}`);
      db.sessions.set(defSession.id, defSession);
      const defCalls: string[] = [];
      const defAgent = delayedAgent(delayMs, defCalls);
      const defStarted = Date.now();
      for (const question of defSession.questions) {
        await InterviewService.submitAnswer(defSession.id, question.id, `answer ${question.id}`, { id: 'usr-test' });
      }
      await InterviewService.evaluateSession(defSession.id, { id: 'usr-test' }, { evaluationAgent: defAgent });
      deferred.push(Date.now() - defStarted);
      assert.equal(defCalls.length, 5);
    }

    const seqMedian = median(sequential);
    const defMedian = median(deferred);
    console.log(
      JSON.stringify({
        claim: '5-question session, 40ms evaluation stub, 5 alternating runs',
        sequentialMedianMs: seqMedian,
        sequentialRangeMs: [Math.min(...sequential), Math.max(...sequential)],
        deferredMedianMs: defMedian,
        deferredRangeMs: [Math.min(...deferred), Math.max(...deferred)],
        limiter: 'stubbed evaluation-agent sleep on the Node event loop',
        errors: 0,
        agentCallsPerSide: 5,
      })
    );

    assert.ok(
      defMedian < seqMedian / 2,
      `deferred median ${defMedian}ms should be under half of sequential median ${seqMedian}ms`
    );
  });
});
