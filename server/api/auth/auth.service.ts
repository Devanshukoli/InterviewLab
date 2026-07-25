import { db, User, UserLogin, UserSession, stringToUUID } from '../../db';
import { hashPassword, verifyPassword } from './utils/crypto';
import { generateJwtToken } from '../../middleware/jwt.middleware';
import { getSupabaseClient } from '../../services/supabase';
import { ConflictError, UnauthorizedError, BadRequestError } from '../../middleware/error_handling';
import { TotpService } from '../../services/totp';
import crypto from 'crypto';

let currentUserSession: User | null = null;

interface MfaSession {
  mfaToken: string;
  userId: string;
  email: string;
  expiresAt: number;
}

const pendingMfaSessions = new Map<string, MfaSession>();

export class AuthService {
  static getCurrentUser(): User | null {
    return currentUserSession;
  }

  static setCurrentUser(user: User | null): void {
    currentUserSession = user;
    if (user) {
      db.users.set(user.email, user);
    }
  }

  static createMfaSession(user: User): { requires2FA: true; mfaToken: string; email: string } {
    const mfaToken = 'mfa-' + crypto.randomBytes(16).toString('hex');
    const session: MfaSession = {
      mfaToken,
      userId: user.id,
      email: user.email,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes validity
    };
    pendingMfaSessions.set(mfaToken, session);
    return {
      requires2FA: true,
      mfaToken,
      email: user.email
    };
  }

  static async verifyMfaLogin(mfaToken: string, code: string): Promise<{ user: User; token: string }> {
    const mfaSession = pendingMfaSessions.get(mfaToken);
    if (!mfaSession || Date.now() > mfaSession.expiresAt) {
      if (mfaSession) pendingMfaSessions.delete(mfaToken);
      throw new UnauthorizedError('2FA session expired. Please sign in again.');
    }

    let user = db.users.get(mfaSession.email);
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('email', mfaSession.email).maybeSingle();
        if (data) {
          user = {
            id: data.id,
            email: data.email,
            passwordHash: data.password_hash || '',
            name: data.name,
            role: data.role || 'user',
            twoFactorEnabled: data.two_factor_enabled || false,
            twoFactorSecret: data.two_factor_secret || undefined,
            backupCodes: data.backup_codes || []
          };
          db.users.set(mfaSession.email, user);
        }
      } catch (err) {
        console.warn('🔮 [AuthService] Failed to load user profile during 2FA:', err);
      }
    }

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestError('2FA is not enabled on this account.');
    }

    const cleanCode = code.trim().replace(/\s+/g, '');
    let isValid = TotpService.verifyToken(cleanCode, user.twoFactorSecret);

    // Check backup codes
    if (!isValid && user.backupCodes && user.backupCodes.length > 0) {
      const formattedCode = cleanCode.includes('-')
        ? cleanCode.toLowerCase()
        : `${cleanCode.substring(0, 4)}-${cleanCode.substring(4)}`.toLowerCase();

      const backupIndex = user.backupCodes.findIndex(
        bc => bc.toLowerCase() === cleanCode.toLowerCase() || bc.toLowerCase() === formattedCode
      );

      if (backupIndex !== -1) {
        isValid = true;
        user.backupCodes.splice(backupIndex, 1);
        if (supabase) {
          try {
            await supabase
              .from('profiles')
              .update({ backup_codes: user.backupCodes })
              .eq('email', user.email);
          } catch (e) {
            console.warn('🔮 [AuthService] Failed to update backup codes:', e);
          }
        }
      }
    }

    if (!isValid) {
      throw new UnauthorizedError('Invalid 6-digit 2FA code or backup code. Check your authenticator app and try again.');
    }

    pendingMfaSessions.delete(mfaToken);
    currentUserSession = user;

    // Log in Supabase
    if (supabase) {
      try {
        await supabase.from('user_logins').insert({
          id: stringToUUID('log-' + Date.now() + '-' + user.id),
          user_id: stringToUUID(user.id),
          login_provider: '2fa',
          status: 'success',
          logged_in_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to record login:', e);
      }
    }

    const token = generateJwtToken(user);
    return { user, token };
  }

  static async register(email: string, name: string, plainPassword: string): Promise<{ user: User; token: string }> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: existing } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
        if (existing) {
          throw new ConflictError('User already exists');
        }
      } catch (err: any) {
        if (err instanceof ConflictError) throw err;
      }
    } else if (db.users.has(email)) {
      throw new ConflictError('User already exists');
    }

    const passHash = hashPassword(plainPassword);
    const userId = stringToUUID('usr-' + email);

    const newUser: User = {
      id: userId,
      email,
      passwordHash: passHash,
      name,
      role: 'user'
    };

    db.users.set(email, newUser);
    currentUserSession = newUser;

    if (supabase) {
      try {
        await supabase.from('profiles').insert([{
          id: userId,
          email,
          password_hash: passHash,
          name,
          role: 'user'
        }]);
        await supabase.from('user_logins').insert([{
          id: stringToUUID('log-' + Date.now() + '-' + email),
          user_id: userId,
          login_provider: 'email',
          status: 'success'
        }]);
      } catch (sbErr) {
        console.warn('⚠️ [AuthService] Supabase profile insert error:', sbErr);
      }
    }

    const token = generateJwtToken(newUser);
    return { user: newUser, token };
  }

  static async login(email: string, plainPassword: string): Promise<{ user?: User; token?: string; requires2FA?: boolean; mfaToken?: string; email?: string }> {
    let user: User | undefined;
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
        if (data) {
          user = {
            id: data.id,
            email: data.email,
            passwordHash: data.password_hash || '',
            name: data.name,
            role: data.role || 'user',
            twoFactorEnabled: data.two_factor_enabled || false,
            twoFactorSecret: data.two_factor_secret || undefined,
            backupCodes: data.backup_codes || []
          };
          db.users.set(email, user);
        }
      } catch (sbErr) {
        console.warn('⚠️ [AuthService] Supabase profile fetch failed:', sbErr);
      }
    }

    if (!user) {
      user = db.users.get(email);
    }

    if (user) {
      if (user.passwordHash && user.passwordHash.startsWith('enc:')) {
        throw new UnauthorizedError('Password reset required: Your account password uses a deprecated encryption format. Please reset your password to update to secure password hashing.');
      }
      const isValid = verifyPassword(plainPassword, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedError('Invalid credentials');
      }
    } else {
      // Auto-provision
      const passHash = hashPassword(plainPassword);
      const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const userId = stringToUUID('usr-' + email);
      user = {
        id: userId,
        email,
        passwordHash: passHash,
        name: name || 'Engineer',
        role: 'user'
      };
      db.users.set(email, user);

      if (supabase) {
        try {
          await supabase.from('profiles').insert([{
            id: userId,
            email,
            password_hash: passHash,
            name: user.name,
            role: 'user'
          }]);
        } catch (e) {
          console.warn('🔮 [AuthService] Failed to auto-provision profile in Supabase:', e);
        }
      }
    }

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      return AuthService.createMfaSession(user);
    }

    currentUserSession = user;

    if (supabase) {
      try {
        await supabase.from('user_logins').insert([{
          id: stringToUUID('log-' + Date.now() + '-' + email),
          user_id: stringToUUID(user.id),
          login_provider: 'email',
          status: 'success'
        }]);
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to log user login in Supabase:', e);
      }
    }

    const token = generateJwtToken(user);
    return { user, token };
  }

  static async googleLogin(email: string, name: string): Promise<{ user?: User; token?: string; requires2FA?: boolean; mfaToken?: string; email?: string }> {
    let user: User | undefined;
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
        if (data) {
          user = {
            id: data.id,
            email: data.email,
            passwordHash: data.password_hash || '',
            name: data.name || name,
            role: data.role || 'user',
            twoFactorEnabled: data.two_factor_enabled || false,
            twoFactorSecret: data.two_factor_secret || undefined,
            backupCodes: data.backup_codes || []
          };
          db.users.set(email, user);
        }
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to fetch google profile from Supabase:', e);
      }
    }

    if (!user) {
      user = db.users.get(email);
    }

    if (!user) {
      const userId = stringToUUID('usr-google-' + email);
      user = {
        id: userId,
        email,
        passwordHash: '',
        name,
        role: 'user'
      };
      db.users.set(email, user);

      if (supabase) {
        try {
          await supabase.from('profiles').insert([{
            id: userId,
            email,
            password_hash: '',
            name,
            role: 'user'
          }]);
        } catch (e) {
          console.warn('🔮 [AuthService] Failed to insert google user in Supabase:', e);
        }
      }
    }

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      return AuthService.createMfaSession(user);
    }

    currentUserSession = user;

    if (supabase) {
      try {
        await supabase.from('user_logins').insert([{
          id: stringToUUID('log-' + Date.now() + '-' + email),
          user_id: stringToUUID(user.id),
          login_provider: 'google',
          status: 'success'
        }]);
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to record google login in Supabase:', e);
      }
    }

    const token = generateJwtToken(user);
    return { user, token };
  }

  static async getLogins(userId: string): Promise<UserLogin[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data } = await supabase
          .from('user_logins')
          .select('*')
          .eq('user_id', stringToUUID(userId))
          .order('logged_in_at', { ascending: false });

        if (Array.isArray(data)) {
          return data.map(l => ({
            id: l.id,
            userId: l.user_id,
            ipAddress: l.ip_address,
            userAgent: l.user_agent,
            loginProvider: l.login_provider,
            status: l.status,
            loggedInAt: l.logged_in_at
          }));
        }
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to fetch logins from Supabase:', e);
      }
    }
    return db.userLogins.filter(l => l.userId === userId);
  }

  static async changePassword(userId: string, currentPass: string, newPass: string): Promise<void> {
    if (!newPass || newPass.length < 8) {
      throw new BadRequestError('New password must be at least 8 characters long');
    }

    const supabase = getSupabaseClient();
    let userObj: User | undefined;

    if (supabase) {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', stringToUUID(userId)).maybeSingle();
        if (data) {
          userObj = {
            id: data.id,
            email: data.email,
            passwordHash: data.password_hash || '',
            name: data.name,
            role: data.role || 'user'
          };
        }
      } catch (e) {
        console.warn('🔮 [AuthService] Error fetching profile for password change:', e);
      }
    }

    if (!userObj) {
      for (const u of db.users.values()) {
        if (u.id === userId) {
          userObj = u;
          break;
        }
      }
    }

    if (!userObj) {
      throw new UnauthorizedError('User not found');
    }

    if (userObj.passwordHash) {
      if (userObj.passwordHash.startsWith('enc:')) {
        throw new BadRequestError('Your account uses a deprecated password storage format. Please reset your password to update your credentials.');
      }
      const isValid = verifyPassword(currentPass, userObj.passwordHash);
      if (!isValid) {
        throw new BadRequestError('Current password is incorrect');
      }
    }

    const newHash = hashPassword(newPass);
    userObj.passwordHash = newHash;
    db.users.set(userObj.email, userObj);

    if (supabase) {
      try {
        await supabase
          .from('profiles')
          .update({
            password_hash: newHash,
            last_password_change: new Date().toISOString()
          })
          .eq('id', stringToUUID(userId));
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to update password in Supabase:', e);
      }
    }
  }

  static async resetPassword(email: string, newPass: string): Promise<void> {
    if (!newPass || newPass.length < 8) {
      throw new BadRequestError('New password must be at least 8 characters long');
    }

    const supabase = getSupabaseClient();
    let user = db.users.get(email);

    if (supabase) {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
        if (data) {
          user = {
            id: data.id,
            email: data.email,
            passwordHash: data.password_hash || '',
            name: data.name,
            role: data.role || 'user'
          };
        }
      } catch (e) {
        console.warn('🔮 [AuthService] Error checking profile for reset password:', e);
      }
    }

    if (!user) {
      throw new BadRequestError('Account not found with provided email address');
    }

    const newHash = hashPassword(newPass);
    user.passwordHash = newHash;
    db.users.set(email, user);

    if (supabase) {
      try {
        await supabase
          .from('profiles')
          .update({
            password_hash: newHash,
            last_password_change: new Date().toISOString()
          })
          .eq('email', email);
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to reset password in Supabase:', e);
      }
    }
  }

  static async setup2FA(userId: string): Promise<{ secret: string; uri: string }> {
    let userObj: User | undefined = currentUserSession?.id === userId ? currentUserSession : undefined;
    const supabase = getSupabaseClient();

    if (!userObj && supabase) {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', stringToUUID(userId)).maybeSingle();
        if (data) {
          userObj = {
            id: data.id,
            email: data.email,
            passwordHash: data.password_hash || '',
            name: data.name,
            role: data.role || 'user'
          };
        }
      } catch (e) {
        console.warn('🔮 [AuthService] Error loading user for 2FA setup:', e);
      }
    }

    if (!userObj) {
      for (const u of db.users.values()) {
        if (u.id === userId) {
          userObj = u;
          break;
        }
      }
    }

    if (!userObj) {
      throw new UnauthorizedError('User not found');
    }

    const secret = TotpService.generateSecret(16);
    userObj.pendingTwoFactorSecret = secret;
    db.users.set(userObj.email, userObj);

    const uri = TotpService.getOtpAuthUri(secret, userObj.email, 'InterviewOps');
    return { secret, uri };
  }

  static async verifyAndEnable2FA(userId: string, code: string): Promise<{ user: User; backupCodes: string[] }> {
    let userObj: User | undefined = currentUserSession?.id === userId ? currentUserSession : undefined;
    if (!userObj) {
      for (const u of db.users.values()) {
        if (u.id === userId) {
          userObj = u;
          break;
        }
      }
    }

    if (!userObj || !userObj.pendingTwoFactorSecret) {
      throw new BadRequestError('2FA setup session expired or not initialized. Please click setup again.');
    }

    const isValid = TotpService.verifyToken(code.trim(), userObj.pendingTwoFactorSecret);
    if (!isValid) {
      throw new BadRequestError('Invalid 6-digit verification code. Check your authenticator app time and try again.');
    }

    userObj.twoFactorEnabled = true;
    userObj.twoFactorSecret = userObj.pendingTwoFactorSecret;
    delete userObj.pendingTwoFactorSecret;

    const backupCodes = TotpService.generateBackupCodes(8);
    userObj.backupCodes = backupCodes;
    db.users.set(userObj.email, userObj);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('profiles')
          .update({
            two_factor_enabled: true,
            two_factor_secret: userObj.twoFactorSecret,
            backup_codes: backupCodes
          })
          .eq('id', stringToUUID(userId));
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to save 2FA enable in Supabase:', e);
      }
    }

    return { user: userObj, backupCodes };
  }

  static async disable2FA(userId: string): Promise<{ user: User }> {
    let userObj: User | undefined = currentUserSession?.id === userId ? currentUserSession : undefined;
    if (!userObj) {
      for (const u of db.users.values()) {
        if (u.id === userId) {
          userObj = u;
          break;
        }
      }
    }

    if (!userObj) {
      throw new UnauthorizedError('User not found');
    }

    userObj.twoFactorEnabled = false;
    delete userObj.twoFactorSecret;
    delete userObj.pendingTwoFactorSecret;
    delete userObj.backupCodes;
    db.users.set(userObj.email, userObj);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('profiles')
          .update({
            two_factor_enabled: false,
            two_factor_secret: null,
            backup_codes: []
          })
          .eq('id', stringToUUID(userId));
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to disable 2FA in Supabase:', e);
      }
    }

    return { user: userObj };
  }

  static async getActiveSessions(userId: string, currentToken?: string): Promise<UserSession[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data } = await supabase
          .from('user_sessions')
          .select('*')
          .eq('user_id', stringToUUID(userId))
          .eq('is_active', true);

        if (Array.isArray(data) && data.length > 0) {
          return data.map(s => ({
            id: s.id,
            userId: s.user_id,
            token: s.session_token || currentToken || 'default-token',
            ipAddress: s.ip_address || '127.0.0.1',
            userAgent: s.user_agent || 'Chrome / macOS (Current Session)',
            deviceType: s.device_type || 'desktop',
            createdAt: s.created_at || new Date().toISOString(),
            lastActiveAt: s.last_active_at || new Date().toISOString(),
            isActive: s.is_active
          }));
        }

        // Create default active session row in Supabase
        const sessId = stringToUUID('sess-' + Date.now() + '-' + userId);
        const newSessRow = {
          id: sessId,
          user_id: stringToUUID(userId),
          session_token: currentToken || 'default-token',
          ip_address: '127.0.0.1',
          user_agent: 'Chrome / macOS (Current Session)',
          device_type: 'desktop',
          is_active: true,
          created_at: new Date().toISOString(),
          last_active_at: new Date().toISOString()
        };
        await supabase.from('user_sessions').insert(newSessRow);
        return [{
          id: newSessRow.id,
          userId,
          token: newSessRow.session_token,
          ipAddress: newSessRow.ip_address,
          userAgent: newSessRow.user_agent,
          deviceType: newSessRow.device_type,
          createdAt: newSessRow.created_at,
          lastActiveAt: newSessRow.last_active_at,
          isActive: true
        }];
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to fetch sessions from Supabase:', e);
      }
    }

    const sessions = db.userSessions.filter(s => s.userId === userId && s.isActive);
    if (sessions.length === 0) {
      const defaultSession: UserSession = {
        id: 'sess-' + Math.random().toString(36).substr(2, 8),
        userId,
        token: currentToken || 'default-token',
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome / macOS (Current Session)',
        deviceType: 'desktop',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        isActive: true
      };
      db.userSessions.push(defaultSession);
      return [defaultSession];
    }
    return sessions;
  }

  static async revokeSession(userId: string, sessionId: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('user_sessions')
          .update({
            is_active: false,
            revoked_at: new Date().toISOString()
          })
          .eq('id', stringToUUID(sessionId))
          .eq('user_id', stringToUUID(userId));
      } catch (e) {
        console.warn('🔮 [AuthService] Failed to revoke session in Supabase:', e);
      }
    }

    const session = db.userSessions.find(s => s.id === sessionId && s.userId === userId);
    if (session) {
      session.isActive = false;
    }
  }
}


