import { getSupabaseClient } from '../../services/supabase';
import { db, User, UserSettings, stringToUUID } from '../../db';
import { ConflictError } from '../../middleware/error_handling';

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
      apiKeys: user.apiKeys || savedSettings?.apiKeys || {
        gemini: '',
        openai: '',
        anthropic: ''
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
        gemini: updateData.apiKeys.gemini || '',
        openai: updateData.apiKeys.openai || '',
        anthropic: updateData.apiKeys.anthropic || ''
      };
    }

    // Update 2FA flag if provided
    if (updateData.twoFactorEnabled !== undefined) {
      user.twoFactorEnabled = updateData.twoFactorEnabled;
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
      apiKeys: user.apiKeys || {
        gemini: '',
        openai: '',
        anthropic: ''
      }
    };
  }
}
