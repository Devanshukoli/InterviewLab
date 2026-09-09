import { db, UserApiKeyRecord, stringToUUID } from '../../db';
import { getSupabaseClient, unwrap, isUndefinedColumnError } from '../../services/supabase';
import { encryptApiKey, decryptApiKey } from '../auth/utils/crypto';
import {
  Provider,
  validateApiKeyAndGetModels,
  invalidateModelCache,
  DEFAULT_MODEL_PER_PROVIDER,
  DEFAULT_FALLBACK_MODELS
} from '../../services/model-registry';
import { AppError } from '../../middleware/error_handling';
import { logger } from '../../observability';

export interface UserKeyResponseDto {
  id: string;
  provider: Provider;
  keyLastFour: string;
  preferredModel?: string;
  isValid: boolean;
  lastValidatedAt: string;
  isPrimary: boolean;
}

const USER_API_KEY_SELECT =
  'id, user_id, provider, encrypted_key, key_last_four, preferred_model, is_valid, last_validated_at, created_at, updated_at';
const USER_API_KEY_SELECT_WITH_PRIMARY =
  'id, user_id, provider, encrypted_key, key_last_four, preferred_model, is_valid, is_primary, last_validated_at, created_at, updated_at';

let userApiKeysHasPrimaryColumn = true;

function rowToRecord(row: any): UserApiKeyRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider as Provider,
    encryptedKey: row.encrypted_key,
    keyLastFour: row.key_last_four,
    preferredModel: row.preferred_model,
    isValid: row.is_valid,
    isPrimary: Boolean(row.is_primary),
    lastValidatedAt: row.last_validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function keysFromMemory(userId: string, userUuid: string): UserKeyResponseDto[] {
  const keys: UserKeyResponseDto[] = [];
  for (const record of db.userApiKeys.values()) {
    if (record.userId === userId || record.userId === userUuid) {
      keys.push({
        id: record.id,
        provider: record.provider,
        keyLastFour: record.keyLastFour,
        preferredModel: record.preferredModel,
        isValid: record.isValid,
        lastValidatedAt: record.lastValidatedAt,
        isPrimary: Boolean(record.isPrimary)
      });
    }
  }
  keys.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  return keys;
}

async function fetchUserApiKeyRows(userUuid: string): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const run = (columns: string) =>
    unwrap(supabase.from('user_api_keys').select(columns).eq('user_id', userUuid));

  try {
    const data = await run(
      userApiKeysHasPrimaryColumn ? USER_API_KEY_SELECT_WITH_PRIMARY : USER_API_KEY_SELECT
    );
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (userApiKeysHasPrimaryColumn && isUndefinedColumnError(err, 'is_primary')) {
      userApiKeysHasPrimaryColumn = false;
      logger.warn(
        'user_api_keys.is_primary is not in the database yet. Run sql/07_byok_primary.sql. Listing keys without that column.'
      );
      const data = await run(USER_API_KEY_SELECT);
      return Array.isArray(data) ? data : [];
    }
    throw err;
  }
}

function stripPrimaryColumn<T extends Record<string, unknown>>(payload: T): Omit<T, 'is_primary'> {
  const { is_primary: _ignored, ...rest } = payload as T & { is_primary?: unknown };
  return rest;
}

export class ByokService {
  static async getKeyByIdentifier(userId: string, keyIdentifier: string): Promise<UserApiKeyRecord | null> {
    if (['openai', 'anthropic', 'gemini'].includes(keyIdentifier)) {
      return ByokService.getKeyRecord(userId, keyIdentifier as Provider);
    }

    const keys = await ByokService.getUserKeys(userId);
    const matched = keys.find(k => k.id === keyIdentifier);
    if (matched) {
      return ByokService.getKeyRecord(userId, matched.provider);
    }
    return null;
  }

  static async getKeyRecord(userId: string, provider: Provider): Promise<UserApiKeyRecord | null> {
    const memoryKey = `${userId}:${provider}`;
    let record = db.userApiKeys.get(memoryKey);

    if (!record) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const userUuid = stringToUUID(userId);
          const { data } = await supabase
            .from('user_api_keys')
            .select('*')
            .eq('user_id', userUuid)
            .eq('provider', provider)
            .maybeSingle();

          if (data) {
            record = rowToRecord(data);
            db.userApiKeys.set(memoryKey, record);
          }
        } catch (err) {
          logger.warn(`🔮 Failed to fetch user_api_key from Supabase:`, err);
        }
      }
    }

    return record || null;
  }

  static async getUserKeys(userId: string): Promise<UserKeyResponseDto[]> {
    const supabase = getSupabaseClient();
    const userUuid = stringToUUID(userId);

    if (supabase) {
      try {
        const data = await fetchUserApiKeyRows(userUuid);
        for (const row of data) {
          db.userApiKeys.set(`${userId}:${row.provider}`, rowToRecord(row));
        }
      } catch (err) {
        logger.warn('🔮 Failed to query user_api_keys from Supabase:', err);
        const cached = keysFromMemory(userId, userUuid);
        if (cached.length > 0) {
          return cached;
        }
        throw err;
      }
    }

    return keysFromMemory(userId, userUuid);
  }

  static async hasValidKey(userId: string): Promise<boolean> {
    const keys = await ByokService.getUserKeys(userId);
    return keys.some(k => k.isValid);
  }

  static async saveKey(
    userId: string,
    provider: Provider,
    apiKey: string,
    preferredModel?: string
  ): Promise<{ key: UserKeyResponseDto; availableModels: string[] }> {
    const validation = await validateApiKeyAndGetModels(provider, apiKey, userId);
    if (!validation.isValid) {
      throw new AppError(validation.error ? `That key was rejected by ${provider}: ${validation.error}. Double check it and try again.` : `That key was rejected by ${provider}. Double check it and try again.`, 422);
    }

    const encryptedKey = encryptApiKey(apiKey.trim());
    const keyLastFour = apiKey.trim().slice(-4);
    const now = new Date().toISOString();
    const userUuid = stringToUUID(userId);
    const chosenModel = preferredModel || validation.availableModels[0] || DEFAULT_MODEL_PER_PROVIDER[provider];

    const record: UserApiKeyRecord = {
      id: crypto.randomUUID(),
      userId,
      provider,
      encryptedKey,
      keyLastFour,
      preferredModel: chosenModel,
      isValid: true,
      isPrimary: true,
      lastValidatedAt: now,
      createdAt: now,
      updatedAt: now
    };

    const memoryKey = `${userId}:${provider}`;
    db.userApiKeys.set(memoryKey, record);

    const supabase = getSupabaseClient();
    if (supabase) {
      const payload: Record<string, unknown> = {
        user_id: userUuid,
        provider,
        encrypted_key: encryptedKey,
        key_last_four: keyLastFour,
        preferred_model: chosenModel,
        is_valid: true,
        last_validated_at: now,
        updated_at: now
      };
      if (userApiKeysHasPrimaryColumn) {
        payload.is_primary = true;
      }
      try {
        await unwrap(supabase.from('user_api_keys').upsert(payload, { onConflict: 'user_id,provider' }));
      } catch (supaErr) {
        if (userApiKeysHasPrimaryColumn && isUndefinedColumnError(supaErr, 'is_primary')) {
          userApiKeysHasPrimaryColumn = false;
          try {
            await unwrap(
              supabase.from('user_api_keys').upsert(stripPrimaryColumn(payload), { onConflict: 'user_id,provider' })
            );
          } catch (retryErr) {
            logger.warn('🔮 Failed to save user_api_key to Supabase:', retryErr);
          }
        } else {
          logger.warn('🔮 Failed to save user_api_key to Supabase:', supaErr);
        }
      }
    }

    await ByokService.setPrimary(userId, provider);

    return {
      key: {
        id: record.id,
        provider: record.provider,
        keyLastFour: record.keyLastFour,
        preferredModel: record.preferredModel,
        isValid: record.isValid,
        lastValidatedAt: record.lastValidatedAt,
        isPrimary: true
      },
      availableModels: validation.availableModels
    };
  }

  static async setPrimary(userId: string, provider: Provider): Promise<void> {
    const target = await ByokService.getKeyRecord(userId, provider);
    if (!target) {
      throw new AppError(`No API key configured for provider ${provider}`, 404);
    }

    const userUuid = stringToUUID(userId);
    const now = new Date().toISOString();

    for (const [memoryKey, existing] of db.userApiKeys.entries()) {
      if (existing.userId === userId || existing.userId === userUuid) {
        existing.isPrimary = existing.provider === provider;
        existing.updatedAt = now;
        db.userApiKeys.set(memoryKey, existing);
      }
    }

    const supabase = getSupabaseClient();
    if (supabase && userApiKeysHasPrimaryColumn) {
      try {
        await unwrap(
          supabase.from('user_api_keys').update({ is_primary: false, updated_at: now }).eq('user_id', userUuid)
        );
        await unwrap(
          supabase
            .from('user_api_keys')
            .update({ is_primary: true, updated_at: now })
            .eq('user_id', userUuid)
            .eq('provider', provider)
        );
      } catch (e) {
        if (isUndefinedColumnError(e, 'is_primary')) {
          userApiKeysHasPrimaryColumn = false;
          logger.warn(
            'user_api_keys.is_primary is not in the database yet. Run sql/07_byok_primary.sql. Primary stays in process memory only.'
          );
        } else {
          logger.warn('🔮 Failed to persist primary API key in Supabase:', e);
        }
      }
    }
  }

  static async deleteKey(userId: string, provider: Provider): Promise<void> {
    const existing = await ByokService.getKeyRecord(userId, provider);
    const wasPrimary = Boolean(existing?.isPrimary);
    const memoryKey = `${userId}:${provider}`;
    db.userApiKeys.delete(memoryKey);
    invalidateModelCache(userId, provider);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const userUuid = stringToUUID(userId);
        await unwrap(supabase.from('user_api_keys').delete().eq('user_id', userUuid).eq('provider', provider));
      } catch (e) {
        logger.warn('🔮 Failed to delete user_api_key from Supabase:', e);
      }
    }

    if (wasPrimary) {
      const remaining = await ByokService.getUserKeys(userId);
      if (remaining[0]) {
        await ByokService.setPrimary(userId, remaining[0].provider);
      }
    }
  }

  static async updatePreferredModel(userId: string, provider: Provider, model: string): Promise<UserKeyResponseDto> {
    const record = await ByokService.getKeyRecord(userId, provider);
    if (!record) {
      throw new AppError(`No API key configured for provider ${provider}`, 404);
    }

    const now = new Date().toISOString();
    record.preferredModel = model;
    record.updatedAt = now;

    const memoryKey = `${userId}:${provider}`;
    db.userApiKeys.set(memoryKey, record);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const userUuid = stringToUUID(userId);
        await unwrap(supabase.from('user_api_keys').update({
          preferred_model: model,
          updated_at: now
        }).eq('user_id', userUuid).eq('provider', provider));
      } catch (e) {
        logger.warn('🔮 Failed to update preferred_model in Supabase:', e);
      }
    }

    return {
      id: record.id,
      provider: record.provider,
      keyLastFour: record.keyLastFour,
      preferredModel: record.preferredModel,
      isValid: record.isValid,
      lastValidatedAt: record.lastValidatedAt,
      isPrimary: Boolean(record.isPrimary)
    };
  }

  static async testConnection(
    userId: string,
    provider: Provider,
    plaintextKey?: string
  ): Promise<{ isValid: boolean; error?: string; availableModels: string[] }> {
    let keyToTest = plaintextKey;

    if (!keyToTest) {
      const record = await ByokService.getKeyRecord(userId, provider);
      if (!record) {
        throw new AppError(`No saved API key found for ${provider}`, 404);
      }
      keyToTest = decryptApiKey(record.encryptedKey);
    }

    const res = await validateApiKeyAndGetModels(provider, keyToTest, userId);

    const existing = await ByokService.getKeyRecord(userId, provider);
    if (existing && !plaintextKey) {
      existing.isValid = res.isValid;
      existing.lastValidatedAt = new Date().toISOString();
      const memoryKey = `${userId}:${provider}`;
      db.userApiKeys.set(memoryKey, existing);

      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const userUuid = stringToUUID(userId);
          await unwrap(supabase.from('user_api_keys').update({
            is_valid: res.isValid,
            last_validated_at: existing.lastValidatedAt
          }).eq('user_id', userUuid).eq('provider', provider));
        } catch (e) {}
      }
    }

    return res;
  }

  static async markApiKeyInvalid(userId: string, provider: Provider): Promise<void> {
    const record = await ByokService.getKeyRecord(userId, provider);
    if (record) {
      record.isValid = false;
      record.lastValidatedAt = new Date().toISOString();
      const memoryKey = `${userId}:${provider}`;
      db.userApiKeys.set(memoryKey, record);
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const userUuid = stringToUUID(userId);
        await unwrap(supabase.from('user_api_keys').update({
          is_valid: false,
          last_validated_at: new Date().toISOString()
        }).eq('user_id', userUuid).eq('provider', provider));
      } catch (e) {}
    }

    invalidateModelCache(userId, provider);
  }
}
