import React from 'react';
import { 
  Sparkles, 
  Play, 
  FileText, 
  TrendingUp, 
  History, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Users, 
  Bot, 
  CreditCard, 
  Code2, 
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { InterviewSession, SavedResume, ProgressMetric, UserProfile } from '../types';

interface DashboardViewProps {
  user: UserProfile | null;
  sessions: InterviewSession[];
  resumes: SavedResume[];
  progress: ProgressMetric[];
  currentSession: InterviewSession | null;
  onStartNewInterview: () => void;
  onContinueSession: (session: InterviewSession) => void;
  onViewResumes: () => void;
  onViewProgress: () => void;
  onViewHistory: () => void;
  onSelectSession: (session: InterviewSession) => void;
}

export default function DashboardView({
  user,
  sessions,
  resumes,
  progress,
  currentSession,
  onStartNewInterview,
  onContinueSession,
  onViewResumes,
  onViewProgress,
  onViewHistory,
  onSelectSession
}: DashboardViewProps) {

  // Calculate quick stats
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const avgScore = completedSessions.length > 0 
    ? Math.round(completedSessions.reduce((acc, s) => acc + (s.coachingReport?.overallScore || 0), 0) / completedSessions.length)
    : 0;

  const inProgressSession = currentSession?.status === 'in_progress' 
    ? currentSession 
    : sessions.find(s => s.status === 'in_progress');

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      
      {/* 1. Welcome Card */}
      <div className="border border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 dark:from-zinc-950 dark:via-[#0c0c0e] dark:to-zinc-950 rounded-xl p-6 sm:p-8 relative overflow-hidden shadow-sm">
        <div className="max-w-2xl space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700 text-[10px] font-mono text-zinc-300">
            <Sparkles className="w-3 h-3 text-blue-400" />
            <span>Welcome back, {user?.name || 'Candidate'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Elevate your interview performance with AI AI Coaching
          </h1>
          <p className="text-xs sm:text-sm text-zinc-300 dark:text-zinc-400 leading-relaxed">
            InterviewOps analyzes your resume against target roles, generates realistic technical & behavioral scenarios, and delivers detailed domain evaluations.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button 
              onClick={onStartNewInterview}
              className="bg-white text-black text-xs font-semibold px-5 py-2.5 rounded-lg hover:bg-zinc-200 transition-all flex items-center gap-2 cursor-pointer shadow-md active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              Start New Interview
            </button>
            <button 
              onClick={onViewResumes}
              className="border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-4 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
            >
              <FileText className="w-3.5 h-3.5 text-zinc-300" />
              Manage Resume Library ({resumes.length})
            </button>
          </div>
        </div>
      </div>

      {/* 2. Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0c0c0e] shadow-sm space-y-1">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Total Sessions</span>
          <div className="text-2xl font-mono font-bold text-zinc-900 dark:text-white">{sessions.length}</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0c0c0e] shadow-sm space-y-1">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Average Score</span>
          <div className="text-2xl font-mono font-bold text-green-600 dark:text-green-400">
            {completedSessions.length > 0 ? `${avgScore}%` : '--'}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0c0c0e] shadow-sm space-y-1">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Saved Resumes</span>
          <div className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400">{resumes.length}</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0c0c0e] shadow-sm space-y-1">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Topics Mastered</span>
          <div className="text-2xl font-mono font-bold text-purple-600 dark:text-purple-400">{progress.length}</div>
        </div>
      </div>

      {/* 3. Continue Previous Interview Card (if active session exists) */}
      {inProgressSession && (
        <div className="p-5 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-300">In-Progress Interview Session</span>
                <span className="text-[9px] font-mono bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded font-bold">UNFINISHED</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                {inProgressSession.jobTitle || 'Resume Practice'} • {inProgressSession.questions.length} Questions
              </p>
            </div>
          </div>
          <button 
            onClick={() => onContinueSession(inProgressSession)}
            className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-5 py-2 rounded-lg transition-all cursor-pointer shrink-0 shadow-sm"
          >
            Resume Interview
          </button>
        </div>
      )}

      {/* 4. Split Grid: Previous Sessions & Resume Library */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Previous Interview Sessions (2 cols) */}
        <div className="lg:col-span-2 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">Previous Interview Sessions</h2>
            </div>
            <button 
              onClick={onViewHistory}
              className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
            >
              View All <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 flex-1">
            {sessions.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-zinc-500">No previous interview sessions recorded yet.</p>
                <button 
                  onClick={onStartNewInterview}
                  className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-xs font-semibold px-4 py-2 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-300 cursor-pointer"
                >
                  Start Your First Session
                </button>
              </div>
            ) : (
              sessions.slice(0, 4).map(session => (
                <div 
                  key={session.id}
                  onClick={() => onSelectSession(session)}
                  className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors cursor-pointer flex items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 truncate">
                        {session.jobTitle || session.resumeTitle || 'Practice Interview'}
                      </span>
                      <span className={`text-[9px] font-mono px-2 py-0.5 rounded ${
                        session.status === 'completed'
                          ? 'bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 font-bold'
                          : 'bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 font-bold'
                      }`}>
                        {session.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-3">
                      <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{session.questions.length} Questions ({session.options?.interviewType || 'technical'})</span>
                    </div>
                  </div>

                  {session.status === 'completed' && session.coachingReport && (
                    <div className="text-right shrink-0">
                      <span className="text-sm font-mono font-bold text-green-600 dark:text-green-400">{session.coachingReport.overallScore}%</span>
                      <span className="text-[10px] text-zinc-500 block">Overall Score</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Resume Library Quick Panel (1 col) */}
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">Resume Library</h2>
            </div>
            <button 
              onClick={onViewResumes}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-semibold"
            >
              Library
            </button>
          </div>

          <div className="p-4 space-y-3 flex-1">
            {resumes.length === 0 ? (
              <div className="p-6 text-center space-y-2 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-lg">
                <p className="text-xs text-zinc-500">No resumes saved in library.</p>
                <button 
                  onClick={onViewResumes}
                  className="text-xs text-zinc-900 dark:text-white font-semibold hover:underline cursor-pointer"
                >
                  Upload Resume
                </button>
              </div>
            ) : (
              resumes.slice(0, 3).map(resume => (
                <div key={resume.id} className="p-3 bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 truncate">{resume.title}</span>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase">{resume.fileType}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {resume.skills.slice(0, 3).map((skill, idx) => (
                      <span key={idx} className="text-[9px] font-mono bg-zinc-200 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-400 px-1.5 py-0.5 rounded">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 5. Learning Progress Overview & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Learning Progress Cards (2 cols) */}
        <div className="lg:col-span-2 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">Learning Progress & Confidence</h2>
            </div>
            <button onClick={onViewProgress} className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer">
              View Detailed Metrics
            </button>
          </div>

          <div className="space-y-3">
            {progress.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Complete interview sessions to view topic confidence levels.</p>
            ) : (
              progress.map(item => (
                <div key={item.id} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-zinc-800 dark:text-zinc-300 font-medium">{item.topic}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">{item.confidenceScore}% Confidence</span>
                  </div>
                  <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-2 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <div 
                      className="bg-purple-600 dark:bg-purple-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${item.confidenceScore}%` }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity Timeline (1 col) */}
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-5 space-y-4 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
            Recent Activity
          </h2>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-start gap-3 border-l-2 border-blue-500 pl-3 py-1">
              <div>
                <span className="text-zinc-900 dark:text-zinc-200 block text-xs font-sans font-medium">Resume Uploaded</span>
                <span className="text-[10px] text-zinc-500">2 hours ago</span>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-2 border-green-500 pl-3 py-1">
              <div>
                <span className="text-zinc-900 dark:text-zinc-200 block text-xs font-sans font-medium">Practice Interview Completed</span>
                <span className="text-[10px] text-zinc-500">Yesterday</span>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-2 border-zinc-400 dark:border-zinc-700 pl-3 py-1">
              <div>
                <span className="text-zinc-900 dark:text-zinc-200 block text-xs font-sans font-medium">Account Profile Updated</span>
                <span className="text-[10px] text-zinc-500">3 days ago</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 6. Placeholders for Future Features */}
      <div className="pt-4 space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500 font-bold">Planned Capabilities</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/30 opacity-80 hover:opacity-100 transition-opacity space-y-2 relative shadow-sm">
            <span className="absolute top-3 right-3 text-[9px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded">SOON</span>
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Team Workspace</div>
            <p className="text-[10px] text-zinc-500">Collaborative mock interview rooms for engineering teams.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/30 opacity-80 hover:opacity-100 transition-opacity space-y-2 relative shadow-sm">
            <span className="absolute top-3 right-3 text-[9px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded">SOON</span>
            <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Live AI Audio Coach</div>
            <p className="text-[10px] text-zinc-500">Real-time voice synthesis interviews via WebSocket streams.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/30 opacity-80 hover:opacity-100 transition-opacity space-y-2 relative shadow-sm">
            <span className="absolute top-3 right-3 text-[9px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded">SOON</span>
            <CreditCard className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Pro Billing Tiers</div>
            <p className="text-[10px] text-zinc-500">Unlimited sessions and priority multi-agent LLM routing.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/30 opacity-80 hover:opacity-100 transition-opacity space-y-2 relative shadow-sm">
            <span className="absolute top-3 right-3 text-[9px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded">SOON</span>
            <Code2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-300">Prompt Templates</div>
            <p className="text-[10px] text-zinc-500">Custom persona templates for targeted FAANG interview rounds.</p>
          </div>

        </div>
      </div>

    </div>
  );
}
