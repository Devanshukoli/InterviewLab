import { db, Resume, JobDescription, stringToUUID } from '../../db';
import { getSupabaseClient, unwrap } from '../../services/supabase';
import { logger } from '../../observability';

export class HistoryService {
  static async getResumes(userId: string = 'usr-anonymous'): Promise<Resume[]> {
    const userUuid = stringToUUID(userId);
    const anonUuid = stringToUUID('usr-anonymous');

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('resumes')
          .select('*')
          .or(`user_id.eq.${userUuid},user_id.eq.${anonUuid}`)
          .order('uploaded_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const resumes = data.map(r => {
            const mapped: Resume = {
              id: r.id,
              userId: r.user_id || userId,
              title: r.title || 'Untitled Resume',
              text: r.raw_text || '',
              skills: r.skills || [],
              fileType: r.file_type || 'text',
              fileName: r.file_name,
              fileSize: r.file_size,
              fileUrl: r.file_url,
              experienceYears: r.experience_years || 0,
              uploadedAt: r.uploaded_at || new Date().toISOString(),
              updatedAt: r.updated_at
            };
            db.resumes.set(r.id, mapped);
            return mapped;
          });
          return resumes;
        }
      } catch (e) {
        logger.warn('🔮 [HistoryService] Failed to fetch resumes from Supabase:', e);
      }
    }

    return Array.from(db.resumes.values()).filter(r => r.userId === userId || r.userId === 'usr-anonymous');
  }

  static async deleteResume(id: string): Promise<boolean> {
    db.resumes.delete(id);
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await unwrap(supabase.from('resumes').delete().eq('id', stringToUUID(id)));
      } catch (e) {
        logger.warn('🔮 [HistoryService] Failed to delete resume in Supabase:', e);
      }
    }
    return true;
  }

  static async getJobDescriptions(userId: string = 'usr-anonymous'): Promise<JobDescription[]> {
    const userUuid = stringToUUID(userId);
    const anonUuid = stringToUUID('usr-anonymous');

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('job_descriptions')
          .select('*')
          .or(`user_id.eq.${userUuid},user_id.eq.${anonUuid}`)
          .order('uploaded_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          const jds = data.map(j => {
            const mapped: JobDescription = {
              id: j.id,
              userId: j.user_id || userId,
              title: j.title || 'Target Role',
              company: j.company || 'Tech Company',
              text: j.raw_text || '',
              requirements: j.requirements || [],
              uploadedAt: j.uploaded_at || new Date().toISOString()
            };
            db.jobDescriptions.set(j.id, mapped);
            return mapped;
          });
          return jds;
        }
      } catch (e) {
        logger.warn('🔮 [HistoryService] Failed to fetch job descriptions from Supabase:', e);
      }
    }

    return Array.from(db.jobDescriptions.values()).filter(j => j.userId === userId || j.userId === 'usr-anonymous');
  }
}
