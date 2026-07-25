import { db, LearningProgress, stringToUUID } from '../../db';
import { getSupabaseClient } from '../../services/supabase';

export class ProgressService {
  static async getProgress(userId: string = 'usr-anonymous'): Promise<LearningProgress[]> {
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('learning_progress')
          .select('*')
          .eq('user_id', stringToUUID(userId))
          .order('last_practiced_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const progressList: LearningProgress[] = data.map(p => ({
            id: p.id,
            userId: p.user_id,
            topic: p.topic,
            confidenceScore: p.confidence_score,
            sessionCount: p.session_count,
            lastPracticedAt: p.last_practiced_at
          }));
          db.progress.set(userId, progressList);
          return progressList;
        }
      } catch (e) {
        console.warn('🔮 [ProgressService] Failed to query learning_progress in Supabase:', e);
      }
    }

    return db.progress.get(userId) || [];
  }
}
