import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthModal from './components/AuthModal';
import Sidebar, { NavTab } from './components/Sidebar';
import DashboardView from './components/DashboardView';
import NewInterviewFlow from './components/NewInterviewFlow';
import ActiveInterviewSession from './components/ActiveInterviewSession';
import EvaluationReportView from './components/EvaluationReportView';
import InterviewHistoryView from './components/InterviewHistoryView';
import ResumeLibraryView from './components/ResumeLibraryView';
import LearningProgressView from './components/LearningProgressView';
import SettingsView from './components/SettingsView';

import { 
  UserProfile, 
  InterviewSession, 
  SavedResume, 
  ProgressMetric, 
  InterviewOptions 
} from './types';
import { 
  fetchWithAuth, 
  getValidAuthToken, 
  refreshAccessToken, 
  isTokenExpiringSoon, 
  clearAuthTokens,
  logoutUser
} from './lib/auth';

export default function App() {
  // Authentication State
  const [user, setUser] = useState<UserProfile | null>(null);
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  // Application Data States
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [currentSession, setCurrentSession] = useState<InterviewSession | null>(null);
  const [resumes, setResumes] = useState<SavedResume[]>([]);
  const [progress, setProgress] = useState<ProgressMetric[]>([]);

  // Action / Loading States
  const [isGeneratingSession, setIsGeneratingSession] = useState(false);
  const [isEvaluatingAnswer, setIsEvaluatingAnswer] = useState(false);

  // Profile / Billing Modals
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [billingNoticeOpen, setBillingNoticeOpen] = useState(false);

  // Sidebar Collapse State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch (e) {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === '\\' || e.key === 'b')) {
        e.preventDefault();
        handleToggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Helper to attach JWT authorization header to API calls
  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('auth_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  // Initial Fetching & Global Auth Change Listeners
  useEffect(() => {
    checkCurrentUser();
    fetchResumes();
    fetchHistory();
    fetchProgress();

    // Proactive token refresh timer before access token expiration
    const refreshTimer = setInterval(async () => {
      const token = localStorage.getItem('auth_token');
      if (token && isTokenExpiringSoon(token, 180)) {
        const refreshed = await refreshAccessToken();
        if (!refreshed && !localStorage.getItem('auth_token')) {
          setUser(null);
        }
      }
    }, 45000); // Check every 45 seconds

    // Listen for storage changes across tabs/popups
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token' || e.key === 'refresh_token' || e.key === 'oauth_auth_success') {
        checkCurrentUser();
      }
    };

    // Listen for BroadcastChannel oauth events
    let bc: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('oauth_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
            checkCurrentUser();
          }
        };
      }
    } catch (e) {}

    const handleAuthLogout = () => {
      setUser(null);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth_logout', handleAuthLogout);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth_logout', handleAuthLogout);
      clearInterval(refreshTimer);
      if (bc) bc.close();
    };
  }, []);

  const checkCurrentUser = async () => {
    try {
      const res = await fetchWithAuth('/api/auth/me');
      if (res.status === 401) {
        clearAuthTokens();
        setUser(null);
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setUser(json.data);
      } else {
        clearAuthTokens();
        setUser(null);
      }
    } catch (e) {
      clearAuthTokens();
      setUser(null);
    }
  };

  const fetchResumes = async () => {
    try {
      const res = await fetchWithAuth('/api/resumes');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setResumes(json.data);
      } else {
        setResumes([]);
      }
    } catch (e) {
      setResumes([]);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetchWithAuth('/api/interview/history');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSessions(json.data);
      } else {
        setSessions([]);
      }
    } catch (e) {
      setSessions([]);
    }
  };

  const fetchProgress = async () => {
    try {
      const res = await fetchWithAuth('/api/progress');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setProgress(json.data);
      } else {
        setProgress([]);
      }
    } catch (e) {
      setProgress([]);
    }
  };

  // Start New Session handler
  const handleStartSession = async ({
    resumeId,
    resumeText,
    jobDescriptionText,
    options
  }: {
    resumeId: string;
    resumeText?: string;
    jobDescriptionText?: string;
    options: InterviewOptions;
  }) => {
    setIsGeneratingSession(true);

    try {
      let activeJdId: string | undefined = undefined;

      // If JD text provided, upload it first
      if (jobDescriptionText && jobDescriptionText.trim()) {
        const jRes = await fetch('/api/interview/upload-job-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ text: jobDescriptionText })
        });
        const jJson = await jRes.json();
        if (jJson.success) {
          activeJdId = jJson.data.id;
        }
      }

      // Generate Questions
      const qRes = await fetch('/api/interview/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          resumeId,
          jobDescriptionId: activeJdId,
          experienceLevel: options.experienceLevel,
          interviewType: options.interviewType,
          numberOfQuestions: options.numberOfQuestions,
          difficulty: options.difficulty
        })
      });

      const qJson = await qRes.json();
      if (qJson.success) {
        setCurrentSession(qJson.data);
        setActiveTab('active-session');
        fetchHistory();
      }
    } catch (err: any) {
      alert('Error generating interview session: ' + err.message);
    } finally {
      setIsGeneratingSession(false);
    }
  };

  // Answer Submission Handler
  const handleAnswerSubmit = async (questionId: string, answerText: string) => {
    if (!currentSession) return;
    setIsEvaluatingAnswer(true);

    try {
      const res = await fetch('/api/interview/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          sessionId: currentSession.id,
          questionId,
          answerText
        })
      });

      const json = await res.json();
      if (json.success) {
        setCurrentSession(json.data.session);
        fetchHistory();
        fetchProgress();
      }
    } catch (e: any) {
      console.error('Evaluation error:', e);
    } finally {
      setIsEvaluatingAnswer(false);
    }
  };

  // Upload Resume to Library (supports text or file)
  const handleUploadResume = async (
    payload: { text?: string; file?: File }, 
    title: string
  ) => {
    try {
      if (payload.file) {
        const formData = new FormData();
        formData.append('file', payload.file);
        formData.append('title', title);

        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/interview/upload-resume-file', {
          method: 'POST',
          headers,
          body: formData
        });
        const json = await res.json();
        if (json.success) {
          setResumes(prev => [json.data, ...prev]);
        } else {
          throw new Error(json.message || 'File upload failed');
        }
      } else {
        const res = await fetch('/api/interview/upload-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ text: payload.text || '', title })
        });
        const json = await res.json();
        if (json.success) {
          setResumes(prev => [json.data, ...prev]);
        }
      }
    } catch (e: any) {
      console.warn('Resume upload notice:', e);
      // Local fallback
      const now = new Date().toISOString();
      const ext = payload.file ? payload.file.name.split('.').pop()?.toLowerCase() : 'text';
      const fileType = (ext === 'pdf' ? 'pdf' : ext === 'docx' || ext === 'doc' ? 'docx' : 'text') as any;

      const newR: SavedResume = {
        id: crypto.randomUUID(),
        title,
        text: payload.text || (payload.file ? `[Uploaded File: ${payload.file.name}] (${Math.round(payload.file.size / 1024)} KB)` : 'Resume Content'),
        skills: ['TypeScript', 'React', 'System Architecture'],
        uploadedAt: now,
        updatedAt: now,
        fileType,
        fileName: payload.file?.name,
        fileSize: payload.file?.size
      };
      setResumes(prev => [newR, ...prev]);
    }
  };

  // Edit / Update Resume in Library
  const handleUpdateResume = async (
    id: string,
    payload: { title: string; text?: string; file?: File }
  ) => {
    try {
      if (payload.file) {
        const formData = new FormData();
        formData.append('file', payload.file);
        formData.append('title', payload.title);

        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/interview/resume/${id}`, {
          method: 'PUT',
          headers,
          body: formData
        });
        const json = await res.json();
        if (json.success) {
          setResumes(prev => prev.map(r => r.id === id ? json.data : r));
        }
      } else {
        const res = await fetch(`/api/interview/resume/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ title: payload.title, text: payload.text })
        });
        const json = await res.json();
        if (json.success) {
          setResumes(prev => prev.map(r => r.id === id ? json.data : r));
        }
      }
    } catch (e: any) {
      console.warn('Resume update notice:', e);
      setResumes(prev => prev.map(r => {
        if (r.id === id) {
          return {
            ...r,
            title: payload.title,
            text: payload.text !== undefined ? payload.text : r.text,
            fileName: payload.file ? payload.file.name : r.fileName,
            fileSize: payload.file ? payload.file.size : r.fileSize,
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      }));
    }
  };

  // Delete Resume from Library
  const handleDeleteResume = async (id: string) => {
    try {
      await fetch(`/api/resumes/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      setResumes(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      setResumes(prev => prev.filter(r => r.id !== id));
    }
  };

  // Update Profile
  const handleUpdateUser = async (updatedFields: Partial<UserProfile>) => {
    if (!user) return;
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFields)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || json.message || 'Failed to save settings');
    }
    if (json.data) {
      setUser(prev => prev ? { ...prev, ...json.data } : json.data);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
  };

  // Unauthenticated View -> Render Landing Page
  if (!user) {
    return (
      <>
        <LandingPage
          onGetStarted={() => setIsAuthModalOpen(true)}
          onSignIn={() => setIsAuthModalOpen(true)}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={(loggedUser) => {
            setUser(loggedUser);
            setActiveTab('dashboard');
            fetchResumes();
            fetchHistory();
            fetchProgress();
          }}
        />
      </>
    );
  }

  // Authenticated View
  return (
    <div className="flex h-screen w-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden transition-colors duration-200">
      
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenBilling={() => setBillingNoticeOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50 dark:bg-[#09090b] transition-colors duration-200">
        
        {/* Header Bar */}
        <header className="h-14 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between px-6 bg-white dark:bg-[#09090b] shrink-0 transition-colors duration-200">
          <div className="flex items-center gap-3">
            <div className="text-xs text-zinc-500 font-mono">
              InterviewOps / <span className="text-zinc-900 dark:text-zinc-200 font-semibold">{activeTab.toUpperCase()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('new-session')}
              className="bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black text-xs font-bold px-4 py-1.5 rounded-lg transition-all cursor-pointer shadow-sm active:scale-95"
            >
              + New Interview
            </button>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          
          {activeTab === 'dashboard' && (
            <DashboardView
              user={user}
              sessions={sessions}
              resumes={resumes}
              progress={progress}
              currentSession={currentSession}
              onStartNewInterview={() => setActiveTab('new-session')}
              onContinueSession={(session) => {
                setCurrentSession(session);
                setActiveTab('active-session');
              }}
              onViewResumes={() => setActiveTab('resumes')}
              onViewProgress={() => setActiveTab('progress')}
              onViewHistory={() => setActiveTab('history')}
              onSelectSession={(session) => {
                setCurrentSession(session);
                setActiveTab(session.status === 'completed' ? 'evaluation' : 'active-session');
              }}
            />
          )}

          {activeTab === 'new-session' && (
            <NewInterviewFlow
              savedResumes={resumes}
              onStartSession={handleStartSession}
              isLoading={isGeneratingSession}
            />
          )}

          {activeTab === 'active-session' && currentSession && (
            <ActiveInterviewSession
              session={currentSession}
              onAnswerSubmit={handleAnswerSubmit}
              onCompleteSession={() => setActiveTab('evaluation')}
              isEvaluating={isEvaluatingAnswer}
            />
          )}

          {activeTab === 'evaluation' && currentSession && (
            <EvaluationReportView
              session={currentSession}
              onBackToDashboard={() => setActiveTab('dashboard')}
            />
          )}

          {activeTab === 'history' && (
            <InterviewHistoryView
              sessions={sessions}
              onSelectSession={(session) => {
                setCurrentSession(session);
                setActiveTab(session.status === 'completed' ? 'evaluation' : 'active-session');
              }}
              onStartNewSession={() => setActiveTab('new-session')}
            />
          )}

          {activeTab === 'resumes' && (
            <ResumeLibraryView
              resumes={resumes}
              onUploadResume={handleUploadResume}
              onUpdateResume={handleUpdateResume}
              onDeleteResume={handleDeleteResume}
              onSelectResumeForSession={(resumeId) => {
                setActiveTab('new-session');
              }}
            />
          )}

          {activeTab === 'progress' && (
            <LearningProgressView
              progress={progress}
              onRefresh={fetchProgress}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              user={user}
              onUpdateUser={handleUpdateUser}
            />
          )}

        </main>

      </div>

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#0c0c0e] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">User Profile</h2>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between p-2 bg-zinc-100 dark:bg-[#09090b] rounded border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500">Name</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{user?.name}</span>
              </div>
              <div className="flex justify-between p-2 bg-zinc-100 dark:bg-[#09090b] rounded border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500">Email</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{user?.email}</span>
              </div>
              <div className="flex justify-between p-2 bg-zinc-100 dark:bg-[#09090b] rounded border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500">Role</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold uppercase">{user?.role}</span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Billing Coming Soon Modal */}
      {billingNoticeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#0c0c0e] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-4 text-center shadow-xl">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Pro Billing (Coming Soon)</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              InterviewOps is currently free during beta access. Pro subscriptions will offer priority multi-agent LLM routing and collaborative team practice rooms.
            </p>
            <button
              onClick={() => setBillingNoticeOpen(false)}
              className="bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-bold px-5 py-2 rounded-lg cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
