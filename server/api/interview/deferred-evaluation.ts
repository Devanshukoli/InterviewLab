import { Evaluation, InterviewSession } from '../../db';
import { EvaluationResult } from '../../../src/shared/types';

export type EvaluationJob = {
  questionId: string;
  questionText: string;
  answerText: string;
  expectedConcepts: string[];
};

export function pendingEvaluationJobs(session: InterviewSession): EvaluationJob[] {
  const evaluations = session.evaluations || {};
  return session.questions
    .filter((question) => {
      const answer = session.answers?.[question.id];
      if (!answer || !answer.trim()) return false;
      return !evaluations[question.id];
    })
    .map((question) => ({
      questionId: question.id,
      questionText: question.questionText || question.topic,
      answerText: session.answers[question.id],
      expectedConcepts: question.expectedConcepts || [],
    }));
}

export function sessionHasEveryAnswer(session: InterviewSession): boolean {
  return session.questions.every((question) => Boolean(session.answers?.[question.id]?.trim()));
}

export async function runEvaluationJobs<T>(
  jobs: EvaluationJob[],
  evaluateJob: (job: EvaluationJob) => Promise<T>
): Promise<Array<{ questionId: string; result: T }>> {
  return Promise.all(
    jobs.map(async (job) => ({
      questionId: job.questionId,
      result: await evaluateJob(job),
    }))
  );
}

export function clarityFromScore(score: number): Evaluation['clarityRating'] {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

export function storedEvaluationFromResult(
  questionId: string,
  result: EvaluationResult,
  evaluatedAt: string,
  id: string
): Evaluation {
  return {
    id,
    questionId,
    score: result.score,
    clarityRating: clarityFromScore(result.score),
    feedback: result.feedback,
    missingPoints: result.missingConcepts,
    suggestedAnswer: result.idealAnswer,
    evaluatedAt,
  };
}
