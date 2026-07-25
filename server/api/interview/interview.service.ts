import crypto from 'crypto';
import { db, InterviewSession, GeneratedQuestion, Evaluation } from '../../db';
import { tracer, getAITelemetryAttributes, recordMetric } from '../../observability';
import { AuthService } from '../auth/auth.service';
import { getLLMProvider } from '../../services/llm';
import { NotFoundError } from '../../middleware/error_handling';
import { getSupabaseClient } from '../../services/supabase';
import { defaultEvaluationAgent } from '../../modules/agents/evaluation-agent';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_USER_UUID = 'a1b2c3d4-0000-0000-0000-000000000001';

export function ensureUUID(id?: string): string {
  if (id && UUID_REGEX.test(id)) {
    return id;
  }
  if (!id || id === 'usr-anonymous') {
    return DEFAULT_USER_UUID;
  }
  return crypto.randomUUID();
}

export class InterviewService {
  static extractSkills(text: string): string[] {
    const textLower = text.toLowerCase();
    const skills: string[] = [];

    if (textLower.includes('react')) skills.push('React');
    if (textLower.includes('typescript') || textLower.includes('javascript') || textLower.includes('js')) skills.push('TypeScript');
    if (textLower.includes('node') || textLower.includes('express')) skills.push('Node.js');
    if (textLower.includes('python')) skills.push('Python');
    if (textLower.includes('kubernetes') || textLower.includes('k8s')) skills.push('Kubernetes');
    if (textLower.includes('aws') || textLower.includes('cloud')) skills.push('AWS Cloud');
    if (textLower.includes('sql') || textLower.includes('postgres')) skills.push('PostgreSQL');
    if (textLower.includes('docker')) skills.push('Docker');
    if (textLower.includes('ci/cd') || textLower.includes('github actions')) skills.push('CI/CD');
    if (textLower.includes('graphql')) skills.push('GraphQL');
    if (skills.length === 0) skills.push('System Architecture', 'Software Engineering', 'Problem Solving');
    return skills;
  }

  static uploadResume(
    text: string, 
    title?: string, 
    fileType?: string, 
    extraData?: { fileName?: string; fileSize?: number; fileUrl?: string }
  ) {
    const user = AuthService.getCurrentUser();
    const aiAttrs = getAITelemetryAttributes({ userId: user?.id });
    const span = tracer.startSpan('resume-agent:parseAndExtract', undefined, undefined, aiAttrs);
    try {
      const user = AuthService.getCurrentUser();
      const resumeId = crypto.randomUUID();
      const textLower = text.toLowerCase();
      const skills = InterviewService.extractSkills(text);
      const now = new Date().toISOString();

      const newResume = {
        id: resumeId,
        userId: user?.id || 'usr-anonymous',
        title: title || `Resume ${new Date().toLocaleDateString()}`,
        text,
        skills,
        fileType: fileType || 'text',
        fileName: extraData?.fileName,
        fileSize: extraData?.fileSize,
        fileUrl: extraData?.fileUrl,
        experienceYears: textLower.includes('senior') || textLower.includes('lead') ? 8 : textLower.includes('junior') ? 1 : 4,
        uploadedAt: now,
        updatedAt: now
      };

      db.resumes.set(resumeId, newResume);

      // Async sync to Supabase if configured
      const supabase = getSupabaseClient();
      if (supabase) {
        (async () => {
          try {
            const { error } = await supabase.from('resumes').insert({
              id: ensureUUID(newResume.id),
              user_id: ensureUUID(newResume.userId),
              title: newResume.title,
              raw_text: newResume.text,
              file_type: newResume.fileType,
              file_name: newResume.fileName,
              file_size: newResume.fileSize,
              file_url: newResume.fileUrl,
              skills: newResume.skills,
              experience_years: newResume.experienceYears,
              uploaded_at: newResume.uploadedAt,
              updated_at: newResume.updatedAt
            });
            if (error) console.warn('🔮 [Supabase] Resume insert notice:', error.message);
          } catch (err) {
            console.warn('🔮 [Supabase] Resume insert exception:', err);
          }
        })();
      }

      span.end('OK', { 'resume.id': resumeId, 'resume.skills_count': skills.length });
      return newResume;
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  static updateResume(
    id: string,
    payload: {
      title?: string;
      text?: string;
      fileType?: string;
      fileName?: string;
      fileSize?: number;
      fileUrl?: string;
    }
  ) {
    const user = AuthService.getCurrentUser();
    const aiAttrs = getAITelemetryAttributes({ userId: user?.id });
    const span = tracer.startSpan('resume-agent:updateResume', undefined, undefined, aiAttrs);
    try {
      const existing = db.resumes.get(id);
      const now = new Date().toISOString();

      const text = payload.text !== undefined ? payload.text : (existing?.text || '');
      const title = payload.title !== undefined ? payload.title : (existing?.title || 'Untitled Resume');
      const skills = text ? InterviewService.extractSkills(text) : (existing?.skills || ['Software Engineering']);

      const updatedResume = {
        id,
        userId: existing?.userId || 'usr-anonymous',
        title,
        text,
        skills,
        fileType: payload.fileType || existing?.fileType || 'text',
        fileName: payload.fileName !== undefined ? payload.fileName : existing?.fileName,
        fileSize: payload.fileSize !== undefined ? payload.fileSize : existing?.fileSize,
        fileUrl: payload.fileUrl !== undefined ? payload.fileUrl : existing?.fileUrl,
        experienceYears: existing?.experienceYears || 4,
        uploadedAt: existing?.uploadedAt || now,
        updatedAt: now
      };

      db.resumes.set(id, updatedResume);

      // Async sync to Supabase if configured
      const supabase = getSupabaseClient();
      if (supabase) {
        (async () => {
          try {
            const { error } = await supabase.from('resumes').upsert({
              id: ensureUUID(id),
              user_id: ensureUUID(updatedResume.userId),
              title: updatedResume.title,
              raw_text: updatedResume.text,
              file_type: updatedResume.fileType,
              file_name: updatedResume.fileName,
              file_size: updatedResume.fileSize,
              file_url: updatedResume.fileUrl,
              skills: updatedResume.skills,
              experience_years: updatedResume.experienceYears,
              updated_at: now
            });
            if (error) console.warn('🔮 [Supabase] Resume update notice:', error.message);
          } catch (err) {
            console.warn('🔮 [Supabase] Resume update exception:', err);
          }
        })();
      }

      span.end('OK', { 'resume.id': id });
      return updatedResume;
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  static uploadJobDescription(text: string) {
    const user = AuthService.getCurrentUser();
    const aiAttrs = getAITelemetryAttributes({ userId: user?.id });
    const span = tracer.startSpan('jd-agent:parseJobDescription', undefined, undefined, aiAttrs);
    try {
      const user = AuthService.getCurrentUser();
      const jdId = 'jd-' + Math.random().toString(36).substr(2, 9);
      const title = text.split('\n')[0]?.substring(0, 50) || 'Senior Software Engineer';

      const newJD = {
        id: jdId,
        userId: user?.id || 'usr-anonymous',
        text,
        title,
        company: text.toLowerCase().includes('google') ? 'Google' : 'Target Enterprise',
        requirements: ['TypeScript', 'System Architecture', 'Problem Solving', 'Production Systems'],
        uploadedAt: new Date().toISOString()
      };

      db.jobDescriptions.set(jdId, newJD);
      span.end('OK', { 'jd.id': jdId, 'jd.company': newJD.company });
      return newJD;
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  static async generateQuestions(payload: {
    resumeId: string;
    jobDescriptionId?: string;
    experienceLevel?: string;
    interviewType?: string;
    numberOfQuestions?: number;
    difficulty?: string;
  }) {
    const {
      resumeId,
      jobDescriptionId,
      experienceLevel = 'mid',
      interviewType = 'technical',
      numberOfQuestions = 5,
      difficulty = 'medium'
    } = payload;

    const user = AuthService.getCurrentUser();
    const aiAttrs = getAITelemetryAttributes({
      userId: user?.id,
      interviewType,
      difficulty,
      experienceLevel
    });
    const span = tracer.startSpan('question-agent:generateQuestions', undefined, undefined, aiAttrs);

    try {
      const user = AuthService.getCurrentUser();
      const resume = db.resumes.get(resumeId);
      if (!resume) {
        throw new NotFoundError(`Resume with ID '${resumeId}' not found`);
      }

      const jd = jobDescriptionId ? db.jobDescriptions.get(jobDescriptionId) : null;
      const sessionId = 'ses-' + Math.random().toString(36).substr(2, 9);
      const skills = resume.skills && resume.skills.length > 0 ? resume.skills : ['Software Architecture', 'System Design', 'Core Engineering'];

      let questions: GeneratedQuestion[] = [];
      const questionCount = Math.min(Math.max(Number(numberOfQuestions) || 3, 1), 10);

      // Attempt AI Generation via configured LLM Provider (Gemini, OpenAI, or Anthropic)
      try {
        const provider = getLLMProvider();
        const prompt = `You are a Principal Technical Interviewer evaluating a candidate.
Resume Content: "${resume.text}"
${jd ? `Target Job Description: "${jd.text}"` : ''}

Target Parameters:
- Experience Level: ${experienceLevel}
- Interview Type: ${interviewType}
- Difficulty: ${difficulty}
- Number of Questions required: ${questionCount}

Return a valid JSON array of exactly ${questionCount} objects with this schema:
[
  {
    "id": "q-1",
    "questionText": "Precise technical or scenario question text",
    "type": "${interviewType}",
    "topic": "Specific skill topic name",
    "difficulty": "${difficulty}",
    "expectedConcepts": ["concept1", "concept2", "concept3"]
  }
]
Do NOT include any markdown formatting or code fences. Output purely raw JSON array.`;

        const llmStartTime = Date.now();
        span.addEvent('LLM Request Started', { 'llm.attempt': 1 });
        const aiOutput = await provider.generate(prompt, 'You are an expert enterprise technical interviewer. Output valid raw JSON array only.');
        const llmDuration = Date.now() - llmStartTime;
        recordMetric.recordLLMRequestDuration(llmDuration, { agent: 'question-agent', 'llm.attempt': 1 });
        span.addEvent('LLM Response Received', { 'llm.attempt': 1, 'response.length': aiOutput.length });
        const cleanJson = aiOutput.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        span.addEvent('JSON Parsed', { 'llm.attempt': 1 });
        if (Array.isArray(parsed) && parsed.length > 0) {
          questions = parsed.map((q: any, idx: number) => ({
            id: `q-${idx + 1}`,
            questionText: q.questionText || `Question ${idx + 1}`,
            type: q.type || (interviewType as any),
            topic: q.topic || skills[idx % skills.length],
            difficulty: (difficulty as any),
            expectedConcepts: Array.isArray(q.expectedConcepts) ? q.expectedConcepts : [skills[idx % skills.length]]
          }));
        } else {
          span.addEvent('Validation Failed', { 'llm.attempt': 1, 'reason': 'empty_or_invalid_array' });
        }
      } catch (aiErr) {
        recordMetric.recordLLMRequestFailure({ agent: 'question-agent', 'llm.attempt': 1, error: (aiErr as any)?.message || String(aiErr) });
        span.addEvent('Validation Failed', { 'llm.attempt': 1, 'reason': 'llm_or_parse_failed' });
        console.warn('🔮 [InterviewService] LLM provider question generation skipped or failed, using structured template fallback:', aiErr);
      }

      // Fallback rule-based question generation if LLM was skipped or failed
      if (questions.length === 0) {
        for (let i = 0; i < questionCount; i++) {
          const currentSkill = skills[i % skills.length];

          let qType: 'technical' | 'behavioral' | 'situational' | 'background' = 'technical';
          if (interviewType === 'behavioral') {
            qType = 'behavioral';
          } else if (interviewType === 'mixed') {
            qType = i % 2 === 0 ? 'technical' : 'behavioral';
          }

          let qText = '';
          let concepts: string[] = [];

          if (jd) {
            if (qType === 'technical') {
              qText = `Looking at your experience with ${currentSkill} alongside the requirements for ${jd.title}, how do you ensure high availability and clean architecture under load?`;
              concepts = [currentSkill, 'High Availability', 'Architecture', 'Performance'];
            } else {
              qText = `Based on your resume and the ${jd.title} role at ${jd.company}, describe a situation where you led a technical project with tight deadlines. What trade-offs did you make?`;
              concepts = ['Project Leadership', 'Trade-offs', 'Prioritization', 'Communication'];
            }
          } else {
            if (qType === 'technical') {
              if (difficulty === 'senior' || experienceLevel === 'senior' || difficulty === 'hard') {
                qText = `Given your background in ${currentSkill} at a ${experienceLevel} level, how would you design a fault-tolerant microservice architecture to handle spikes in traffic?`;
                concepts = [currentSkill, 'Fault Tolerance', 'Microservices', 'Scalability'];
              } else {
                qText = `In your work with ${currentSkill}, what are the most critical design patterns and state handling practices you rely on?`;
                concepts = [currentSkill, 'Design Patterns', 'State Management', 'Code Quality'];
              }
            } else {
              qText = `Tell me about a challenging technical decision you made while working with ${currentSkill}. How did you justify your approach to key stakeholders?`;
              concepts = ['Stakeholder Management', 'Technical Decision Making', 'Communication'];
            }
          }

          questions.push({
            id: `q-${i + 1}`,
            questionText: qText,
            type: qType,
            topic: currentSkill,
            difficulty: (difficulty as any) || 'medium',
            expectedConcepts: concepts
          });
        }
      }

      const options = {
        experienceLevel: experienceLevel as any,
        interviewType: interviewType as any,
        numberOfQuestions: questionCount,
        difficulty: difficulty as any
      };

      const newSession: InterviewSession = {
        id: sessionId,
        userId: user?.id || 'usr-anonymous',
        resumeId,
        resumeTitle: resume.title || 'Uploaded Resume',
        jobDescriptionId: jobDescriptionId || null,
        jobTitle: jd ? jd.title : 'Resume-based Interview',
        status: 'in_progress',
        options,
        questions,
        answers: {},
        evaluations: {},
        createdAt: new Date().toISOString()
      };

      db.sessions.set(sessionId, newSession);
      recordMetric.recordInterviewStarted({ 'interview.type': interviewType, difficulty });
      recordMetric.recordQuestionsGenerated(questions.length, { 'interview.type': interviewType, difficulty });
      span.end('OK', { 'session.id': sessionId, 'questions.count': questions.length, 'has_jd': !!jd });

      return newSession;
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  static async evaluate(sessionId: string, questionId: string, answerText: string) {
    const user = AuthService.getCurrentUser();
    const aiAttrs = getAITelemetryAttributes({
      userId: user?.id,
      sessionId
    });
    const span = tracer.startSpan('evaluation-agent:evaluateAnswer', undefined, undefined, aiAttrs);

    try {
      const user = AuthService.getCurrentUser();
      const session = db.sessions.get(sessionId);
      if (!session) {
        throw new NotFoundError(`Session with ID '${sessionId}' not found`);
      }

      const question = session.questions.find(q => q.id === questionId);
      if (!question) {
        throw new NotFoundError(`Question with ID '${questionId}' not found in session`);
      }

      session.answers[questionId] = answerText;

      let score = Math.floor(Math.random() * 25) + 70;
      let clarityRating: 'poor' | 'fair' | 'good' | 'excellent' = score > 85 ? 'excellent' : 'good';
      let feedback = `Strong response. You accurately identified key domain concepts for ${question.topic}. Make sure to detail telemetry metrics and edge case handling downstream.`;
      let missingPoints = ['Tracing context propagation across services', 'Resource-bound backpressure handles'];
      let suggestedAnswer = `To enhance this answer, elaborate on telemetry metadata spans and explicit error boundary resilience mechanisms.`;

      // Attempt AI Evaluation via EvaluationAgent
      try {
        const evalResult = await defaultEvaluationAgent.evaluateAnswer(
          question.questionText || question.topic,
          answerText,
          question.expectedConcepts
        );

        score = evalResult.score;
        clarityRating = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor';
        feedback = evalResult.feedback || feedback;
        missingPoints = evalResult.missingConcepts.length > 0 ? evalResult.missingConcepts : missingPoints;
        suggestedAnswer = evalResult.idealAnswer || suggestedAnswer;
      } catch (aiErr) {
        console.warn('🔮 [InterviewService] EvaluationAgent call failed, using baseline evaluator:', aiErr);
      }

      const evaluation: Evaluation = {
        id: 'ev-' + Math.random().toString(36).substr(2, 9),
        questionId,
        score,
        clarityRating,
        feedback,
        missingPoints,
        suggestedAnswer,
        evaluatedAt: new Date().toISOString()
      };

      session.evaluations[questionId] = evaluation;
      recordMetric.recordEvaluationCompleted(1, { 'evaluation.score': score });

      const allAnswered = session.questions.every(q => session.answers[q.id]);
      if (allAnswered) {
        session.status = 'completed';

        const totalScore = Object.values(session.evaluations).reduce((sum, e) => sum + e.score, 0);
        session.coachingReport = {
          overallScore: Math.round(totalScore / session.questions.length),
          domainStrengths: ['System Observability', 'Technical Articulation'],
          domainWeaknesses: ['Distributed Tracing details', 'Scalable Backpressure Management'],
          recommendedTopics: [
            { topic: 'OpenTelemetry Context Propagation', priority: 'high' },
            { topic: 'Database Query & Index Optimization', priority: 'medium' }
          ],
          summary: `Excellent overall performance. You demonstrate a robust grasp of production engineering principles and architectural boundaries.`
        };

        const userId = user?.id || 'usr-anonymous';
        const userProgress = db.progress.get(userId) || [];

        session.questions.forEach(q => {
          const existingTopic = userProgress.find(p => p.topic === q.topic);
          const evalScore = session.evaluations[q.id]?.score || 80;
          if (existingTopic) {
            existingTopic.sessionCount += 1;
            existingTopic.confidenceScore = Math.round((existingTopic.confidenceScore + evalScore) / 2);
            existingTopic.lastPracticedAt = new Date().toISOString();
          } else {
            userProgress.push({
              id: 'prog-' + Math.random().toString(36).substr(2, 9),
              userId,
              topic: q.topic,
              confidenceScore: evalScore,
              sessionCount: 1,
              lastPracticedAt: new Date().toISOString()
            });
          }
        });
        db.progress.set(userId, userProgress);
      }

      db.sessions.set(sessionId, session);
      span.end('OK', { 'evaluation.score': score, 'session.status': session.status });

      return { session, evaluation };
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  static getHistory() {
    const user = AuthService.getCurrentUser();
    const userId = user?.id || 'usr-anonymous';
    return Array.from(db.sessions.values()).filter(s => s.userId === userId);
  }

  static getSessionById(id: string) {
    return db.sessions.get(id);
  }
}
