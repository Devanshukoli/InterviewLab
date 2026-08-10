import { db, UserApiKeyRecord, stringToUUID } from '../../db';
import { getSupabaseClient, unwrap } from '../../services/supabase';
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
}

export class ByokService {
  /**
   * Helper to fetch user's raw key record from db or Supabase
   */
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
            record = {
              id: data.id,
              userId: data.user_id,
              provider: data.provider as Provider,
              encryptedKey: data.encrypted_key,
              keyLastFour: data.key_last_four,
              preferredModel: data.preferred_model,
              isValid: data.is_valid,
              lastValidatedAt: data.last_validated_at,
              createdAt: data.created_at,
              updatedAt: data.updated_at
            };
            db.userApiKeys.set(memoryKey, record);
          }
        } catch (err) {
          logger.warn(`🔮 Failed to fetch user_api_key from Supabase:`, err);
        }
      }
    }

    return record || null;
  }

  /**
   * Gets all configured API keys for a user (without decrypted secret)
   */
  static async getUserKeys(userId: string): Promise<UserKeyResponseDto[]> {
    const supabase = getSupabaseClient();
    const userUuid = stringToUUID(userId);

    if (supabase) {
      try {
        const { data } = await supabase
          .from('user_api_keys')
          .select('id, user_id, provider, encrypted_key, key_last_four, preferred_model, is_valid, last_validated_at, created_at, updated_at')
          .eq('user_id', userUuid);

        if (Array.isArray(data)) {
          for (const row of data) {
            const memoryKey = `${userId}:${row.provider}`;
            db.userApiKeys.set(memoryKey, {
              id: row.id,
              userId: row.user_id,
              provider: row.provider as Provider,
              encryptedKey: row.encrypted_key,
              keyLastFour: row.key_last_four,
              preferredModel: row.preferred_model,
              isValid: row.is_valid,
              lastValidatedAt: row.last_validated_at,
              createdAt: row.created_at,
              updatedAt: row.updated_at
            });
          }
        }
      } catch (err) {
        logger.warn('🔮 Failed to query user_api_keys from Supabase:', err);
      }
    }

    const keys: UserKeyResponseDto[] = [];
    for (const [k, record] of db.userApiKeys.entries()) {
      if (record.userId === userId || record.userId === userUuid) {
        keys.push({
          id: record.id,
          provider: record.provider,
          keyLastFour: record.keyLastFour,
          preferredModel: record.preferredModel,
          isValid: record.isValid,
          lastValidatedAt: record.lastValidatedAt
        });
      }
    }

    return keys;
  }

  /**
   * Checks if user has at least one valid key configured
   */
  static async hasValidKey(userId: string): Promise<boolean> {
    const keys = await ByokService.getUserKeys(userId);
    return keys.some(k => k.isValid);
  }

  /**
   * Saves or updates a user provider API key after live validation
   */
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
      lastValidatedAt: now,
      createdAt: now,
      updatedAt: now
    };

    const memoryKey = `${userId}:${provider}`;
    db.userApiKeys.set(memoryKey, record);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await unwrap(supabase.from('user_api_keys').upsert({
          user_id: userUuid,
          provider,
          encrypted_key: encryptedKey,
          key_last_four: keyLastFour,
          preferred_model: chosenModel,
          is_valid: true,
          last_validated_at: now,
          updated_at: now
        }, { onConflict: 'user_id,provider' }));
      } catch (supaErr) {
        logger.warn('🔮 Failed to save user_api_key to Supabase:', supaErr);
      }
    }

    return {
      key: {
        id: record.id,
        provider: record.provider,
        keyLastFour: record.keyLastFour,
        preferredModel: record.preferredModel,
        isValid: record.isValid,
        lastValidatedAt: record.lastValidatedAt
      },
      availableModels: validation.availableModels
    };
  }

  /**
   * Delete key for a provider
   */
  static async deleteKey(userId: string, provider: Provider): Promise<void> {
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
  }

  /**
   * Update preferred model for a provider
   */
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
      lastValidatedAt: record.lastValidatedAt
    };
  }

  /**
   * Test key connection live (either new plaintext key or existing saved key)
   */
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

    // If testing an existing saved key, update its status
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

  /**
   * Mark key as invalid in database
   */
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
