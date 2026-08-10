import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../observability';

export type Provider = 'openai' | 'anthropic' | 'gemini';

export const DEFAULT_FALLBACK_MODELS: Record<Provider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  gemini: ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']
};

export const DEFAULT_MODEL_PER_PROVIDER: Record<Provider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  gemini: 'gemini-2.5-flash'
};

interface CacheEntry {
  models: string[];
  expiresAt: number;
}

const modelCache: Map<string, CacheEntry> = new Map();
const TTL_MS = 60 * 60 * 1000; // 1 hour

export function invalidateModelCache(userId: string, provider: Provider) {
  modelCache.delete(`${userId}:${provider}`);
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  availableModels: string[];
}

/**
 * Live test validation of a provider API key and fetching available models.
 */
export async function validateApiKeyAndGetModels(
  provider: Provider,
  apiKey: string,
  userId?: string
): Promise<ValidationResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { isValid: false, error: 'API key cannot be empty', availableModels: [] };
  }

  // Check cache first if userId provided
  if (userId) {
    const cached = modelCache.get(`${userId}:${provider}`);
    if (cached && cached.expiresAt > Date.now()) {
      return { isValid: true, availableModels: cached.models };
    }
  }

  try {
    let availableModels: string[] = [];

    if (provider === 'openai') {
      const client = new OpenAI({ apiKey: cleanKey });
      const list = await client.models.list();
      const ids: string[] = [];
      for await (const m of list) {
        if (m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3')) {
          ids.push(m.id);
        }
      }
      availableModels = ids.length > 0 ? ids : DEFAULT_FALLBACK_MODELS.openai;
    } else if (provider === 'anthropic') {
      try {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': cleanKey,
            'anthropic-version': '2023-06-01'
          }
        });
        if (res.status === 401 || res.status === 403) {
          const errBody = await res.text();
          return { isValid: false, error: 'Invalid Anthropic API key', availableModels: [] };
        }
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.data)) {
            availableModels = json.data.map((m: any) => m.id);
          }
        }
      } catch (e) {
        // Fallback test generation
      }

      if (availableModels.length === 0) {
        const client = new Anthropic({ apiKey: cleanKey });
        await client.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        });
        availableModels = DEFAULT_FALLBACK_MODELS.anthropic;
      }
    } else if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = json?.error?.message || 'Invalid Gemini API key';
        return { isValid: false, error: msg, availableModels: [] };
      }
      const json = await res.json();
      if (Array.isArray(json.models)) {
        availableModels = json.models
          .map((m: any) => m.name.replace(/^models\//, ''))
          .filter((name: string) => name.includes('gemini'));
      }
      if (availableModels.length === 0) {
        availableModels = DEFAULT_FALLBACK_MODELS.gemini;
      }
    }

    if (userId) {
      modelCache.set(`${userId}:${provider}`, {
        models: availableModels,
        expiresAt: Date.now() + TTL_MS
      });
    }

    return {
      isValid: true,
      availableModels
    };
  } catch (err: any) {
    logger.warn(`🔮 Key validation failed for provider ${provider}:`, err.message || err);
    return {
      isValid: false,
      error: err.message || `Failed to authenticate with ${provider.toUpperCase()}`,
      availableModels: []
    };
  }
}
