import { getSupabaseClient } from '../../services/supabase';
import { db, User, UserSettings, stringToUUID } from '../../db';
import { ConflictError, UnauthorizedError, BadRequestError } from '../../middleware/error_handling';
import { encrypt, decrypt, verifyPassword } from '../auth/utils/crypto';

export interface UpdateProfileDTO {
  name?: string;
  email?: string;
  appearance?: 'light' | 'dark' | 'system';
  twoFactorEnabled?: boolean;
  apiKeys?: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
  };
  notifications?: {
    emailSummaries: boolean;
    practiceReminders: boolean;
    productUpdates: boolean;
  };
  privacy?: {
    dataRetentionDays?: number;
    anonymousAIUsage?: boolean;
    allowTelemetry?: boolean;
    searchHistoryCleared?: boolean;
  };
}

export class ProfileService {
  static async getProfile(userId: string, email: string) {
    let user: User | undefined = db.users.get(email);
    if (!user) {
      for (const u of db.users.values()) {
        if (u.id === userId) {
          user = u;
          break;
        }
      }
    }

    const supabase = getSupabaseClient();
    if (!user && supabase) {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', stringToUUID(userId)).maybeSingle();
        if (data) {
          user = {
            id: data.id,
            email: data.email,
            passwordHash: data.password_hash || '',
            name: data.name || data.email.split('@')[0],
            role: data.role || 'user',
            twoFactorEnabled: data.two_factor_enabled || false,
            appearance: data.appearance || 'system'
          };
          db.users.set(user.email, user);
        }
      } catch (e) {
        console.warn('🔮 [ProfileService] Failed to fetch profile from Supabase:', e);
      }
    }

    if (!user) {
      user = {
        id: userId,
        email: email,
        passwordHash: '',
        name: email.split('@')[0],
        role: 'user'
      };
      db.users.set(email, user);
    }

    const savedSettings = db.userSettings.get(userId);
    const rawApiKeys = user.apiKeys || savedSettings?.apiKeys;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      twoFactorEnabled: !!user.twoFactorEnabled,
      appearance: user.appearance || savedSettings?.appearance || 'system',
      notifications: user.notifications || savedSettings?.notifications || {
        emailSummaries: true,
        practiceReminders: true,
        productUpdates: false
      },
      privacy: user.privacy || savedSettings?.privacy || {
        dataRetentionDays: 0,
        anonymousAIUsage: false,
        allowTelemetry: true,
        searchHistoryCleared: false
      },
      apiKeys: {
        gemini: rawApiKeys?.gemini ? decrypt(rawApiKeys.gemini) : '',
        openai: rawApiKeys?.openai ? decrypt(rawApiKeys.openai) : '',
        anthropic: rawApiKeys?.anthropic ? decrypt(rawApiKeys.anthropic) : ''
      }
    };
  }

  static async updateProfile(userId: string, currentEmail: string, updateData: UpdateProfileDTO) {
    let user: User | undefined = db.users.get(currentEmail);
    if (!user) {
      for (const u of db.users.values()) {
        if (u.id === userId) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      user = {
        id: userId,
        email: currentEmail,
        passwordHash: '',
        name: currentEmail.split('@')[0],
        role: 'user'
      };
    }

    const oldEmail = user.email;

    // Handle Email Change
    if (updateData.email && updateData.email.trim().toLowerCase() !== oldEmail.toLowerCase()) {
      const newEmail = updateData.email.trim().toLowerCase();

      // Check if new email is taken
      const existingUser = db.users.get(newEmail);
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictError('An account with this email address already exists.');
      }

      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data } = await supabase.from('profiles').select('*').eq('email', newEmail).maybeSingle();
          if (data && data.id !== stringToUUID(userId)) {
            throw new ConflictError('An account with this email address already exists.');
          }
        } catch (e: any) {
          if (e instanceof ConflictError) throw e;
        }
      }

      // Remove old key and set new key in in-memory DB
      db.users.delete(oldEmail);
      user.email = newEmail;
    }

    // Update Name
    if (updateData.name !== undefined) {
      user.name = updateData.name.trim();
    }

    // Update Appearance
    if (updateData.appearance !== undefined) {
      user.appearance = updateData.appearance;
    }

    // Update Notifications
    if (updateData.notifications !== undefined) {
      user.notifications = {
        emailSummaries: !!updateData.notifications.emailSummaries,
        practiceReminders: !!updateData.notifications.practiceReminders,
        productUpdates: !!updateData.notifications.productUpdates
      };
    }

    // Update API Keys
    if (updateData.apiKeys !== undefined) {
      user.apiKeys = {
        gemini: updateData.apiKeys.gemini ? encrypt(updateData.apiKeys.gemini) : '',
        openai: updateData.apiKeys.openai ? encrypt(updateData.apiKeys.openai) : '',
        anthropic: updateData.apiKeys.anthropic ? encrypt(updateData.apiKeys.anthropic) : ''
      };
    }

    // Update 2FA flag if provided
    if (updateData.twoFactorEnabled !== undefined) {
      user.twoFactorEnabled = updateData.twoFactorEnabled;
    }

    // Update Privacy Settings
    if (updateData.privacy !== undefined) {
      user.privacy = {
        dataRetentionDays: updateData.privacy.dataRetentionDays !== undefined ? updateData.privacy.dataRetentionDays : (user.privacy?.dataRetentionDays ?? 0),
        anonymousAIUsage: updateData.privacy.anonymousAIUsage !== undefined ? !!updateData.privacy.anonymousAIUsage : (user.privacy?.anonymousAIUsage ?? false),
        allowTelemetry: updateData.privacy.allowTelemetry !== undefined ? !!updateData.privacy.allowTelemetry : (user.privacy?.allowTelemetry ?? true),
        searchHistoryCleared: updateData.privacy.searchHistoryCleared !== undefined ? !!updateData.privacy.searchHistoryCleared : (user.privacy?.searchHistoryCleared ?? false)
      };
    }

    // Save updated user back to DB map under current email
    db.users.set(user.email, user);

    // Save/update UserSettings record
    const updatedSettings: UserSettings = {
      id: 'us-' + userId,
      userId,
      appearance: user.appearance,
      apiKeys: user.apiKeys,
      notifications: user.notifications,
      privacy: user.privacy,
      updatedAt: new Date().toISOString()
    };
    db.userSettings.set(userId, updatedSettings);

    // Sync with Supabase if active
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('profiles')
          .update({
            name: user.name,
            email: user.email,
            appearance: user.appearance,
            notifications: user.notifications,
            api_keys: user.apiKeys,
            two_factor_enabled: user.twoFactorEnabled,
            updated_at: new Date().toISOString()
          })
          .eq('id', stringToUUID(userId));
      } catch (e) {
        console.warn('🔮 [ProfileService] Failed to update profile in Supabase:', e);
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      twoFactorEnabled: !!user.twoFactorEnabled,
      appearance: user.appearance || 'system',
      notifications: user.notifications || {
        emailSummaries: true,
        practiceReminders: true,
        productUpdates: false
      },
      apiKeys: {
        gemini: user.apiKeys?.gemini ? decrypt(user.apiKeys.gemini) : '',
        openai: user.apiKeys?.openai ? decrypt(user.apiKeys.openai) : '',
        anthropic: user.apiKeys?.anthropic ? decrypt(user.apiKeys.anthropic) : ''
      }
    };
  }

  static async deleteProfile(userId: string, email: string, password?: string): Promise<void> {
    const user = db.users.get(email);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // 1. Password Verification (if the user has a password)
    if (user.passwordHash) {
      if (!password) {
        throw new BadRequestError('Password is required to delete your account.');
      }
      if (user.passwordHash.startsWith('enc:')) {
        throw new BadRequestError('Your account uses a deprecated password storage format. Please reset your password first.');
      }
      const isValid = verifyPassword(password, user.passwordHash);
      if (!isValid) {
        throw new BadRequestError('Incorrect password. Account deletion aborted.');
      }
    }

    // 2. Cascade Delete/Anonymize associated data in InMemoryDB
    
    // Resumes (Delete)
    for (const [key, resume] of db.resumes.entries()) {
      if (resume.userId === userId) {
        db.resumes.delete(key);
      }
    }

    // Job Descriptions (Delete)
    for (const [key, jd] of db.jobDescriptions.entries()) {
      if (jd.userId === userId) {
        db.jobDescriptions.delete(key);
      }
    }

    // Interview Sessions (Delete)
    for (const [key, sess] of db.sessions.entries()) {
      if (sess.userId === userId) {
        db.sessions.delete(key);
      }
    }

    // Progress (Delete)
    db.progress.delete(userId);

    // Subscriptions (Delete)
    db.subscriptions.delete(userId);

    // User Settings (Delete)
    db.userSettings.delete(userId);

    // Refresh Tokens (Delete)
    for (const [key, rt] of db.refreshTokens.entries()) {
      if (rt.userId === userId) {
        db.refreshTokens.delete(key);
      }
    }

    // User Sessions (Delete)
    db.userSessions = db.userSessions.filter(s => s.userId !== userId);

    // Billing History (Anonymize)
    db.billingHistory = db.billingHistory.map(b => {
      if (b.userId === userId) {
        return { ...b, userId: 'deleted-user' };
      }
      return b;
    });

    // User Logins (Anonymize)
    db.userLogins = db.userLogins.map(l => {
      if (l.userId === userId) {
        return { ...l, userId: 'deleted-user' };
      }
      return l;
    });

    // AI Usages (Anonymize)
    db.usages = db.usages.map(u => {
      if (u.userId === userId) {
        return { ...u, userId: 'deleted-user' };
      }
      return u;
    });

    // Delete User
    db.users.delete(email);

    // 3. Delete from Supabase if configured
    const supabase = getSupabaseClient();
    if (supabase) {
      const uuid = stringToUUID(userId);
      try {
        await supabase.from('resumes').delete().eq('user_id', uuid);
        await supabase.from('job_descriptions').delete().eq('user_id', uuid);
        await supabase.from('interview_sessions').delete().eq('user_id', uuid);
        await supabase.from('refresh_tokens').delete().eq('user_id', uuid);
        await supabase.from('user_sessions').delete().eq('user_id', uuid);
        
        await supabase.from('billing_history').update({ user_id: null }).eq('user_id', uuid);
        await supabase.from('ai_usages').update({ user_id: null }).eq('user_id', uuid);
        await supabase.from('user_logins').update({ user_id: null }).eq('user_id', uuid);

        await supabase.from('profiles').delete().eq('id', uuid);
      } catch (e) {
        console.warn('🔮 [ProfileService] Error cascading deletes in Supabase:', e);
      }
    }
  }

  static async exportData(userId: string, email: string): Promise<any> {
    const profile = await this.getProfile(userId, email);

    const resumes = Array.from(db.resumes.values()).filter(r => r.userId === userId);
    const jobDescriptions = Array.from(db.jobDescriptions.values()).filter(j => j.userId === userId);
    const interviewSessions = Array.from(db.sessions.values()).filter(s => s.userId === userId);
    const learningProgress = db.progress.get(userId) || [];
    const subscription = db.subscriptions.get(userId) || null;
    const billingHistory = db.billingHistory.filter(b => b.userId === userId);
    const usages = db.usages.filter(u => u.userId === userId);
    const activeSessions = db.userSessions.filter(s => s.userId === userId);
    const loginHistory = db.userLogins.filter(l => l.userId === userId);

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        twoFactorEnabled: profile.twoFactorEnabled,
        appearance: profile.appearance,
        notifications: profile.notifications,
        privacy: profile.privacy
      },
      resumes,
      jobDescriptions,
      interviewSessions,
      learningProgress,
      subscription,
      billingHistory,
      usages,
      activeSessions,
      loginHistory
    };
  }

  static async clearSpecificData(userId: string, email: string, category: string): Promise<{ success: boolean; deletedCount: number }> {
    let deletedCount = 0;

    const supabase = getSupabaseClient();
    const uuid = stringToUUID(userId);

    if (category === 'resumes') {
      for (const [key, resume] of db.resumes.entries()) {
        if (resume.userId === userId) {
          db.resumes.delete(key);
          deletedCount++;
        }
      }
      if (supabase) {
        try {
          await supabase.from('resumes').delete().eq('user_id', uuid);
        } catch (err) {
          console.warn('🔮 Error clearing resumes in Supabase:', err);
        }
      }
    } else if (category === 'sessions') {
      for (const [key, sess] of db.sessions.entries()) {
        if (sess.userId === userId) {
          db.sessions.delete(key);
          deletedCount++;
        }
      }
      if (supabase) {
        try {
          await supabase.from('interview_sessions').delete().eq('user_id', uuid);
        } catch (err) {
          console.warn('🔮 Error clearing sessions in Supabase:', err);
        }
      }
    } else if (category === 'usages') {
      db.usages = db.usages.map(u => {
        if (u.userId === userId) {
          deletedCount++;
          return { ...u, userId: 'deleted-user' };
        }
        return u;
      });
      if (supabase) {
        try {
          await supabase.from('ai_usages').update({ user_id: null }).eq('user_id', uuid);
        } catch (err) {
          console.warn('🔮 Error clearing AI usage in Supabase:', err);
        }
      }
    } else if (category === 'logins') {
      db.userLogins = db.userLogins.map(l => {
        if (l.userId === userId) {
          deletedCount++;
          return { ...l, userId: 'deleted-user' };
        }
        return l;
      });
      if (supabase) {
        try {
          await supabase.from('user_logins').update({ user_id: null }).eq('user_id', uuid);
        } catch (err) {
          console.warn('🔮 Error clearing logins in Supabase:', err);
        }
      }
    } else if (category === 'cache') {
      const user = db.users.get(email);
      if (user) {
        user.privacy = {
          ...(user.privacy || { dataRetentionDays: 0, anonymousAIUsage: false, allowTelemetry: true, searchHistoryCleared: false }),
          searchHistoryCleared: true
        };
        db.users.set(email, user);
        
        const settings = db.userSettings.get(userId);
        if (settings) {
          settings.privacy = user.privacy;
          db.userSettings.set(userId, settings);
        }
        deletedCount = 1;
      }
    } else {
      throw new BadRequestError(`Invalid category: ${category}`);
    }

    return { success: true, deletedCount };
  }
}
