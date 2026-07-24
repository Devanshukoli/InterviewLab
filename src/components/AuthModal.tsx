import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User as UserIcon, ArrowRight, ShieldCheck, KeyRound, Loader2, ArrowLeft } from 'lucide-react';
import { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('architect@interviewops.io');
  const [password, setPassword] = useState('••••••••••••');
  const [name, setName] = useState('Devanshu Koli');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2FA Challenge State
  const [twoFactorState, setTwoFactorState] = useState<{ required: boolean; mfaToken: string; email: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    // Check if there's a pending MFA session from Google OAuth redirect in localStorage
    const pendingMfa = localStorage.getItem('pending_mfa_session');
    if (pendingMfa) {
      try {
        const parsed = JSON.parse(pendingMfa);
        if (parsed.mfaToken && parsed.email) {
          setTwoFactorState({ required: true, mfaToken: parsed.mfaToken, email: parsed.email });
        }
      } catch (e) {}
      localStorage.removeItem('pending_mfa_session');
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Listen for OAuth completion via postMessage, BroadcastChannel, and localStorage events
  useEffect(() => {
    if (!isOpen) return;

    const handleAuthSuccess = (token: string, user: UserProfile) => {
      if (token) {
        localStorage.setItem('auth_token', token);
      }
      if (user) {
        localStorage.setItem('user_profile', JSON.stringify(user));
        onSuccess(user);
        onClose();
      }
      setIsLoading(false);
    };

    const handle2FARequired = (mfaToken: string, mfaEmail: string) => {
      setTwoFactorState({ required: true, mfaToken, email: mfaEmail });
      setIsLoading(false);
    };

    const handleAuthError = (errMsg: string) => {
      setError(errMsg || 'Google OAuth failed');
      setIsLoading(false);
    };

    // 1. PostMessage listener
    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { token, user } = event.data;
        handleAuthSuccess(token, user);
      } else if (event.data?.type === 'OAUTH_REQUIRES_2FA') {
        handle2FARequired(event.data.mfaToken, event.data.email);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        handleAuthError(event.data.error);
      }
    };

    // 2. BroadcastChannel listener
    let bc: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('oauth_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
            handleAuthSuccess(event.data.token, event.data.user);
          } else if (event.data?.type === 'OAUTH_REQUIRES_2FA') {
            handle2FARequired(event.data.mfaToken, event.data.email);
          } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
            handleAuthError(event.data.error);
          }
        };
      }
    } catch (e) {
      console.error('BroadcastChannel listener error:', e);
    }

    // 3. Storage event listener (fires when another tab/popup modifies localStorage)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'oauth_auth_success' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed.token && parsed.user) {
            localStorage.removeItem('oauth_auth_success');
            handleAuthSuccess(parsed.token, parsed.user);
          }
        } catch (e) {}
      } else if (event.key === 'pending_mfa_session' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed.mfaToken && parsed.email) {
            localStorage.removeItem('pending_mfa_session');
            handle2FARequired(parsed.mfaToken, parsed.email);
          }
        } catch (e) {}
      }
    };

    // 4. Polling fallback in case events were missed
    const pollInterval = setInterval(() => {
      const oauthData = localStorage.getItem('oauth_auth_success');
      if (oauthData) {
        try {
          const parsed = JSON.parse(oauthData);
          if (parsed.token && parsed.user) {
            localStorage.removeItem('oauth_auth_success');
            handleAuthSuccess(parsed.token, parsed.user);
          }
        } catch (e) {}
      }
      const pendingMfa = localStorage.getItem('pending_mfa_session');
      if (pendingMfa) {
        try {
          const parsed = JSON.parse(pendingMfa);
          if (parsed.mfaToken && parsed.email) {
            localStorage.removeItem('pending_mfa_session');
            handle2FARequired(parsed.mfaToken, parsed.email);
          }
        } catch (e) {}
      }
    }, 400);

    window.addEventListener('message', handleOAuthMessage);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('message', handleOAuthMessage);
      window.removeEventListener('storage', handleStorageChange);
      if (bc) bc.close();
      clearInterval(pollInterval);
    };
  }, [isOpen, onSuccess, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const endpoint = mode === 'signin' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'signin' ? { email, password } : { email, password, name };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const json = await res.json();

      if (json.success) {
        if (json.data?.requires2FA) {
          setTwoFactorState({
            required: true,
            mfaToken: json.data.mfaToken,
            email: json.data.email || email
          });
        } else if (json.data?.user) {
          if (json.data.token) {
            localStorage.setItem('auth_token', json.data.token);
          }
          onSuccess(json.data.user);
          onClose();
        }
      } else {
        setError(json.error || 'Authentication failed');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication request failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FALogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorState?.mfaToken || !totpCode.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/2fa/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfaToken: twoFactorState.mfaToken,
          code: totpCode.trim()
        })
      });

      const json = await res.json();
      if (json.success && json.data?.user) {
        if (json.data.token) {
          localStorage.setItem('auth_token', json.data.token);
        }
        localStorage.setItem('user_profile', JSON.stringify(json.data.user));
        setTwoFactorState(null);
        setTotpCode('');
        onSuccess(json.data.user);
        onClose();
      } else {
        setError(json.error || 'Invalid 2FA verification code');
      }
    } catch (err: any) {
      setError(err.message || '2FA verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Check if Google OAuth URL is available on server
      const urlRes = await fetch('/api/auth/google/url');
      const urlJson = await urlRes.json();

      if (urlJson.success && urlJson.data?.configured && urlJson.data?.url) {
        // Save current page URL so OAuth callback can redirect back
        try {
          sessionStorage.setItem('oauth_return_url', window.location.href);
        } catch (e) {}

        // Redirect current window directly to Google OAuth to avoid extra tab opening
        window.location.href = urlJson.data.url;
        return;
      }

      // 2. Fallback direct sign-in (when GOOGLE_CLIENT_ID is not configured in .env)
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email || 'devanshu.google@interviewops.io',
          name: name || 'Devanshu Koli (Google)'
        })
      });
      const json = await res.json();

      if (json.success) {
        if (json.data?.requires2FA) {
          setTwoFactorState({
            required: true,
            mfaToken: json.data.mfaToken,
            email: json.data.email || email
          });
        } else if (json.data?.user) {
          if (json.data.token) {
            localStorage.setItem('auth_token', json.data.token);
          }
          onSuccess(json.data.user);
          onClose();
        }
      } else {
        setError(json.error || 'Google authentication failed');
      }
    } catch (err: any) {
      setError(err.message || 'Google authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn cursor-pointer"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#0c0c0e] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-6 sm:p-8 space-y-6 relative cursor-default">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 2FA Verification Mode View */}
        {twoFactorState?.required ? (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl items-center justify-center text-blue-600 dark:text-blue-400 mb-1">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
                Two-Factor Verification
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Enter the 6-digit code from your authenticator app or an 8-character recovery code for <span className="font-mono text-zinc-800 dark:text-zinc-200 font-semibold">{twoFactorState.email}</span>.
              </p>
            </div>

            <form onSubmit={handleVerify2FALogin} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                  Authentication or Backup Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456 or a1b2-c3d4"
                    className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm font-mono text-center tracking-widest text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-500 dark:text-red-400 font-mono text-center">{error}</p>}

              <button
                type="submit"
                disabled={isLoading || !totpCode.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTwoFactorState(null);
                  setError(null);
                  setTotpCode('');
                }}
                className="w-full text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 py-1.5 flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            </form>
          </div>
        ) : (
          /* Standard Sign In / Sign Up Mode View */
          <>
            <div className="text-center space-y-2">
              <div className="inline-flex w-10 h-10 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg items-center justify-center text-zinc-900 dark:text-white mb-1">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
                {mode === 'signin' ? 'Sign in to InterviewOps' : 'Create your account'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {mode === 'signin' 
                  ? 'Access your resume library and interview sessions' 
                  : 'Start preparing for senior engineering interviews'}
              </p>
            </div>

            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-60 shadow-sm"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              {isLoading ? 'Connecting to Google...' : 'Continue with Google'}
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-zinc-200 dark:border-zinc-800 w-full"></div>
              <span className="bg-white dark:bg-[#0c0c0e] px-3 text-[10px] font-mono uppercase text-zinc-500 shrink-0">Or email</span>
            </div>

            {/* Email + Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Full Name</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Devanshu Koli"
                      className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="architect@interviewops.io"
                    className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-500 dark:text-red-400 font-mono">{error}</p>}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            {/* Toggle Mode */}
            <div className="text-center text-xs text-zinc-500 pt-2 border-t border-zinc-800/60">
              {mode === 'signin' ? (
                <span>
                  Don't have an account?{' '}
                  <button onClick={() => setMode('signup')} className="text-zinc-200 font-semibold hover:underline cursor-pointer">
                    Sign Up
                  </button>
                </span>
              ) : (
                <span>
                  Already have an account?{' '}
                  <button onClick={() => setMode('signin')} className="text-zinc-200 font-semibold hover:underline cursor-pointer">
                    Sign In
                  </button>
                </span>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

