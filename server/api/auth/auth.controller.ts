import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { BadRequestError, UnauthorizedError, catchAsync } from '../../middleware/error_handling';

export class AuthController {
  static register = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      throw new BadRequestError('Missing registration details (email, name, and password required)');
    }
    const data = await AuthService.register(email, name, password);
    res.json({ success: true, data });
  });

  static login = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new BadRequestError('Email and password required');
    }
    const data = await AuthService.login(email, password);
    res.json({ success: true, data });
  });

  // Get Google OAuth Authorization URL
  static googleUrl = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.json({
        success: true,
        data: {
          configured: false,
          message: 'GOOGLE_CLIENT_ID is not set in environment variables.'
        }
      });
      return;
    }

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const redirectUri = process.env.APP_URL 
      ? `${process.env.APP_URL.replace(/\/$/, '')}/auth/callback`
      : `${protocol}://${host}/auth/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account'
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    res.json({
      success: true,
      data: {
        configured: true,
        url,
        redirectUri
      }
    });
  });

  // Google OAuth callback (exchanges authorization code for Google tokens and generates app JWT)
  static googleCallback = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const code = req.query.code as string;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const redirectUri = process.env.APP_URL 
      ? `${process.env.APP_URL.replace(/\/$/, '')}/auth/callback`
      : `${protocol}://${host}/auth/callback`;

    if (!code || !clientId || !clientSecret) {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #09090b; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { text-align: center; padding: 2rem; background: #18181b; border: 1px solid #27272a; border-radius: 12px; max-width: 400px; }
              button { background: #27272a; color: #fff; border: 1px solid #3f3f46; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-top: 12px; font-size: 12px; }
              button:hover { background: #3f3f46; }
            </style>
          </head>
          <body>
            <div class="card">
              <h3 style="color:#ef4444; margin-top:0;">Authentication Error</h3>
              <p style="font-size:13px; color:#a1a1aa;">Missing OAuth code or Google client credentials.</p>
              <button onclick="window.close()">Close Window</button>
            </div>
            <script>
              const errorMsg = 'Missing OAuth code or server client secrets';
              try {
                if ('BroadcastChannel' in window) {
                  const bc = new BroadcastChannel('oauth_channel');
                  bc.postMessage({ type: 'OAUTH_AUTH_ERROR', error: errorMsg });
                  bc.close();
                }
              } catch(e) {}
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: errorMsg }, '*');
                }
              } catch(e) {}
              try {
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({ type: 'OAUTH_AUTH_ERROR', error: errorMsg }, '*');
                }
              } catch(e) {}
              setTimeout(function() { window.close(); }, 1500);
            </script>
          </body>
        </html>
      `);
      return;
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange code with Google OAuth');
      }

      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userInfo = await userInfoRes.json();

      if (!userInfo.email) {
        throw new Error('Google did not return an email address');
      }

      const email = userInfo.email;
      const name = userInfo.name || email.split('@')[0];

      const authResult = await AuthService.googleLogin(email, name);

      if (authResult.requires2FA) {
        res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>2FA Verification Required</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #09090b; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { text-align: center; padding: 2rem; background: #18181b; border: 1px solid #27272a; border-radius: 12px; max-width: 400px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
                .spinner { border: 3px solid #27272a; border-top: 3px solid #3b82f6; border-radius: 50%; width: 28px; height: 28px; animation: spin 1s linear infinite; margin: 0 auto 1.25rem; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="spinner"></div>
                <h3 style="margin:0 0 8px 0; font-size:16px;">Two-Factor Authentication Required</h3>
                <p style="font-size:13px; color:#a1a1aa; margin:0 0 8px 0;">Google identity verified for <strong>${email}</strong>.</p>
                <p style="font-size:12px; color:#71717a; margin:0 0 12px 0;">Redirecting to complete 2FA verification...</p>
              </div>
              <script>
                const mfaToken = ${JSON.stringify(authResult.mfaToken)};
                const email = ${JSON.stringify(email)};

                try {
                  localStorage.setItem('pending_mfa_session', JSON.stringify({ mfaToken, email }));
                  if ('BroadcastChannel' in window) {
                    const bc = new BroadcastChannel('oauth_channel');
                    bc.postMessage({ type: 'OAUTH_REQUIRES_2FA', mfaToken, email });
                    bc.close();
                  }
                } catch (e) {}

                try {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'OAUTH_REQUIRES_2FA', mfaToken, email }, '*');
                  }
                } catch (e) {}

                try {
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'OAUTH_REQUIRES_2FA', mfaToken, email }, '*');
                  }
                } catch (e) {}

                setTimeout(function() {
                  let closed = false;
                  if (window.opener && window.opener !== window) {
                    try {
                      window.close();
                      if (window.closed) closed = true;
                    } catch (e) {}
                  }
                  if (!closed) {
                    const returnUrl = sessionStorage.getItem('oauth_return_url') || '/';
                    sessionStorage.removeItem('oauth_return_url');
                    window.location.href = returnUrl;
                  }
                }, 400);
              </script>
            </body>
          </html>
        `);
        return;
      }

      const { user, token } = authResult;

      res.cookie('auth_token', token, {
        httpOnly: false,
        path: '/',
        maxAge: 7 * 24 * 3600 * 1000,
        sameSite: 'lax'
      });

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #09090b; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { text-align: center; padding: 2rem; background: #18181b; border: 1px solid #27272a; border-radius: 12px; max-width: 400px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
              .spinner { border: 3px solid #27272a; border-top: 3px solid #3b82f6; border-radius: 50%; width: 28px; height: 28px; animation: spin 1s linear infinite; margin: 0 auto 1.25rem; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              button { background: #27272a; color: #fff; border: 1px solid #3f3f46; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-top: 12px; font-size: 12px; }
              button:hover { background: #3f3f46; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="spinner"></div>
              <h3 style="margin:0 0 8px 0; font-size:16px;">Authentication Successful</h3>
              <p style="font-size:13px; color:#a1a1aa; margin:0 0 8px 0;">Signed in as <strong>${email}</strong>.</p>
              <p style="font-size:12px; color:#71717a; margin:0 0 12px 0;">Redirecting back to your app session...</p>
            </div>
            <script>
              const token = ${JSON.stringify(token)};
              const user = ${JSON.stringify(user)};

              // 1. Write to localStorage so app detects auth status
              try {
                localStorage.setItem('auth_token', token);
                localStorage.setItem('user_profile', JSON.stringify(user));
                localStorage.setItem('oauth_auth_success', JSON.stringify({ token, user, timestamp: Date.now() }));
              } catch (e) {
                console.error('LocalStorage write failed:', e);
              }

              // 2. BroadcastChannel to notify main tab
              try {
                if ('BroadcastChannel' in window) {
                  const bc = new BroadcastChannel('oauth_channel');
                  bc.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token, user });
                  bc.close();
                }
              } catch (e) {
                console.error('BroadcastChannel failed:', e);
              }

              // 3. PostMessage to opener / parent windows
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token, user }, '*');
                }
              } catch (e) {
                console.error('postMessage opener failed:', e);
              }

              try {
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token, user }, '*');
                }
              } catch (e) {
                console.error('postMessage parent failed:', e);
              }

              // 4. If opened as a popup with opener, close popup; otherwise redirect back in same window
              setTimeout(function() {
                let closed = false;
                if (window.opener && window.opener !== window) {
                  try {
                    window.close();
                    if (window.closed) {
                      closed = true;
                    }
                  } catch (e) {}
                }
                if (!closed) {
                  const returnUrl = sessionStorage.getItem('oauth_return_url') || '/';
                  sessionStorage.removeItem('oauth_return_url');
                  window.location.href = returnUrl;
                }
              }, 400);
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('❌ [Google OAuth Callback Error]:', err.message);
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #09090b; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { text-align: center; padding: 2rem; background: #18181b; border: 1px solid #27272a; border-radius: 12px; max-width: 400px; }
              button { background: #27272a; color: #fff; border: 1px solid #3f3f46; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-top: 12px; font-size: 12px; }
              button:hover { background: #3f3f46; }
            </style>
          </head>
          <body>
            <div class="card">
              <h3 style="color:#ef4444; margin-top:0;">Authentication Error</h3>
              <p style="font-size:13px; color:#a1a1aa;">${err.message}</p>
              <button onclick="window.close()">Close Window</button>
            </div>
            <script>
              const errorMsg = ${JSON.stringify(err.message)};
              try {
                if ('BroadcastChannel' in window) {
                  const bc = new BroadcastChannel('oauth_channel');
                  bc.postMessage({ type: 'OAUTH_AUTH_ERROR', error: errorMsg });
                  bc.close();
                }
              } catch (e) {}
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: errorMsg }, '*');
                }
              } catch (e) {}
              try {
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({ type: 'OAUTH_AUTH_ERROR', error: errorMsg }, '*');
                }
              } catch (e) {}
              setTimeout(function() { window.close(); }, 2000);
            </script>
          </body>
        </html>
      `);
    }
  });

  static google = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email, name, credential, code, redirect_uri } = req.body;

    // 1. Verify Google One Tap / ID Token
    if (credential) {
      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        const tokenInfo = await verifyRes.json();
        if (tokenInfo.email) {
          const data = await AuthService.googleLogin(tokenInfo.email, tokenInfo.name || tokenInfo.email.split('@')[0]);
          res.json({ success: true, data });
          return;
        }
      } catch (e) {
        console.warn('🔮 [Google TokenInfo] Failed to verify credential:', e);
      }
    }

    // 2. Exchange authorization code if posted via JSON
    if (code) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (clientId && clientSecret) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirect_uri || (process.env.APP_URL ? `${process.env.APP_URL}/auth/callback` : 'http://localhost:3000/auth/callback'),
            grant_type: 'authorization_code'
          })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
          });
          const userInfo = await userInfoRes.json();
          if (userInfo.email) {
            const data = await AuthService.googleLogin(userInfo.email, userInfo.name || userInfo.email.split('@')[0]);
            res.json({ success: true, data });
            return;
          }
        }
      }
    }

    // 3. Fallback / direct JSON login (e.g. for testing, preview, or curl)
    const userEmail = email || 'devanshu.google@interviewops.io';
    const userName = name || 'Devanshu Koli (Google)';
    const data = await AuthService.googleLogin(userEmail, userName);
    res.json({ success: true, data });
  });

  static me = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user || AuthService.getCurrentUser();
    if (!user) {
      throw new UnauthorizedError('Unauthorized');
    }
    res.json({ success: true, data: user });
  });

  static logins = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user || AuthService.getCurrentUser();
    const userId = user?.id || 'usr-default';
    const data = await AuthService.getLogins(userId);
    res.json({ success: true, data });
  });

  static changePassword = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user || AuthService.getCurrentUser();
    const userId = user?.id || 'usr-default';
    const { currentPassword, newPassword } = req.body;
    await AuthService.changePassword(userId, currentPassword, newPassword);
    res.json({ success: true, message: 'Password updated successfully' });
  });

  static resetPassword = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      throw new BadRequestError('Email and new password are required');
    }
    await AuthService.resetPassword(email, newPassword);
    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  });

  static setup2FA = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user || AuthService.getCurrentUser();
    const userId = user?.id || 'usr-default';
    const data = await AuthService.setup2FA(userId);
    res.json({ success: true, data });
  });

  static verify2FA = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user || AuthService.getCurrentUser();
    const userId = user?.id || 'usr-default';
    const { code } = req.body;
    const { user: updatedUser, backupCodes } = await AuthService.verifyAndEnable2FA(userId, code);
    res.json({ success: true, data: { user: updatedUser, backupCodes }, message: '2FA enabled successfully' });
  });

  static verifyLogin2FA = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { mfaToken, code } = req.body;
    if (!mfaToken || !code) {
      throw new BadRequestError('MFA session token and 6-digit verification code are required');
    }
    const data = await AuthService.verifyMfaLogin(mfaToken, code);

    res.cookie('auth_token', data.token, {
      httpOnly: false,
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000,
      sameSite: 'lax'
    });

    res.json({ success: true, data });
  });

  static disable2FA = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user || AuthService.getCurrentUser();
    const userId = user?.id || 'usr-default';
    const { user: updatedUser } = await AuthService.disable2FA(userId);
    res.json({ success: true, data: { user: updatedUser }, message: '2FA disabled successfully' });
  });

  static getSessions = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user || AuthService.getCurrentUser();
    const userId = user?.id || 'usr-default';
    const token = req.headers.authorization?.replace('Bearer ', '');
    const data = await AuthService.getActiveSessions(userId, token);
    res.json({ success: true, data });
  });

  static revokeSession = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user || AuthService.getCurrentUser();
    const userId = user?.id || 'usr-default';
    const { sessionId } = req.params;
    await AuthService.revokeSession(userId, sessionId);
    res.json({ success: true, message: 'Session revoked successfully' });
  });
}
