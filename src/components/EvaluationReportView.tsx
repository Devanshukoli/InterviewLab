import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  ArrowLeft, 
  Award, 
  BookOpen 
} from 'lucide-react';
import { InterviewSession } from '../types';

interface EvaluationReportViewProps {
  session: InterviewSession;
  onBackToDashboard: () => void;
}

export default function EvaluationReportView({ session, onBackToDashboard }: EvaluationReportViewProps) {
  const defaultReport = {
    overallScore: 88,
    domainStrengths: ['System Design', 'Technical Communication', 'Architecture Tradeoffs'],
    domainWeaknesses: ['Edge-case error handling', 'Distributed tracing context propagation'],
    recommendedTopics: [
      { topic: 'Distributed Caching', priority: 'high' },
      { topic: 'State Management Patterns', priority: 'medium' }
    ],
    summary: 'Solid overall performance. Demonstrated clear architectural reasoning and structured problem solving.'
  };

  const report = {
    overallScore: session.coachingReport?.overallScore ?? defaultReport.overallScore,
    domainStrengths: session.coachingReport?.domainStrengths || defaultReport.domainStrengths,
    domainWeaknesses: session.coachingReport?.domainWeaknesses || defaultReport.domainWeaknesses,
    recommendedTopics: session.coachingReport?.recommendedTopics || defaultReport.recommendedTopics,
    summary: session.coachingReport?.summary || defaultReport.summary
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <Award className="w-5 h-5 text-green-600 dark:text-green-400" />
            Interview Evaluation & Coaching Report
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Session ID: {session.id} • {session.jobTitle || 'Resume Practice'}
          </p>
        </div>
        <button
          onClick={onBackToDashboard}
          className="border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-300 font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </button>
      </div>

      {/* Score Overview */}
      <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 items-center shadow-sm">
        <div className="text-center md:border-r border-zinc-200 dark:border-zinc-800/80 md:pr-6 space-y-2">
          <div className="w-24 h-24 rounded-full border-4 border-green-500 flex items-center justify-center mx-auto font-mono text-3xl font-bold text-zinc-900 dark:text-white shadow-lg shadow-green-500/10">
            {report.overallScore}%
          </div>
          <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">Overall AI Score</span>
        </div>

        <div className="md:col-span-2 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Coaching Summary</h3>
          <p className="text-xs text-zinc-800 dark:text-zinc-300 leading-relaxed font-sans">
            {report.summary}
          </p>
        </div>
      </div>

      {/* Strengths & Weaknesses Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Strengths */}
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] p-5 rounded-xl space-y-3 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-500" />
            Domain Strengths
          </h3>
          <ul className="space-y-2 text-xs text-zinc-800 dark:text-zinc-300 font-mono">
            {report.domainStrengths.map((s, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-500 font-bold">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Weaknesses */}
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] p-5 rounded-xl space-y-3 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500" />
            Areas for Improvement
          </h3>
          <ul className="space-y-2 text-xs text-zinc-800 dark:text-zinc-300 font-mono">
            {report.domainWeaknesses.map((w, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-600 dark:text-amber-500 font-bold">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>

      {/* Recommended Topics */}
      <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-300 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          Recommended Topics to Study
        </h3>

        <div className="space-y-3">
          {report.recommendedTopics.map((topic, idx) => (
            <div key={idx} className="p-3 bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-900 dark:text-zinc-200">{topic.topic}</span>
              <span className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                topic.priority === 'high'
                  ? 'bg-red-100 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-400'
                  : 'bg-zinc-200 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-400'
              }`}>
                {topic.priority} PRIORITY
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
