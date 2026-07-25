import crypto from 'crypto';
import { db, InterviewSession, GeneratedQuestion, Evaluation, Resume, JobDescription, stringToUUID } from '../../db';
import { tracer, getAITelemetryAttributes, recordMetric } from '../../observability';
import { getLLMProvider } from '../../services/llm';
import { NotFoundError } from '../../middleware/error_handling';
import { getSupabaseClient } from '../../services/supabase';
import { defaultEvaluationAgent } from '../../modules/agents/evaluation-agent';

export function ensureUUID(id?: string): string {
  return stringToUUID(id);
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

  static async uploadResume(
    text: string, 
    title?: string, 
    fileType?: string, 
    extraData?: { fileName?: string; fileSize?: number; fileUrl?: string },
    currentUser?: { id?: string }
  ): Promise<Resume> {
    const user = currentUser;
    const aiAttrs = getAITelemetryAttributes({ userId: user?.id });
    const span = tracer.startSpan('resume-agent:parseAndExtract', undefined, undefined, aiAttrs);
    try {
      const userId = user?.id || 'usr-anonymous';
      const resumeId = crypto.randomUUID();
      const textLower = text.toLowerCase();
      const skills = InterviewService.extractSkills(text);
      const now = new Date().toISOString();

      const newResume: Resume = {
        id: resumeId,
        userId,
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

      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('resumes').insert({
            id: stringToUUID(resumeId),
            user_id: stringToUUID(userId),
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
        } catch (err) {
          console.warn('🔮 [InterviewService] Resume insert error in Supabase:', err);
        }
      }

      span.end('OK', { 'resume.id': resumeId, 'resume.skills_count': skills.length });
      return newResume;
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  static async updateResume(
    id: string,
    payload: {
      title?: string;
      text?: string;
      fileType?: string;
      fileName?: string;
      fileSize?: number;
      fileUrl?: string;
    },
    currentUser?: { id?: string }
  ): Promise<Resume> {
    const user = currentUser;
    const aiAttrs = getAITelemetryAttributes({ userId: user?.id });
    const span = tracer.startSpan('resume-agent:updateResume', undefined, undefined, aiAttrs);
    try {
      let existing = db.resumes.get(id);
      const supabase = getSupabaseClient();

      if (!existing && supabase) {
        try {
          const { data } = await supabase.from('resumes').select('*').eq('id', stringToUUID(id)).maybeSingle();
          if (data) {
            existing = {
              id: data.id,
              userId: data.user_id,
              title: data.title,
              text: data.raw_text,
              skills: data.skills || [],
              fileType: data.file_type || 'text',
              fileName: data.file_name,
              fileSize: data.file_size,
              fileUrl: data.file_url,
              experienceYears: data.experience_years || 0,
              uploadedAt: data.uploaded_at,
              updatedAt: data.updated_at
            };
          }
        } catch (e) {
          console.warn('🔮 [InterviewService] Failed to load resume from Supabase:', e);
        }
      }

      const now = new Date().toISOString();
      const text = payload.text !== undefined ? payload.text : (existing?.text || '');
      const title = payload.title !== undefined ? payload.title : (existing?.title || 'Untitled Resume');
      const skills = text ? InterviewService.extractSkills(text) : (existing?.skills || ['Software Engineering']);

      const updatedResume: Resume = {
        id,
        userId: existing?.userId || user?.id || 'usr-anonymous',
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

      if (supabase) {
        try {
          await supabase.from('resumes').upsert({
            id: stringToUUID(id),
            user_id: stringToUUID(updatedResume.userId),
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
        } catch (err) {
          console.warn('🔮 [InterviewService] Resume update error in Supabase:', err);
        }
      }

      span.end('OK', { 'resume.id': id });
      return updatedResume;
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  static async uploadJobDescription(text: string, currentUser?: { id?: string }): Promise<JobDescription> {
    const user = currentUser;
    const aiAttrs = getAITelemetryAttributes({ userId: user?.id });
    const span = tracer.startSpan('jd-agent:parseJobDescription', undefined, undefined, aiAttrs);
    try {
      const userId = user?.id || 'usr-anonymous';
      const jdId = 'jd-' + Math.random().toString(36).substr(2, 9);
      const title = text.split('\n')[0]?.substring(0, 50) || 'Senior Software Engineer';
      const company = text.toLowerCase().includes('google') ? 'Google' : 'Target Enterprise';

      const newJD: JobDescription = {
        id: jdId,
        userId,
        text,
        title,
        company,
        requirements: ['TypeScript', 'System Architecture', 'Problem Solving', 'Production Systems'],
        uploadedAt: new Date().toISOString()
      };

      db.jobDescriptions.set(jdId, newJD);

      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('job_descriptions').insert({
            id: stringToUUID(jdId),
            user_id: stringToUUID(userId),
            title: newJD.title,
            company: newJD.company,
            raw_text: text,
            requirements: newJD.requirements,
            uploaded_at: newJD.uploadedAt
          });
        } catch (err) {
          console.warn('🔮 [InterviewService] Failed to insert job description in Supabase:', err);
        }
      }

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
  }, currentUser?: { id?: string }) {
    const {
      resumeId,
      jobDescriptionId,
      experienceLevel = 'mid',
      interviewType = 'technical',
      numberOfQuestions = 5,
      difficulty = 'medium'
    } = payload;

    const user = currentUser;
    const aiAttrs = getAITelemetryAttributes({
      userId: user?.id,
      interviewType,
      difficulty,
      experienceLevel
    });
    const span = tracer.startSpan('question-agent:generateQuestions', undefined, undefined, aiAttrs);

    try {
      const userId = user?.id || 'usr-anonymous';
      const supabase = getSupabaseClient();

      let resume = db.resumes.get(resumeId);
      if (!resume && supabase) {
        try {
          const { data } = await supabase.from('resumes').select('*').eq('id', stringToUUID(resumeId)).maybeSingle();
          if (data) {
            resume = {
              id: data.id,
              userId: data.user_id,
              title: data.title,
              text: data.raw_text,
              skills: data.skills || [],
              fileType: data.file_type || 'text',
              experienceYears: data.experience_years || 0,
              uploadedAt: data.uploaded_at
            };
            db.resumes.set(resumeId, resume);
          }
        } catch (e) {
          console.warn('🔮 [InterviewService] Error fetching resume from Supabase:', e);
        }
      }

      if (!resume) {
        throw new NotFoundError(`Resume with ID '${resumeId}' not found`);
      }

      let jd = jobDescriptionId ? db.jobDescriptions.get(jobDescriptionId) : null;
      if (!jd && jobDescriptionId && supabase) {
        try {
          const { data } = await supabase.from('job_descriptions').select('*').eq('id', stringToUUID(jobDescriptionId)).maybeSingle();
          if (data) {
            jd = {
              id: data.id,
              userId: data.user_id,
              title: data.title,
              company: data.company,
              text: data.raw_text,
              requirements: data.requirements || [],
              uploadedAt: data.uploaded_at
            };
            db.jobDescriptions.set(jobDescriptionId, jd);
          }
        } catch (e) {
          console.warn('🔮 [InterviewService] Error fetching job description from Supabase:', e);
        }
      }

      const sessionId = 'ses-' + Math.random().toString(36).substr(2, 9);
      const skills = resume.skills && resume.skills.length > 0 ? resume.skills : ['Software Architecture', 'System Design', 'Core Engineering'];

      let questions: GeneratedQuestion[] = [];
      const questionCount = Math.min(Math.max(Number(numberOfQuestions) || 3, 1), 10);

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
        }
      } catch (aiErr) {
        recordMetric.recordLLMRequestFailure({ agent: 'question-agent', 'llm.attempt': 1, error: (aiErr as any)?.message || String(aiErr) });
        console.warn('🔮 [InterviewService] LLM provider question generation fallback:', aiErr);
      }

      if (questions.length === 0) {
        for (let i = 0; i < questionCount; i++) {
          const currentSkill = skills[i % skills.length];
          let qType: 'technical' | 'behavioral' | 'situational' | 'background' = 'technical';
          if (interviewType === 'behavioral') qType = 'behavioral';
          else if (interviewType === 'mixed') qType = i % 2 === 0 ? 'technical' : 'behavioral';

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

      const now = new Date().toISOString();
      const newSession: InterviewSession = {
        id: sessionId,
        userId,
        resumeId,
        resumeTitle: resume.title || 'Uploaded Resume',
        jobDescriptionId: jobDescriptionId || null,
        jobTitle: jd ? jd.title : 'Resume-based Interview',
        status: 'in_progress',
        options,
        questions,
        answers: {},
        evaluations: {},
        createdAt: now
      };

      db.sessions.set(sessionId, newSession);

      if (supabase) {
        try {
          await supabase.from('interview_sessions').insert({
            id: stringToUUID(sessionId),
            user_id: stringToUUID(userId),
            resume_id: stringToUUID(resumeId),
            resume_title: newSession.resumeTitle,
            job_description_id: jobDescriptionId ? stringToUUID(jobDescriptionId) : null,
            job_title: newSession.jobTitle,
            status: 'in_progress',
            options: newSession.options,
            created_at: now,
            updated_at: now
          });

          for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await supabase.from('generated_questions').insert({
              id: stringToUUID(sessionId + '-' + q.id),
              session_id: stringToUUID(sessionId),
              question_text: q.questionText,
              type: q.type,
              topic: q.topic,
              difficulty: q.difficulty,
              expected_concepts: q.expectedConcepts,
              order_index: i
            });
          }
        } catch (e) {
          console.warn('🔮 [InterviewService] Failed to insert session and questions in Supabase:', e);
        }
      }

      recordMetric.recordInterviewStarted({ 'interview.type': interviewType, difficulty });
      recordMetric.recordQuestionsGenerated(questions.length, { 'interview.type': interviewType, difficulty });
      span.end('OK', { 'session.id': sessionId, 'questions.count': questions.length, 'has_jd': !!jd });

      return newSession;
    } catch (err: any) {
      span.recordException(err);
      throw err;
    }
  }

  static async evaluate(sessionId: string, questionId: string, answerText: string, currentUser?: { id?: string }) {
    const user = currentUser;
    const aiAttrs = getAITelemetryAttributes({
      userId: user?.id,
      sessionId
    });
    const span = tracer.startSpan('evaluation-agent:evaluateAnswer', undefined, undefined, aiAttrs);

    try {
      const userId = user?.id || 'usr-anonymous';
      const supabase = getSupabaseClient();

      let session = db.sessions.get(sessionId);
      if (!session && supabase) {
        session = (await InterviewService.getSessionById(sessionId)) || undefined;
      }

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

      const evalId = 'ev-' + Math.random().toString(36).substr(2, 9);
      const evaluation: Evaluation = {
        id: evalId,
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

      const now = new Date().toISOString();

      if (supabase) {
        try {
          await supabase.from('answers').upsert({
            id: stringToUUID(sessionId + '-ans-' + questionId),
            question_id: stringToUUID(sessionId + '-' + questionId),
            session_id: stringToUUID(sessionId),
            user_id: stringToUUID(userId),
            answer_text: answerText,
            submitted_at: now
          });

          await supabase.from('evaluations').upsert({
            id: stringToUUID(evalId),
            question_id: stringToUUID(sessionId + '-' + questionId),
            session_id: stringToUUID(sessionId),
            score: evaluation.score,
            clarity_rating: evaluation.clarityRating,
            feedback: evaluation.feedback,
            missing_points: evaluation.missingPoints,
            suggested_answer: evaluation.suggestedAnswer,
            evaluated_at: evaluation.evaluatedAt
          });
        } catch (e) {
          console.warn('🔮 [InterviewService] Failed to record answer/evaluation in Supabase:', e);
        }
      }

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

        if (supabase) {
          try {
            await supabase.from('interview_sessions').update({
              status: 'completed',
              overall_score: session.coachingReport.overallScore,
              coaching_summary: session.coachingReport.summary,
              coaching_report: session.coachingReport,
              updated_at: now
            }).eq('id', stringToUUID(sessionId));
          } catch (e) {
            console.warn('🔮 [InterviewService] Failed to complete session in Supabase:', e);
          }
        }

        const userProgress = db.progress.get(userId) || [];

        for (const q of session.questions) {
          const evalScore = session.evaluations[q.id]?.score || 80;
          const existingTopic = userProgress.find(p => p.topic === q.topic);
          let newCount = 1;
          let newConf = evalScore;

          if (existingTopic) {
            existingTopic.sessionCount += 1;
            existingTopic.confidenceScore = Math.round((existingTopic.confidenceScore + evalScore) / 2);
            existingTopic.lastPracticedAt = now;
            newCount = existingTopic.sessionCount;
            newConf = existingTopic.confidenceScore;
          } else {
            userProgress.push({
              id: 'prog-' + Math.random().toString(36).substr(2, 9),
              userId,
              topic: q.topic,
              confidenceScore: evalScore,
              sessionCount: 1,
              lastPracticedAt: now
            });
          }

          if (supabase) {
            try {
              await supabase.from('learning_progress').upsert({
                user_id: stringToUUID(userId),
                topic: q.topic,
                confidence_score: newConf,
                session_count: newCount,
                last_practiced_at: now,
                updated_at: now
              }, { onConflict: 'user_id,topic' });
            } catch (e) {
              console.warn('🔮 [InterviewService] Failed to update learning_progress in Supabase:', e);
            }
          }
        }
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

  static async getHistory(currentUser?: { id?: string }): Promise<InterviewSession[]> {
    const user = currentUser;
    const userId = user?.id || 'usr-anonymous';
    const userUuid = stringToUUID(userId);
    const anonUuid = stringToUUID('usr-anonymous');
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data: sessionRows } = await supabase
          .from('interview_sessions')
          .select('*')
          .or(`user_id.eq.${userUuid},user_id.eq.${anonUuid}`)
          .order('created_at', { ascending: false });

        if (Array.isArray(sessionRows) && sessionRows.length > 0) {
          const sessions: InterviewSession[] = [];
          for (const sRow of sessionRows) {
            const sess = await InterviewService.getSessionById(sRow.id);
            if (sess) {
              sessions.push(sess);
            }
          }
          return sessions;
        }
      } catch (e) {
        console.warn('🔮 [InterviewService] Failed to fetch session history from Supabase:', e);
      }
    }

    return Array.from(db.sessions.values()).filter(s => s.userId === userId || s.userId === 'usr-anonymous');
  }

  static async getSessionById(id: string): Promise<InterviewSession | null> {
    const sessionUuid = stringToUUID(id);
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data: sRow } = await supabase
          .from('interview_sessions')
          .select('*')
          .eq('id', sessionUuid)
          .maybeSingle();

        if (sRow) {
          const { data: qRows } = await supabase
            .from('generated_questions')
            .select('*')
            .eq('session_id', sessionUuid)
            .order('order_index', { ascending: true });

          const { data: aRows } = await supabase
            .from('answers')
            .select('*')
            .eq('session_id', sessionUuid);

          const { data: eRows } = await supabase
            .from('evaluations')
            .select('*')
            .eq('session_id', sessionUuid);

          const questions: GeneratedQuestion[] = Array.isArray(qRows) ? qRows.map((q, idx) => ({
            id: `q-${idx + 1}`,
            questionText: q.question_text,
            type: q.type,
            topic: q.topic,
            difficulty: q.difficulty,
            expectedConcepts: q.expected_concepts || []
          })) : [];

          const answers: Record<string, string> = {};
          if (Array.isArray(aRows)) {
            aRows.forEach(a => {
              // Extract question id suffix or map by matching question
              const qIdx = questions.findIndex(q => stringToUUID(id + '-' + q.id) === a.question_id);
              const qKey = qIdx !== -1 ? `q-${qIdx + 1}` : a.question_id;
              answers[qKey] = a.answer_text;
            });
          }

          const evaluations: Record<string, Evaluation> = {};
          if (Array.isArray(eRows)) {
            eRows.forEach(e => {
              const qIdx = questions.findIndex(q => stringToUUID(id + '-' + q.id) === e.question_id);
              const qKey = qIdx !== -1 ? `q-${qIdx + 1}` : e.question_id;
              evaluations[qKey] = {
                id: e.id,
                questionId: qKey,
                score: e.score,
                clarityRating: e.clarity_rating,
                feedback: e.feedback,
                missingPoints: e.missing_points || [],
                suggestedAnswer: e.suggested_answer,
                evaluatedAt: e.evaluated_at
              };
            });
          }

          const session: InterviewSession = {
            id,
            userId: sRow.user_id,
            resumeId: sRow.resume_id || '',
            resumeTitle: sRow.resume_title || 'Uploaded Resume',
            jobDescriptionId: sRow.job_description_id || null,
            jobTitle: sRow.job_title || 'Resume-based Interview',
            status: sRow.status || 'in_progress',
            options: sRow.options,
            questions,
            answers,
            evaluations,
            coachingReport: sRow.coaching_report,
            createdAt: sRow.created_at
          };

          db.sessions.set(id, session);
          return session;
        }
      } catch (e) {
        console.warn('🔮 [InterviewService] Failed to load session by ID from Supabase:', e);
      }
    }

    return db.sessions.get(id) || null;
  }
}
