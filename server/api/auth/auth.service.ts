import { db, User, UserLogin, UserSession } from '../../db';
import { encryptPassword, hashPassword, verifyPassword } from './utils/crypto';
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

    const user = db.users.get(mfaSession.email);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestError('2FA is not enabled on this account.');
    }

    const cleanCode = code.trim().replace(/\s+/g, '');
    let isValid = TotpService.verifyToken(cleanCode, user.twoFactorSecret);

    // If TOTP verification failed, check if candidate code matches one of the user's single-use backup codes
    if (!isValid && user.backupCodes && user.backupCodes.length > 0) {
      const formattedCode = cleanCode.includes('-')
        ? cleanCode.toLowerCase()
        : `${cleanCode.substring(0, 4)}-${cleanCode.substring(4)}`.toLowerCase();

      const backupIndex = user.backupCodes.findIndex(
        bc => bc.toLowerCase() === cleanCode.toLowerCase() || bc.toLowerCase() === formattedCode
      );

      if (backupIndex !== -1) {
        isValid = true;
        // Consume the backup code
        user.backupCodes.splice(backupIndex, 1);
        try {
          const supabase = getSupabaseClient();
          if (supabase) {
            await supabase
              .from('profiles')
              .update({ backup_codes: user.backupCodes })
              .eq('email', user.email);
          }
        } catch (e) {
          // Continue
        }
      }
    }

    if (!isValid) {
      throw new UnauthorizedError('Invalid 6-digit 2FA code or backup code. Check your authenticator app and try again.');
    }

    pendingMfaSessions.delete(mfaToken);
    currentUserSession = user;

    db.userLogins.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      loginProvider: '2fa',
      status: 'success',
      loggedInAt: new Date().toISOString()
    });

    const token = generateJwtToken(user);
    return { user, token };
  }

  static async register(email: string, name: string, plainPassword: string): Promise<{ user: User; token: string }> {
    if (db.users.has(email)) {
      throw new ConflictError('User already exists');
    }

    // Encrypt password securely using AES-256-GCM / PBKDF2 crypto util
    const encryptedPass = encryptPassword(plainPassword);
    const passHash = hashPassword(plainPassword);

    const newUser: User = {
      id: 'usr-' + Math.random().toString(36).substr(2, 9),
      email,
      passwordHash: encryptedPass, // Store encrypted password
      name,
      role: 'user'
    };

    db.users.set(email, newUser);
    currentUserSession = newUser;

    // Persist to Supabase if client is active
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.from('profiles').insert([{
          email,
          password_hash: encryptedPass,
          name,
          role: 'user'
        }]);
        console.log('⚡ [AuthService] Registered user persisted to Supabase profiles.');
      }
    } catch (sbErr) {
      console.warn('⚠️ [AuthService] Supabase sync skipped:', sbErr);
    }

    // Record login audit log
    const loginRecord: UserLogin = {
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: newUser.id,
      loginProvider: 'email',
      status: 'success',
      loggedInAt: new Date().toISOString()
    };
    db.userLogins.unshift(loginRecord);

    // Generate real signed JWT token
    const token = generateJwtToken(newUser);

    return {
      user: newUser,
      token
    };
  }

  static async login(email: string, plainPassword: string): Promise<{
    user?: User;
    token?: string;
    requires2FA?: boolean;
    mfaToken?: string;
    email?: string
  }> {
    let user = db.users.get(email);

    // If not in local db, attempt to lookup in Supabase
    if (!user) {
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data } = await supabase.from('profiles').select('*').eq('email', email).single();
          if (data) {
            user = {
              id: data.id || 'usr-' + Math.random().toString(36).substr(2, 9),
              email: data.email,
              passwordHash: data.password_hash || encryptPassword(plainPassword),
              name: data.name,
              role: data.role || 'user',
              twoFactorEnabled: data.two_factor_enabled || false,
              twoFactorSecret: data.two_factor_secret || undefined,
              backupCodes: data.backup_codes || []
            };
            db.users.set(email, user);
          }
        }
      } catch (sbErr) {
        console.warn('⚠️ [AuthService] Supabase profile fetch skipped:', sbErr);
      }
    }

    if (user) {
      // Verify candidate password using crypto utility
      const isValid = verifyPassword(plainPassword, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedError('Invalid credentials');
      }
    } else {
      // Auto-provision user for first-time login
      const encryptedPass = encryptPassword(plainPassword);
      const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      user = {
        id: 'usr-' + Math.random().toString(36).substr(2, 9),
        email,
        passwordHash: encryptedPass,
        name: name || 'Engineer',
        role: 'user'
      };
      db.users.set(email, user);

      // Persist to Supabase
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.from('profiles').insert([{
            email,
            password_hash: encryptedPass,
            name: user.name,
            role: 'user'
          }]);
        }
      } catch (e) {
        // Continue
      }
    }

    // Check if 2FA is enabled on user's account
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      return AuthService.createMfaSession(user);
    }

    currentUserSession = user;

    // Record login entry
    db.userLogins.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      loginProvider: 'email',
      status: 'success',
      loggedInAt: new Date().toISOString()
    });

    const token = generateJwtToken(user);

    return {
      user,
      token
    };
  }

  static async googleLogin(email: string, name: string): Promise<{ user?: User; token?: string; requires2FA?: boolean; mfaToken?: string; email?: string }> {
    let user = db.users.get(email);

    if (!user) {
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data } = await supabase.from('profiles').select('*').eq('email', email).single();
          if (data) {
            user = {
              id: data.id || 'usr-google-' + Math.random().toString(36).substr(2, 7),
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
        }
      } catch (e) {
        // Continue
      }
    }

    if (!user) {
      user = {
        id: 'usr-google-' + Math.random().toString(36).substr(2, 7),
        email,
        passwordHash: '',
        name,
        role: 'user'
      };
      db.users.set(email, user);

      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.from('profiles').insert([{
            email,
            password_hash: '',
            name,
            role: 'user'
          }]);
        }
      } catch (e) {
        // Ignore optional Supabase insertion errors
      }
    }

    // Check if 2FA is enabled on user's account
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      return AuthService.createMfaSession(user);
    }

    currentUserSession = user;

    db.userLogins.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      loginProvider: 'google',
      status: 'success',
      loggedInAt: new Date().toISOString()
    });

    const token = generateJwtToken(user);

    return {
      user,
      token
    };
  }

  static getLogins(userId: string): UserLogin[] {
    return db.userLogins.filter(l => l.userId === userId);
  }

  // 1. Password Change
  static async changePassword(userId: string, currentPass: string, newPass: string): Promise<void> {
    if (!newPass || newPass.length < 8) {
      throw new BadRequestError('New password must be at least 8 characters long');
    }

    let userObj: User | undefined;
    for (const u of db.users.values()) {
      if (u.id === userId) {
        userObj = u;
        break;
      }
    }

    if (!userObj) {
      throw new UnauthorizedError('User not found');
    }

    if (userObj.passwordHash) {
      const isValid = verifyPassword(currentPass, userObj.passwordHash);
      if (!isValid) {
        throw new BadRequestError('Current password is incorrect');
      }
    }

    const newEncrypted = encryptPassword(newPass);
    userObj.passwordHash = newEncrypted;

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase
          .from('profiles')
          .update({
            password_hash: newEncrypted,
            last_password_change: new Date().toISOString()
          })
          .eq('email', userObj.email);
      }
    } catch (e) {
      // Continue
    }
  }

  // 2. Setup 2FA
  static async setup2FA(userId: string): Promise<{ secret: string; uri: string }> {
    let userObj: User | undefined;
    for (const u of db.users.values()) {
      if (u.id === userId) {
        userObj = u;
        break;
      }
    }

    if (!userObj) {
      throw new UnauthorizedError('User not found');
    }

    const secret = TotpService.generateSecret(16);
    userObj.pendingTwoFactorSecret = secret;

    const uri = TotpService.getOtpAuthUri(secret, userObj.email, 'InterviewOps');

    return { secret, uri };
  }

  // 3. Verify & Enable 2FA
  static async verifyAndEnable2FA(userId: string, code: string): Promise<{ user: User; backupCodes: string[] }> {
    let userObj: User | undefined;
    for (const u of db.users.values()) {
      if (u.id === userId) {
        userObj = u;
        break;
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

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase
          .from('profiles')
          .update({
            two_factor_enabled: true,
            two_factor_secret: userObj.twoFactorSecret,
            backup_codes: backupCodes
          })
          .eq('email', userObj.email);
      }
    } catch (e) {
      // Continue
    }

    return { user: userObj, backupCodes };
  }

  // 4. Disable 2FA
  static async disable2FA(userId: string): Promise<{ user: User }> {
    let userObj: User | undefined;
    for (const u of db.users.values()) {
      if (u.id === userId) {
        userObj = u;
        break;
      }
    }

    if (!userObj) {
      throw new UnauthorizedError('User not found');
    }

    userObj.twoFactorEnabled = false;
    delete userObj.twoFactorSecret;
    delete userObj.pendingTwoFactorSecret;
    delete userObj.backupCodes;

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase
          .from('profiles')
          .update({
            two_factor_enabled: false,
            two_factor_secret: null,
            backup_codes: []
          })
          .eq('email', userObj.email);
      }
    } catch (e) {
      // Continue
    }
    
    return { user: userObj };
  }

  // 5. Active Sessions Management
  static getActiveSessions(userId: string, currentToken?: string): UserSession[] {
    const sessions = db.userSessions.filter(s => s.userId === userId && s.isActive);

    // Fallback if empty: create default active current session
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

  static revokeSession(userId: string, sessionId: string): void {
    const session = db.userSessions.find(s => s.id === sessionId && s.userId === userId);
    if (session) {
      session.isActive = false;
    }
  }
}
