import React, { useState } from 'react';
import { 
  History, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Award, 
  HelpCircle, 
  MessageSquare, 
  ChevronRight, 
  Calendar, 
  Sparkles,
  BookOpen,
  XCircle,
  FileText
} from 'lucide-react';
import { InterviewSession, Evaluation } from '../types';

interface InterviewHistoryViewProps {
  sessions: InterviewSession[];
  onSelectSession: (session: InterviewSession) => void;
  onStartNewSession: () => void;
}

export default function InterviewHistoryView({
  sessions,
  onSelectSession,
  onStartNewSession
}: InterviewHistoryViewProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  // Calculate overall impression across all concluded sessions + active session
  const completedSessions = sessions.filter(s => s.status === 'completed' || s.coachingReport);
  const totalScoreSum = completedSessions.reduce((acc, s) => acc + (s.coachingReport?.overallScore || 0), 0);
  const avgOverallScore = completedSessions.length > 0 ? Math.round(totalScoreSum / completedSessions.length) : 0;

  // Extract all weak topics across sessions where score < 70 or in coaching report
  const allWeakTopicsSet = new Set<string>();
  const allStrengthsSet = new Set<string>();

  sessions.forEach(s => {
    if (s.coachingReport?.domainWeaknesses) {
      s.coachingReport.domainWeaknesses.forEach(w => allWeakTopicsSet.add(w));
    }
    if (s.coachingReport?.domainStrengths) {
      s.coachingReport.domainStrengths.forEach(st => allStrengthsSet.add(st));
    }
    Object.entries(s.evaluations || {}).forEach(([qId, ev]) => {
      if (ev && ev.score < 70) {
        const q = s.questions.find(item => item.id === qId);
        if (q?.topic) allWeakTopicsSet.add(q.topic);
      }
    });
  });

  const overallWeakTopics = Array.from(allWeakTopicsSet);
  const overallStrengths = Array.from(allStrengthsSet);

  // Render Session Details View if a session is selected
  if (selectedSession) {
    const report = {
      overallScore: selectedSession.coachingReport?.overallScore,
      domainStrengths: selectedSession.coachingReport?.domainStrengths,
      domainWeaknesses: selectedSession.coachingReport?.domainWeaknesses,
      recommendedTopics: selectedSession.coachingReport?.recommendedTopics,
      summary: selectedSession.coachingReport?.summary
    };

    const questionsList = selectedSession.questions || [];

    // Calculate topics covered in this specific session
    const topicsCovered = Array.from(new Set(questionsList.map(q => q.topic || 'General')));
    
    // Calculate weak topics in this session (score < 70 or explicitly in missing points)
    const sessionWeakTopics = questionsList
      .filter(q => {
        const ev = selectedSession.evaluations?.[q.id];
        return ev && (ev.score < 70 || (ev.missingPoints && ev.missingPoints.length > 0));
      })
      .map(q => ({
        topic: q.topic || 'General',
        score: selectedSession.evaluations?.[q.id]?.score || 60,
        missing: selectedSession.evaluations?.[q.id]?.missingPoints || []
      }));

    // Generate Candidate Overall Impression text
    const candidateImpression = `Based on ${completedSessions.length} total interview session(s) evaluated (Overall Average: ${avgOverallScore || report.overallScore}%), the candidate demonstrates ${
      (avgOverallScore || report.overallScore) >= 85 ? 'exceptional technical mastery and architectural depth' : 'strong foundational skills with clean problem solving'
    }. ${
      overallStrengths.length > 0 ? `Key domain proficiencies include ${overallStrengths.slice(0, 3).join(', ')}. ` : ''
    }${
      sessionWeakTopics.length > 0
        ? `In this session, specific weaknesses were observed in ${sessionWeakTopics.map(w => w.topic).join(', ')}. `
        : ''
    }Recommended focus area prior to live production rounds: ${report.recommendedTopics[0]?.topic || 'Distributed System Design'}.`;

    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedSessionId(null)}
              className="p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
                {selectedSession.jobTitle || selectedSession.resumeTitle || 'Interview Practice Session'}
              </h1>
              <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                  {new Date(selectedSession.createdAt).toLocaleString()}
                </span>
                <span>•</span>
                <span className="uppercase">{selectedSession.options?.interviewType || 'technical'}</span>
                <span>•</span>
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                  selectedSession.status === 'completed'
                    ? 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-800'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                }`}>
                  {selectedSession.status}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onSelectSession(selectedSession)}
            className="bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            Open Evaluation
          </button>
        </div>

        {/* Analytics & Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Overall Score Badge */}
          <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-6 text-center space-y-3 flex flex-col justify-center items-center shadow-sm">
            <div className="w-20 h-20 rounded-full border-4 border-green-500 flex items-center justify-center font-mono text-2xl font-bold text-zinc-900 dark:text-white shadow-lg shadow-green-500/10">
              {report.overallScore}%
            </div>
            <span className="text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Session AI Score</span>
          </div>

          {/* Overall Impression Across Concluded Sessions */}
          <div className="md:col-span-2 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-6 space-y-3 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Overall Candidate Impression & Cumulative Analytics
            </h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans">
              {candidateImpression}
            </p>
          </div>

        </div>

        {/* Covered vs Weak Topics Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Topics Covered */}
          <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] p-5 rounded-xl space-y-3 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Topics Covered ({topicsCovered.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {topicsCovered.map((topic, idx) => (
                <span key={idx} className="bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-xs px-2.5 py-1 rounded-md font-mono">
                  {topic}
                </span>
              ))}
            </div>
          </div>

          {/* Weak Topics / Areas Needing Improvement */}
          <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] p-5 rounded-xl space-y-3 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Weak Topics & Knowledge Gaps
            </h3>
            {sessionWeakTopics.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No significant weak topics detected in this session!</p>
            ) : (
              <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300 font-mono">
                {sessionWeakTopics.map((item, idx) => (
                  <li key={idx} className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-2.5 rounded-md space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-800 dark:text-amber-300">{item.topic}</span>
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">{item.score}% Score</span>
                    </div>
                    {item.missing.length > 0 && (
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">Missing: {item.missing.join(', ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

        {/* List of Questions and Answers */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
            Questions & Submitted Answers ({questionsList.length})
          </h2>

          <div className="space-y-4">
            {questionsList.map((q, idx) => {
              const answer = selectedSession.answers?.[q.id];
              const evaluation: Evaluation | undefined = selectedSession.evaluations?.[q.id];

              return (
                <div key={q.id} className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-5 space-y-4 shadow-sm">
                  
                  {/* Question Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-500 font-bold">Q{idx + 1}.</span>
                        <span className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 text-[10px] px-2 py-0.5 rounded font-mono">
                          {q.topic}
                        </span>
                        <span className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] px-2 py-0.5 rounded font-mono capitalize">
                          {q.difficulty}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-white leading-relaxed pt-1">
                        {q.questionText}
                      </h4>
                    </div>

                    {evaluation && (
                      <div className="text-right shrink-0">
                        <span className={`text-base font-mono font-bold ${
                          evaluation.score >= 80 ? 'text-green-600 dark:text-green-400' : evaluation.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {evaluation.score}/100
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase block font-mono">
                          {evaluation.clarityRating}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Candidate Answer */}
                  <div className="bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-3.5 space-y-1.5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase block font-bold">
                      Your Answer
                    </span>
                    <p className="text-xs text-zinc-800 dark:text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap">
                      {answer || <span className="text-zinc-400 dark:text-zinc-600 italic">No answer submitted for this question.</span>}
                    </p>
                  </div>

                  {/* AI Evaluation & Feedback */}
                  {evaluation && (
                    <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
                      
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono text-green-700 dark:text-green-400 uppercase font-bold block">
                          AI Feedback
                        </span>
                        <p className="text-xs text-zinc-800 dark:text-zinc-300 leading-relaxed">
                          {evaluation.feedback}
                        </p>
                      </div>

                      {evaluation.missingPoints && evaluation.missingPoints.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 uppercase font-bold block">
                            Missing Technical Concepts
                          </span>
                          <ul className="list-disc list-inside text-xs text-zinc-600 dark:text-zinc-400 font-mono space-y-0.5">
                            {evaluation.missingPoints.map((m, mIdx) => (
                              <li key={mIdx}>{m}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {evaluation.suggestedAnswer && (
                        <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-lg p-3 space-y-1">
                          <span className="text-[10px] font-mono text-purple-800 dark:text-purple-300 uppercase font-bold block">
                            Exemplary Model Answer
                          </span>
                          <p className="text-xs text-purple-900 dark:text-purple-200/90 leading-relaxed font-mono">
                            {evaluation.suggestedAnswer}
                          </p>
                        </div>
                      )}

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>

      </div>
    );
  }

  // Render Session List View
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Interview History
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Review past interview practice sessions, analytics, and coaching evaluations.
          </p>
        </div>
        <button
          onClick={onStartNewSession}
          className="bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer"
        >
          + New Interview
        </button>
      </div>

      {/* Candidate Aggregate Overview Card */}
      {completedSessions.length > 0 && (
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-6 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Overall Candidate Impression ({completedSessions.length} Completed Sessions)
            </h3>
            <span className="text-xs font-mono font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950 border border-green-200 dark:border-green-800 px-2.5 py-0.5 rounded">
              Avg Score: {avgOverallScore}%
            </span>
          </div>
          <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans">
            Candidate displays an average confidence rating of <span className="font-bold text-zinc-900 dark:text-white">{avgOverallScore}%</span> across all practice sessions.
            {overallStrengths.length > 0 && ` Demonstrated high mastery in ${overallStrengths.slice(0, 3).join(', ')}.`}
            {overallWeakTopics.length > 0 && ` Main focus areas for upcoming practice: ${overallWeakTopics.slice(0, 3).join(', ')}.`}
          </p>
        </div>
      )}

      {/* Sessions List */}
      <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800/80 shadow-sm">
        {sessions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-xs text-zinc-500">No interview history records found.</p>
            <button
              onClick={onStartNewSession}
              className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-semibold px-4 py-2 rounded-lg text-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Start New Interview
            </button>
          </div>
        ) : (
          sessions.map(s => (
            <div
              key={s.id}
              onClick={() => setSelectedSessionId(s.id)}
              className="p-5 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors cursor-pointer flex items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                    {s.jobTitle || s.resumeTitle || 'Practice Session'}
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                    s.status === 'completed'
                      ? 'bg-green-100 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-400'
                      : 'bg-amber-100 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-400'
                  }`}>
                    {s.status}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono flex items-center gap-3">
                  <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{s.questions.length} Questions</span>
                  <span>•</span>
                  <span className="capitalize">{s.options?.interviewType || 'technical'}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {s.coachingReport && (
                  <div className="text-right">
                    <span className="text-lg font-mono font-bold text-green-600 dark:text-green-400">{s.coachingReport.overallScore}%</span>
                    <span className="text-[10px] text-zinc-500 block">AI Score</span>
                  </div>
                )}
                <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
