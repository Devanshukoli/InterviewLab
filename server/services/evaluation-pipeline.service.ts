import { EvaluationAgent, defaultEvaluationAgent } from '../modules/agents/evaluation-agent';
import { CoachAgent, defaultCoachAgent } from '../modules/agents/coach-agent';
import { 
  EvaluationResult, 
  CoachAnalysisResult,
  EvaluationPipelineInput,
  EvaluationPipelineResult
} from '../../src/shared/types';
import { db } from '../db';
import { getSupabaseClient, unwrap } from './supabase';
import { tracer, getAITelemetryAttributes, recordMetric, logger } from '../observability';
import { AppError } from '../middleware/error_handling';

export type { EvaluationPipelineInput, EvaluationPipelineResult };

/**
 * Custom error thrown when the Evaluation Pipeline fails
 */
export class EvaluationPipelineError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, statusCode, details);
    this.name = 'EvaluationPipelineError';
  }
}

/**
 * EvaluationPipelineService orchestrates answer evaluation, coaching guidance synthesis, and result persistence.
 * 
 * Execution Order:
 * 1. EvaluationAgent - Evaluates candidate response against question & expected concepts
 * 2. CoachAgent      - Generates performance feedback, topics to study, and next steps
 * 3. Persist results - Stores evaluation & coaching report in DB/session state
 * 4. Return summary  - Returns unified evaluation and coaching summary payload
 */
export class EvaluationPipelineService {
  private evaluationAgent: EvaluationAgent;
  private coachAgent: CoachAgent;

  constructor(
    evaluationAgent?: EvaluationAgent,
    coachAgent?: CoachAgent
  ) {
    this.evaluationAgent = evaluationAgent || defaultEvaluationAgent;
    this.coachAgent = coachAgent || defaultCoachAgent;
  }

  /**
   * Executes the evaluation pipeline.
   */
  async runPipeline(input: EvaluationPipelineInput): Promise<EvaluationPipelineResult> {
    const aiAttrs = getAITelemetryAttributes({
      userId: input.userId,
      interviewId: input.interviewId,
      sessionId: input.sessionId,
      interviewType: input.interviewType,
      difficulty: input.difficulty,
      experienceLevel: input.experienceLevel,
    });

    const rootSpan = tracer.startSpan('EvaluationPipeline', undefined, undefined, aiAttrs);

    try {
      if (!input || !input.candidateAnswer || !input.candidateAnswer.trim()) {
        throw new EvaluationPipelineError('Candidate answer text is required to run the evaluation pipeline', 400);
      }

      // Step 1: EvaluationAgent
      logger.info('🚀 [EvaluationPipelineService] Starting Step 1: EvaluationAgent...');
      const evalSpan = tracer.startSpan('EvaluationAgent', rootSpan.traceId, rootSpan, aiAttrs);
      let evaluationResult: EvaluationResult;
      try {
        evaluationResult = await tracer.withSpan(evalSpan, () =>
          this.evaluationAgent.evaluateAnswer(
            input.question as any,
            input.candidateAnswer,
            input.expectedTopics as any,
            input.userId
          )
        );
        evalSpan.end('OK', { ...aiAttrs, 'evaluation.score': evaluationResult.score });
      } catch (evalErr: any) {
        evalSpan.recordException(evalErr);
        throw evalErr;
      }

      // Fetch previous history if session exists or supplied
      let previousHistory = input.previousHistory;
      let sessionObj: any = null;

      if (input.sessionId) {
        sessionObj = db.sessions.get(input.sessionId);
        if (sessionObj) {
          previousHistory = previousHistory || sessionObj.evaluations || null;
        }
      }

      // Step 2: CoachAgent
      logger.info('🚀 [EvaluationPipelineService] Starting Step 2: CoachAgent...');
      const coachSpan = tracer.startSpan('CoachAgent', rootSpan.traceId, rootSpan, aiAttrs);
      let coachingResult: CoachAnalysisResult;
      try {
        coachingResult = await tracer.withSpan(coachSpan, () =>
          this.coachAgent.generateCoachingReport(
            [evaluationResult],
            previousHistory,
            input.userId
          )
        );
        coachSpan.end('OK', { ...aiAttrs, 'coaching.difficulty': coachingResult.recommendedDifficulty });
      } catch (coachErr: any) {
        coachSpan.recordException(coachErr);
        throw coachErr;
      }

      // Step 3: Persist results
      logger.info('🚀 [EvaluationPipelineService] Starting Step 3: Persist results...');
      const persistSpan = tracer.startSpan('PersistEvaluation', rootSpan.traceId, rootSpan, aiAttrs);
      const persistedAt = new Date().toISOString();

      try {
        if (input.sessionId && sessionObj) {
          const qId = input.questionId || 'q-1';
          sessionObj.answers = sessionObj.answers || {};
          sessionObj.evaluations = sessionObj.evaluations || {};

          sessionObj.answers[qId] = input.candidateAnswer;
          sessionObj.evaluations[qId] = {
            id: 'ev-' + Math.random().toString(36).substring(2, 11),
            questionId: qId,
            score: evaluationResult.score,
            clarityRating: evaluationResult.score >= 85 ? 'excellent' : evaluationResult.score >= 70 ? 'good' : evaluationResult.score >= 50 ? 'fair' : 'poor',
            feedback: evaluationResult.feedback,
            missingPoints: evaluationResult.missingConcepts,
            suggestedAnswer: evaluationResult.idealAnswer,
            evaluatedAt: persistedAt
          };

          sessionObj.coachingReport = {
            overallScore: evaluationResult.score,
            domainStrengths: evaluationResult.strengths,
            domainWeaknesses: evaluationResult.weaknesses,
            recommendedTopicsToStudy: coachingResult.topicsToStudy.map(t => ({ topic: t, priority: 'medium', resourceSuggestions: [] })),
            coachingSummary: coachingResult.overallPerformance
          };

          db.sessions.set(input.sessionId, sessionObj);

          // Async sync to Supabase if configured
          const supabase = getSupabaseClient();
          if (supabase) {
            (async () => {
              try {
                await unwrap(supabase.from('interview_sessions').upsert({
                  id: sessionObj.id,
                  status: sessionObj.status,
                  answers: sessionObj.answers,
                  evaluations: sessionObj.evaluations,
                  updated_at: persistedAt
                }));
              } catch (supaErr) {
                logger.warn('🔮 [Supabase] Session evaluation sync notice:', supaErr);
              }
            })();
          }
        }
        persistSpan.end('OK', { ...aiAttrs, 'persist.has_session': Boolean(sessionObj) });
      } catch (persistErr: any) {
        persistSpan.recordException(persistErr);
        throw persistErr;
      }

      rootSpan.end('OK', {
        ...aiAttrs,
        'evaluation.score': evaluationResult.score,
        'coaching.difficulty': coachingResult.recommendedDifficulty,
        'has_session': Boolean(sessionObj)
      });

      // Step 4: Return evaluation summary
      return {
        evaluation: evaluationResult,
        coaching: coachingResult,
        sessionId: input.sessionId,
        questionId: input.questionId,
        persistedAt
      };
    } catch (err: any) {
      rootSpan.recordException(err);
      logger.error('❌ [EvaluationPipelineService] Pipeline execution halted due to error:', err.message || err);
      throw err;
    }
  }

  /**
   * Alias method for runPipeline
   */
  async execute(input: EvaluationPipelineInput): Promise<EvaluationPipelineResult> {
    return this.runPipeline(input);
  }

  /**
   * Static convenience method
   */
  static async executePipeline(input: EvaluationPipelineInput): Promise<EvaluationPipelineResult> {
    return defaultEvaluationPipelineService.runPipeline(input);
  }
}

export const defaultEvaluationPipelineService = new EvaluationPipelineService();
