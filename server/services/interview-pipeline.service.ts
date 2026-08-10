import { ResumeAgent, defaultResumeAgent } from '../modules/agents/resume-agent';
import { JDAgent, defaultJdAgent } from '../modules/agents/jd-agent';
import { GapAgent, defaultGapAgent } from '../modules/agents/gap-agent';
import { QuestionAgent, defaultQuestionAgent } from '../modules/agents/question-agent';
import { 
  ResumeAnalysisResult, 
  JDAnalysisResult, 
  GapAnalysisResult, 
  QuestionItem,
  QuestionGenerationResult,
  PipelineInput,
  InterviewPipelineResult
} from '../../src/shared/types';
import { tracer, getAITelemetryAttributes, recordMetric, logger } from '../observability';
import { AppError } from '../middleware/error_handling';

export type { PipelineInput, InterviewPipelineResult };

/**
 * Custom error thrown when the Interview Pipeline fails
 */
export class InterviewPipelineError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, statusCode, details);
    this.name = 'InterviewPipelineError';
  }
}

/**
 * InterviewPipelineService orchestrates the end-to-end AI interview question generation workflow.
 * 
 * Execution Order:
 * 1. ResumeAgent - Extracts structured candidate profile & skill data
 * 2. JDAgent     - Analyzes job description requirements (if provided)
 * 3. GapAgent    - Evaluates skill gaps & recommended topics
 * 4. QuestionAgent - Synthesizes target interview questions
 */
export class InterviewPipelineService {
  private resumeAgent: ResumeAgent;
  private jdAgent: JDAgent;
  private gapAgent: GapAgent;
  private questionAgent: QuestionAgent;

  constructor(
    resumeAgent?: ResumeAgent,
    jdAgent?: JDAgent,
    gapAgent?: GapAgent,
    questionAgent?: QuestionAgent
  ) {
    this.resumeAgent = resumeAgent || defaultResumeAgent;
    this.jdAgent = jdAgent || defaultJdAgent;
    this.gapAgent = gapAgent || defaultGapAgent;
    this.questionAgent = questionAgent || defaultQuestionAgent;
  }

  /**
   * Runs the complete interview orchestration pipeline sequentially.
   * Stops immediately if any agent encounters an unrecoverable error.
   */
  async runPipeline(input: PipelineInput): Promise<InterviewPipelineResult> {
    const aiAttrs = getAITelemetryAttributes({
      userId: input.userId,
      interviewId: input.interviewId,
      sessionId: input.sessionId,
      interviewType: input.interviewType,
      difficulty: input.difficulty,
      experienceLevel: input.experienceLevel,
    });

    const rootSpan = tracer.startSpan('InterviewPipeline', undefined, undefined, aiAttrs);
    recordMetric.recordInterviewStarted({ 'interview.type': input.interviewType || 'technical', 'difficulty': input.difficulty || 'medium' });

    try {
      if (!input || !input.resumeText) {
        throw new InterviewPipelineError('Resume text content is required to run the interview pipeline', 400);
      }

      logger.info('🚀 [InterviewPipelineService] Starting Step 1: ResumeAgent...');
      const resumeSpan = tracer.startSpan('ResumeAgent', rootSpan.traceId, rootSpan, aiAttrs);
      let resumeAnalysis: ResumeAnalysisResult;
      try {
        resumeAnalysis = await tracer.withSpan(resumeSpan, () => this.resumeAgent.analyzeResume(input.resumeText, input.userId));
        resumeSpan.end('OK', { ...aiAttrs, 'resume.skills_count': resumeAnalysis.skills?.length || 0 });
      } catch (resumeErr: any) {
        resumeSpan.recordException(resumeErr);
        throw resumeErr;
      }

      logger.info('🚀 [InterviewPipelineService] Starting Step 2: JDAgent...');
      const jdSpan = tracer.startSpan('JDAgent', rootSpan.traceId, rootSpan, aiAttrs);
      let jdAnalysis: JDAnalysisResult | null = null;
      try {
        jdAnalysis = await tracer.withSpan(jdSpan, () => this.jdAgent.analyzeJobDescription(input.jdText, input.userId));
        jdSpan.end('OK', { ...aiAttrs, 'jd.has_content': Boolean(jdAnalysis) });
      } catch (jdErr: any) {
        jdSpan.recordException(jdErr);
        throw jdErr;
      }

      logger.info('🚀 [InterviewPipelineService] Starting Step 3: GapAgent...');
      const gapSpan = tracer.startSpan('GapAgent', rootSpan.traceId, rootSpan, aiAttrs);
      let gapAnalysis: GapAnalysisResult;
      try {
        gapAnalysis = await tracer.withSpan(gapSpan, () => this.gapAgent.evaluateGaps(resumeAnalysis, jdAnalysis, input.userId));
        gapSpan.end('OK', { ...aiAttrs, 'gap.missing_skills_count': gapAnalysis.missingSkills?.length || 0 });
      } catch (gapErr: any) {
        gapSpan.recordException(gapErr);
        throw gapErr;
      }

      logger.info('🚀 [InterviewPipelineService] Starting Step 4: QuestionAgent...');
      const questionSpan = tracer.startSpan('QuestionAgent', rootSpan.traceId, rootSpan, aiAttrs);
      let questionResult: QuestionGenerationResult;
      try {
        questionResult = await tracer.withSpan(questionSpan, () => this.questionAgent.generateQuestions({
          resume: resumeAnalysis,
          gap: gapAnalysis,
          interviewType: input.interviewType || 'technical',
          difficulty: input.difficulty || 'medium',
          experienceLevel: input.experienceLevel || 'mid',
          numberOfQuestions: input.numberOfQuestions || 5,
          userId: input.userId
        }));
        questionSpan.end('OK', { ...aiAttrs, 'questions.count': questionResult.questions.length });
      } catch (qErr: any) {
        questionSpan.recordException(qErr);
        throw qErr;
      }

      rootSpan.end('OK', {
        ...aiAttrs,
        'pipeline.questions_count': questionResult.questions.length,
        'pipeline.has_jd': Boolean(jdAnalysis)
      });

      return {
        questions: questionResult.questions,
        resumeAnalysis,
        jdAnalysis,
        gapAnalysis
      };
    } catch (err: any) {
      rootSpan.recordException(err);
      logger.error('❌ [InterviewPipelineService] Pipeline execution halted due to error:', err.message || err);
      throw err;
    }
  }

  /**
   * Alias method for runPipeline
   */
  async execute(input: PipelineInput): Promise<InterviewPipelineResult> {
    return this.runPipeline(input);
  }

  /**
   * Static convenience method
   */
  static async executePipeline(input: PipelineInput): Promise<InterviewPipelineResult> {
    return defaultInterviewPipelineService.runPipeline(input);
  }
}

export const defaultInterviewPipelineService = new InterviewPipelineService();
