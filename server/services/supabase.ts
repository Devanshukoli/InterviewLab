import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../observability';

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseClient && config.supabase.url && (config.supabase.serviceRoleKey || config.supabase.anonKey)) {
    if (!config.supabase.serviceRoleKey) {
      // This backend never authenticates through Supabase Auth (custom JWT instead), so
      // auth.uid() is always NULL from Postgres's perspective when using the anon key.
      // Every RLS policy in 02_rls_policies.sql checks auth.uid() -> every RLS-protected
      // read/write will be silently rejected. Service role bypasses RLS entirely, which is
      // the correct choice here since ownership checks already happen in application code
      // (every query below is explicitly scoped with .eq('user_id', ...)).
      logger.warn(
        '⚠️ [Supabase] Only SUPABASE_ANON_KEY is set — SUPABASE_SERVICE_ROLE_KEY is missing. ' +
        'Since this app authenticates via a custom JWT (not Supabase Auth), auth.uid() is always ' +
        'NULL and every RLS-protected query will silently fail. Set SUPABASE_SERVICE_ROLE_KEY in .env.'
      );
    }
    const key = config.supabase.serviceRoleKey || config.supabase.anonKey;
    supabaseClient = createClient(config.supabase.url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    logger.info('⚡ [Supabase] Client initialized successfully.');
  }
  return supabaseClient;
}

export const isSupabaseConfigured = (): boolean => {
  return Boolean(config.supabase.url && (config.supabase.serviceRoleKey || config.supabase.anonKey));
};

/**
 * Unwraps a Supabase query result and THROWS if `.error` is set.
 *
 * Why this exists: supabase-js never rejects/throws on a database-level error (RLS
 * rejection, bad column, constraint violation, etc.) — it always resolves successfully
 * with `{ data: null, error: {...} }`. Every call site in this codebase was doing
 * `await supabase.from(...).insert(...)` directly and only relying on try/catch, which
 * never fires for this failure mode. Wrapping every call in this function converts a
 * silent `{ error }` into a real thrown error, so the try/catch blocks that were already
 * written around these calls actually do their job (and now that logging goes through
 * pino -> SigNoz, you'll see it happen instead of it vanishing into the void).
 *
 * Usage: `const row = await unwrap(supabase.from('resumes').insert({...}).select().single());`
 */
export async function unwrap(
  queryPromise: PromiseLike<{ data: any; error: PostgrestError | null }>
): Promise<any> {
  const { data, error } = await queryPromise;
  if (error) {
    const err = new Error(
      `[Supabase] ${error.message}` +
      (error.code ? ` (code: ${error.code})` : '') +
      (error.hint ? ` — hint: ${error.hint}` : '') +
      (error.details ? ` — details: ${error.details}` : '')
    );
    (err as any).supabaseError = error;
    throw err;
  }
  return data;
}

export function isUndefinedColumnError(err: unknown, column: string): boolean {
  const pg = toPostgrestError(err);
  if (!pg) return false;
  const columnName = column.toLowerCase();
  const haystack = [pg.code, pg.message, pg.details, pg.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack.includes(columnName)) return false;
  return (
    pg.code === '42703' ||
    pg.code === 'PGRST204' ||
    haystack.includes('does not exist') ||
    haystack.includes('schema cache')
  );
}

function toPostgrestError(err: unknown): PostgrestError | null {
  if (!err || typeof err !== 'object') return null;
  const wrapped = (err as { supabaseError?: PostgrestError }).supabaseError;
  if (wrapped && typeof wrapped.message === 'string') return wrapped;
  const maybe = err as Partial<PostgrestError>;
  if (typeof maybe.message === 'string' && maybe.code) {
    return maybe as PostgrestError;
  }
  return null;
}
