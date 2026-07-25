import React, { useState, useEffect } from 'react';
import { 
  User, 
  Sun, 
  Moon, 
  Monitor, 
  ShieldCheck, 
  Key, 
  Bell, 
  Lock, 
  Trash2, 
  Check, 
  Eye, 
  EyeOff,
  Laptop,
  Loader2,
  QrCode,
  Copy,
  AlertCircle,
  RefreshCw,
  Download,
  Database,
  FileText
} from 'lucide-react';
import { UserProfile } from '../types';
import { applyTheme, getStoredTheme } from '../lib/theme';
import { logoutUser } from '../lib/auth';

interface SettingsViewProps {
  user: UserProfile | null;
  onUpdateUser: (updatedFields: Partial<UserProfile>) => void;
}

interface UserSession {
  id: string;
  userId: string;
  token: string;
  ipAddress: string;
  userAgent: string;
  deviceType: string;
  createdAt: string;
  lastActiveAt: string;
  isActive: boolean;
}

export default function SettingsView({ user, onUpdateUser }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'security' | 'developer' | 'notifications' | 'privacy' | 'danger'>('general');

  // General Settings
  const [name, setName] = useState(user?.name || 'Devanshu Koli');
  const [email, setEmail] = useState(user?.email || 'architect@interviewops.io');

  // Appearance
  const [appearance, setAppearance] = useState<'light' | 'dark' | 'system'>(() => user?.appearance || getStoredTheme());

  // Security & 2FA State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [isChangingPass, setIsChangingPass] = useState(false);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled || false);
  const [setup2FAData, setSetup2FAData] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Developer API Keys
  const [geminiKey, setGeminiKey] = useState(user?.apiKeys?.gemini || '');
  const [openaiKey, setOpenaiKey] = useState(user?.apiKeys?.openai || '');
  const [anthropicKey, setAnthropicKey] = useState(user?.apiKeys?.anthropic || '');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Notifications
  const [emailSummaries, setEmailSummaries] = useState(user?.notifications?.emailSummaries ?? true);
  const [practiceReminders, setPracticeReminders] = useState(user?.notifications?.practiceReminders ?? true);
  const [productUpdates, setProductUpdates] = useState(user?.notifications?.productUpdates ?? false);

  // Privacy & Data Control States
  const [dataRetentionDays, setDataRetentionDays] = useState(user?.privacy?.dataRetentionDays ?? 0);
  const [anonymousAIUsage, setAnonymousAIUsage] = useState(user?.privacy?.anonymousAIUsage ?? false);
  const [allowTelemetry, setAllowTelemetry] = useState(user?.privacy?.allowTelemetry ?? true);
  const [searchHistoryCleared, setSearchHistoryCleared] = useState(user?.privacy?.searchHistoryCleared ?? false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [isClearingData, setIsClearingData] = useState<string | null>(null);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete Account States
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setAppearance(user.appearance || 'system');
      applyTheme(user.appearance || 'system');
      setTwoFactorEnabled(user.twoFactorEnabled || false);
      setGeminiKey(user.apiKeys?.gemini || '');
      setOpenaiKey(user.apiKeys?.openai || '');
      setAnthropicKey(user.apiKeys?.anthropic || '');
      setEmailSummaries(user.notifications?.emailSummaries ?? true);
      setPracticeReminders(user.notifications?.practiceReminders ?? true);
      setProductUpdates(user.notifications?.productUpdates ?? false);
      setDataRetentionDays(user.privacy?.dataRetentionDays ?? 0);
      setAnonymousAIUsage(user.privacy?.anonymousAIUsage ?? false);
      setAllowTelemetry(user.privacy?.allowTelemetry ?? true);
      setSearchHistoryCleared(user.privacy?.searchHistoryCleared ?? false);
    } else {
      applyTheme(getStoredTheme());
    }
  }, [user]);

  const handleExportData = async () => {
    setIsExporting(true);
    setExportSuccess(null);
    setExportError(null);
    try {
      const res = await fetch('/api/profile/export', {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        throw new Error('Failed to fetch data export');
      }
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interviewops_data_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccess('Your personal data has been exported successfully!');
      setTimeout(() => setExportSuccess(null), 5000);
    } catch (err: any) {
      setExportError(err.message || 'An error occurred during data export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearCategory = async (category: 'resumes' | 'sessions' | 'usages' | 'logins' | 'cache') => {
    const confirmMessages = {
      resumes: 'Are you sure you want to permanently delete ALL your uploaded resume files? This cannot be undone.',
      sessions: 'Are you sure you want to permanently delete ALL your practice/interview evaluation sessions? This cannot be undone.',
      usages: 'Are you sure you want to permanently anonymize and clear your AI usage history?',
      logins: 'Are you sure you want to permanently anonymize your login history?',
      cache: 'Are you sure you want to clear your local practice/search cache?'
    };

    if (!confirm(confirmMessages[category])) {
      return;
    }

    setIsClearingData(category);
    setClearSuccess(null);
    setClearError(null);

    try {
      const res = await fetch('/api/profile/privacy/clear', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ category })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Data clearance failed.');
      }

      if (category === 'cache') {
        setSearchHistoryCleared(true);
      }

      setClearSuccess(`Successfully cleared/anonymized associated data for category: ${category}.`);
      setTimeout(() => setClearSuccess(null), 5000);
    } catch (err: any) {
      setClearError(err.message || 'An error occurred during data clearance.');
    } finally {
      setIsClearingData(null);
    }
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('auth_token');
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  };

  // Fetch active sessions when security tab is opened
  useEffect(() => {
    if (activeTab === 'security') {
      fetchSessions();
    }
  }, [activeTab]);

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await fetch('/api/auth/sessions', {
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSessions(json.data);
      }
    } catch (e) {
      // Fallback local display
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleAppearanceChange = (mode: 'light' | 'dark' | 'system') => {
    setAppearance(mode);
    applyTheme(mode);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);
    if (!currentPassword || !newPassword) {
      setPassError('Please enter both current and new password');
      return;
    }
    if (newPassword.length < 8) {
      setPassError('New password must be at least 8 characters long');
      return;
    }
    setIsChangingPass(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to update password');
      }
      setPassSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPassError(err.message || 'Password update failed');
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleStart2FASetup = async () => {
    setTotpError(null);
    setIsSettingUp2FA(true);
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSetup2FAData(json.data);
      } else {
        throw new Error('Failed to initiate 2FA setup');
      }
    } catch (err: any) {
      setTotpError(err.message || 'Failed to initialize 2FA');
    } finally {
      setIsSettingUp2FA(false);
    }
  };

  const handleVerify2FACode = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpError(null);
    if (!totpCode || totpCode.length !== 6) {
      setTotpError('Please enter a valid 6-digit code');
      return;
    }
    setIsVerifying2FA(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ code: totpCode })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Invalid verification code');
      }
      setTwoFactorEnabled(true);
      if (json.data?.backupCodes) {
        setBackupCodes(json.data.backupCodes);
      }
      setSetup2FAData(null);
      setTotpCode('');
      onUpdateUser({ twoFactorEnabled: true });
    } catch (err: any) {
      setTotpError(err.message || 'Verification failed');
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!confirm('Are you sure you want to disable Two-Factor Authentication? Your account will be less secure.')) {
      return;
    }
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success) {
        setTwoFactorEnabled(false);
        setBackupCodes([]);
        setSetup2FAData(null);
        onUpdateUser({ twoFactorEnabled: false });
      }
    } catch (err) {
      alert('Failed to disable 2FA');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
    } catch (err) {
      alert('Failed to revoke session');
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);

    // Validate confirmation text
    const cleanConfirmText = deleteConfirmText.trim().toUpperCase();
    const cleanUserEmail = user?.email?.trim().toUpperCase();

    if (cleanConfirmText !== 'DELETE' && cleanConfirmText !== cleanUserEmail) {
      setDeleteError(`Please type 'DELETE' or your exact email address (${user?.email}) to confirm.`);
      return;
    }

    setIsDeleting(true);

    try {
      const res = await fetch('/api/profile', {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password: deletePassword })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Account deletion failed.');
      }

      // Successful deletion - log out and redirect
      await logoutUser();
    } catch (err: any) {
      setDeleteError(err.message || 'An error occurred during account deletion.');
      setIsDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onUpdateUser({
        name,
        email,
        appearance,
        twoFactorEnabled,
        apiKeys: {
          gemini: geminiKey,
          openai: openaiKey,
          anthropic: anthropicKey
        },
        notifications: {
          emailSummaries,
          practiceReminders,
          productUpdates
        },
        privacy: {
          dataRetentionDays,
          anonymousAIUsage,
          allowTelemetry,
          searchHistoryCleared
        }
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">Account & Platform Settings</h1>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Configure user profile, security preferences, and developer API keys.</p>
      </div>

      {savedSuccess && (
        <div className="p-4 bg-green-50 dark:bg-green-950/80 border border-green-200 dark:border-green-800 rounded-xl text-xs font-mono text-green-800 dark:text-green-300 flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          <span>Settings saved successfully.</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 rounded-xl text-xs font-mono text-red-800 dark:text-red-300 flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Settings Navigation Menu */}
        <div className="space-y-1">
          {[
            { id: 'general', label: 'General', icon: User },
            { id: 'appearance', label: 'Appearance', icon: Moon },
            { id: 'security', label: 'Security & 2FA', icon: ShieldCheck },
            { id: 'developer', label: 'Developer API Keys', icon: Key },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'privacy', label: 'Privacy & Data', icon: Lock },
            { id: 'danger', label: 'Delete Account', icon: Trash2 }
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer text-left ${
                  isActive
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${item.id === 'danger' ? 'text-red-500 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}`} />
                <span className={item.id === 'danger' ? 'text-red-600 dark:text-red-400' : ''}>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Settings Form Body (3 cols) */}
        <div className="md:col-span-3 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-6 space-y-6 shadow-sm">
          
          <form onSubmit={handleSave} className="space-y-6">
            
            {/* 1. GENERAL */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/80 pb-2">General Profile</h2>
                
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Display Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
            )}

            {/* 2. APPEARANCE */}
            {activeTab === 'appearance' && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/80 pb-2">Appearance Settings</h2>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'light', label: 'Light Mode', icon: Sun },
                    { id: 'dark', label: 'Dark Mode', icon: Moon },
                    { id: 'system', label: 'System Sync', icon: Monitor }
                  ].map(item => {
                    const Icon = item.icon;
                    const isSelected = appearance === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAppearanceChange(item.id as any)}
                        className={`p-4 rounded-xl border text-xs flex flex-col items-center gap-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-white dark:bg-zinc-800 dark:text-white font-bold shadow-sm'
                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090b] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. SECURITY & 2FA */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/80 pb-2">Security & Authentication</h2>

                {/* Password Change Form */}
                <div className="space-y-3">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-300 block">Change Password</span>
                  {passError && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{passError}</span>
                    </div>
                  )}
                  {passSuccess && (
                    <div className="p-2.5 bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-800 rounded-lg text-xs text-green-700 dark:text-green-300 flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{passSuccess}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <input
                      type="password"
                      placeholder="Current Password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <input
                      type="password"
                      placeholder="New Password (min. 8 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleChangePassword}
                      disabled={isChangingPass}
                      className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                    >
                      {isChangingPass ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      <span>Update Password</span>
                    </button>
                  </div>
                </div>

                {/* 2FA Section */}
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-zinc-900 dark:text-white block">Two-Factor Authentication (TOTP 2FA)</span>
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-400">Secure your account with Google Authenticator, 1Password, or Authy.</span>
                    </div>
                    {twoFactorEnabled ? (
                      <span className="text-[10px] bg-green-100 dark:bg-green-950/80 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                        <Check className="w-3 h-3" /> ENABLED
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStart2FASetup}
                        disabled={isSettingUp2FA}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isSettingUp2FA ? <Loader2 className="w-3 h-3 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                        <span>Setup 2FA</span>
                      </button>
                    )}
                  </div>

                  {/* 2FA Setup Flow Drawer */}
                  {setup2FAData && !twoFactorEnabled && (
                    <div className="p-6 bg-zinc-50 dark:bg-[#09090b] border border-blue-200 dark:border-blue-900/60 rounded-xl space-y-6 animate-fadeIn">
                      <div className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 pb-3">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Scan QR Code or Enter Key</span>
                        <button type="button" onClick={() => setSetup2FAData(null)} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancel</button>
                      </div>

                      {/* Prominent Centered QR Code Box */}
                      <div className="flex flex-col items-center justify-center space-y-4 text-center">
                        <div className="p-6 bg-white rounded-2xl border border-zinc-200 shadow-xl flex flex-col items-center justify-center mx-auto">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(setup2FAData.uri)}`} 
                            alt="2FA QR Code" 
                            className="w-64 h-64 sm:w-80 sm:h-80 object-contain p-2 bg-white rounded-lg"
                          />
                          <span className="text-xs font-bold text-zinc-800 mt-3 flex items-center justify-center gap-1.5">
                            <QrCode className="w-4 h-4 text-blue-600" /> Scan with Authenticator App
                          </span>
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md leading-relaxed">
                          Open <strong>Google Authenticator</strong>, <strong>1Password</strong>, or <strong>Authy</strong> on your mobile device, scan the QR code above, and enter the generated 6-digit verification code below.
                        </p>

                        {/* Manual Secret Key */}
                        <div className="w-full max-w-md space-y-1.5 text-left bg-zinc-100 dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block uppercase tracking-wider">Manual Secret Key</span>
                          <div className="flex items-center justify-between font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-wider">
                            <span className="break-all select-all">{setup2FAData.secret}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(setup2FAData.secret);
                                setCopiedSecret(true);
                                setTimeout(() => setCopiedSecret(false), 2000);
                              }}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0 ml-2"
                            >
                              {copiedSecret ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedSecret ? 'Copied!' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Verification Form */}
                      <form onSubmit={handleVerify2FACode} className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="6-digit code (e.g. 123456)"
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                          className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 font-mono text-center tracking-widest w-full sm:w-52 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="submit"
                          disabled={isVerifying2FA || totpCode.length < 6}
                          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isVerifying2FA ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          <span>Verify & Enable</span>
                        </button>
                      </form>

                      {totpError && (
                        <p className="text-xs text-red-600 dark:text-red-400 font-mono text-center">{totpError}</p>
                      )}
                    </div>
                  )}

                  {/* Backup Codes Modal / Display */}
                  {backupCodes.length > 0 && (
                    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white">Save Backup Recovery Codes</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(backupCodes.join('\n'));
                            setCopiedCodes(true);
                            setTimeout(() => setCopiedCodes(false), 2000);
                          }}
                          className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> {copiedCodes ? 'Copied!' : 'Copy All'}
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Store these single-use recovery codes in a safe password manager. If you lose access to your phone, these are the only way to recover access.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-zinc-300 bg-black/50 p-3 rounded-lg border border-zinc-800">
                        {backupCodes.map((code, idx) => (
                          <div key={idx} className="p-1 bg-zinc-900 rounded text-center">{code}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {twoFactorEnabled && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleDisable2FA}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                      >
                        Disable Two-Factor Authentication
                      </button>
                    </div>
                  )}
                </div>

                {/* Active Sessions Manager */}
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white block">Active Logged-In Sessions</span>
                    <button type="button" onClick={fetchSessions} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                  </div>

                  {isLoadingSessions ? (
                    <div className="p-4 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading sessions...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sessions.map(sess => (
                        <div key={sess.id} className="p-3 bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2.5">
                            <Laptop className="w-4 h-4 text-zinc-500 shrink-0" />
                            <div>
                              <span className="text-zinc-800 dark:text-zinc-200 font-semibold block">{sess.userAgent}</span>
                              <span className="text-[10px] text-zinc-500">IP: {sess.ipAddress} • Last active: {new Date(sess.lastActiveAt).toLocaleTimeString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 px-2 py-0.5 rounded font-bold">ACTIVE</span>
                            <button
                              type="button"
                              onClick={() => handleRevokeSession(sess.id)}
                              className="text-[10px] text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. DEVELOPER API KEYS */}
            {activeTab === 'developer' && (
              <div className="space-y-5">
                <div className="border-b border-zinc-200 dark:border-zinc-800/80 pb-2">
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Bring Your Own API Key</h2>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Configure your personal keys to route AI interview questions directly through your preferred LLM providers.</p>
                </div>

                {/* Gemini Key */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-semibold text-zinc-700 dark:text-zinc-300">Gemini API Key</label>
                    <button type="button" onClick={() => toggleShowKey('gemini')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                      {showKeys['gemini'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <input
                    type={showKeys['gemini'] ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                {/* OpenAI Key */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-semibold text-zinc-700 dark:text-zinc-300">OpenAI API Key</label>
                    <button type="button" onClick={() => toggleShowKey('openai')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                      {showKeys['openai'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <input
                    type={showKeys['openai'] ? 'text' : 'password'}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-proj-..."
                    className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                {/* Anthropic Key */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-semibold text-zinc-700 dark:text-zinc-300">Anthropic Claude Key</label>
                    <button type="button" onClick={() => toggleShowKey('anthropic')} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                      {showKeys['anthropic'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <input
                    type={showKeys['anthropic'] ? 'text' : 'password'}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
            )}

            {/* 5. NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div className="border-b border-zinc-200 dark:border-zinc-800/80 pb-2">
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Notification Preferences</h2>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">Manage how and when InterviewOps communicates updates and practice reminders to you.</p>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      id: 'emailSummaries',
                      title: 'Weekly Email Summaries',
                      description: 'Receive weekly performance digests and overall topic breakdown reports.',
                      checked: emailSummaries,
                      onChange: () => setEmailSummaries(!emailSummaries)
                    },
                    {
                      id: 'practiceReminders',
                      title: 'Practice Interview Reminders',
                      description: 'Get automated email notifications to keep your streak and practice schedule on track.',
                      checked: practiceReminders,
                      onChange: () => setPracticeReminders(!practiceReminders)
                    },
                    {
                      id: 'productUpdates',
                      title: 'Product & AI Model Updates',
                      description: 'Stay updated when new interview simulation models or system feature releases launch.',
                      checked: productUpdates,
                      onChange: () => setProductUpdates(!productUpdates)
                    }
                  ].map((item) => (
                    <div 
                      key={item.id} 
                      onClick={item.onChange}
                      className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-[#09090b] hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-all cursor-pointer flex items-center justify-between gap-4"
                    >
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white block">{item.title}</span>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-normal">{item.description}</p>
                      </div>

                      {/* Modern Toggle Slider */}
                      <button
                        type="button"
                        aria-label={`Toggle ${item.title}`}
                        className={`w-12 h-6 rounded-full transition-colors duration-200 ease-in-out p-1 shrink-0 cursor-pointer relative border ${
                          item.checked 
                            ? 'bg-blue-600 border-blue-500/50 shadow-sm shadow-blue-500/20' 
                            : 'bg-zinc-200 dark:bg-zinc-800/80 border-zinc-300 dark:border-zinc-700/50'
                        }`}
                      >
                        <div 
                          className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                            item.checked ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. PRIVACY */}
            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800/80 pb-2">Privacy & Data Control</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
                    Configure your data retention preferences, export your personal dataset, or request selective deletion of your stored records.
                  </p>
                </div>

                {/* Status Banners */}
                {exportSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-400 rounded-lg flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span>{exportSuccess}</span>
                  </div>
                )}
                {exportError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-400 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <span>{exportError}</span>
                  </div>
                )}
                {clearSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-400 rounded-lg flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span>{clearSuccess}</span>
                  </div>
                )}
                {clearError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-400 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <span>{clearError}</span>
                  </div>
                )}

                {/* Section A: Data Retention Policy */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-zinc-500" />
                    Data Retention Policy
                  </h3>
                  <div className="space-y-1">
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Determine how long your parsed resumes and interview feedback records are stored on our servers.
                    </p>
                    <select
                      value={dataRetentionDays}
                      onChange={(e) => setDataRetentionDays(Number(e.target.value))}
                      className="mt-1.5 w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono"
                    >
                      <option value={0}>Keep Indefinitely (Default)</option>
                      <option value={30}>Auto-delete older than 30 days</option>
                      <option value={90}>Auto-delete older than 90 days</option>
                      <option value={365}>Auto-delete older than 365 days</option>
                    </select>
                  </div>
                </div>

                {/* Section B: Privacy Preferences */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-zinc-500" />
                    Privacy Preferences
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-xs font-medium text-zinc-800 dark:text-zinc-300">Anonymized AI Feedback Analytics</label>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Allow us to use your anonymized evaluation scores to fine-tune peer-scoring and feedback models.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAnonymousAIUsage(!anonymousAIUsage)}
                        className={`relative inline-flex h-5 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          anonymousAIUsage ? 'bg-zinc-900 dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-zinc-900 shadow ring-0 transition duration-200 ease-in-out ${
                            anonymousAIUsage ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-xs font-medium text-zinc-800 dark:text-zinc-300">Diagnostic & Activity Telemetry</label>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Log app crashes, loading speeds, and search query parameters anonymously to help maintain application health.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllowTelemetry(!allowTelemetry)}
                        className={`relative inline-flex h-5 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          allowTelemetry ? 'bg-zinc-900 dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-zinc-900 shadow ring-0 transition duration-200 ease-in-out ${
                            allowTelemetry ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section C: Data Portability (Export) */}
                <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-zinc-500" />
                    Data Portability & Export (GDPR Art. 20)
                  </h3>
                  <div className="space-y-2">
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      Download a structured machine-readable JSON archive containing your full profile data, subscription levels, uploaded resumes, learning progress, AI usage records, and billing statements.
                    </p>
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={handleExportData}
                      className="inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-300 px-4 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating Archive...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Personal Data Archive</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Section D: Granular Data Erasure / Right to Erasure (GDPR Art. 17) */}
                <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    Right to Erasure & Granular Deletion
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Under the GDPR Right to Erasure, you can request the immediate hard deletion or anonymization of specific categories of personal data without having to close your entire account.
                  </p>

                  <div className="space-y-2 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/10">
                    {/* Item 1: Resumes */}
                    <div className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-zinc-800 dark:text-zinc-300">Resume Library</p>
                        <p className="text-[10px] text-zinc-500">All uploaded and parsed resume files and metadata.</p>
                      </div>
                      <button
                        type="button"
                        disabled={isClearingData !== null}
                        onClick={() => handleClearCategory('resumes')}
                        className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-950/40 text-[10px] font-semibold text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        {isClearingData === 'resumes' ? 'Erase...' : 'Erase Resumes'}
                      </button>
                    </div>

                    {/* Item 2: Sessions */}
                    <div className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-zinc-800 dark:text-zinc-300">Interview Sessions</p>
                        <p className="text-[10px] text-zinc-500">Your practice evaluations, transcripts, and coaching metrics.</p>
                      </div>
                      <button
                        type="button"
                        disabled={isClearingData !== null}
                        onClick={() => handleClearCategory('sessions')}
                        className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-950/40 text-[10px] font-semibold text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        {isClearingData === 'sessions' ? 'Erase...' : 'Erase Sessions'}
                      </button>
                    </div>

                    {/* Item 3: AI Analytics */}
                    <div className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-zinc-800 dark:text-zinc-300">AI Usage Logs</p>
                        <p className="text-[10px] text-zinc-500">AI token metrics and fine-tuning history metadata.</p>
                      </div>
                      <button
                        type="button"
                        disabled={isClearingData !== null}
                        onClick={() => handleClearCategory('usages')}
                        className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-950/40 text-[10px] font-semibold text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        {isClearingData === 'usages' ? 'Anonymize...' : 'Anonymize Logs'}
                      </button>
                    </div>

                    {/* Item 4: Login history */}
                    <div className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-zinc-800 dark:text-zinc-300">Login & Access Logs</p>
                        <p className="text-[10px] text-zinc-500">Your device IPs, login statuses, and browser strings.</p>
                      </div>
                      <button
                        type="button"
                        disabled={isClearingData !== null}
                        onClick={() => handleClearCategory('logins')}
                        className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-950/40 text-[10px] font-semibold text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        {isClearingData === 'logins' ? 'Anonymize...' : 'Anonymize Logins'}
                      </button>
                    </div>

                    {/* Item 5: Local Cache */}
                    <div className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-zinc-800 dark:text-zinc-300">Local Cache</p>
                        <p className="text-[10px] text-zinc-500">Clear cached searches, dashboard preferences, and local cookies.</p>
                      </div>
                      <button
                        type="button"
                        disabled={isClearingData !== null || searchHistoryCleared}
                        onClick={() => handleClearCategory('cache')}
                        className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-[10px] font-semibold text-zinc-800 dark:text-zinc-300 px-3 py-1.5 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {searchHistoryCleared ? 'Cleared' : isClearingData === 'cache' ? 'Clearing...' : 'Clear Cache'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 7. DANGER ZONE / DELETE ACCOUNT */}
            {activeTab === 'danger' && (
              <div className="space-y-4 border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/10 p-5 rounded-xl">
                <h2 className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Danger Zone</h2>
                
                {!showDeleteConfirm ? (
                  <div className="space-y-4">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Permanently delete your InterviewOps account, saved resume library, and interview session history. This action cannot be undone and will cascade delete all your private resources.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                    >
                      Delete Account & Data
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleDeleteAccount} className="space-y-4">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-semibold text-red-600 dark:text-red-400">
                      You are about to permanently delete your account. This is irreversible.
                    </p>

                    {deleteError && (
                      <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{deleteError}</span>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                          Confirm Password
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="Your current password"
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-red-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                          Confirm Action
                        </label>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                          Please type <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200">DELETE</span> or your email <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200">{user?.email}</span> to confirm.
                        </p>
                        <input
                          type="text"
                          required
                          placeholder="Type DELETE or your email"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={isDeleting}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-55 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Deleting Account...</span>
                          </>
                        ) : (
                          <span>Permanently Delete Account</span>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeletePassword('');
                          setDeleteConfirmText('');
                          setDeleteError(null);
                        }}
                        className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Save CTA for non-danger tabs */}
            {activeTab !== 'danger' && (
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black text-xs font-bold px-6 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-60 shadow-sm"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white dark:text-black" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            )}

          </form>

        </div>

      </div>

    </div>
  );
}
