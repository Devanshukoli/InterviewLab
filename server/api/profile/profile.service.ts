import { AuthService } from '../auth/auth.service';
import { getSupabaseClient } from '../../services/supabase';
import { stringToUUID } from '../../db';

export class ProfileService {
  static async getProfile() {
    return AuthService.getCurrentUser();
  }

  static async updateProfile(name?: string) {
    const user = AuthService.getCurrentUser();
    if (!user) {
      throw new Error('Unauthorized');
    }
    if (name) {
      user.name = name;
      AuthService.setCurrentUser(user);

      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await supabase
            .from('profiles')
            .update({ name, updated_at: new Date().toISOString() })
            .eq('id', stringToUUID(user.id));
        } catch (e) {
          console.warn('🔮 [ProfileService] Failed to update profile in Supabase:', e);
        }
      }
    }
    return user;
  }
}
