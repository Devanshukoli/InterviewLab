import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { recordMetric, logger } from '../observability';
import { AppError } from '../middleware/error_handling';
import { ByokService } from '../api/byok/byok.service';
import { decryptApiKey } from '../api/auth/utils/crypto';
import { Provider, DEFAULT_MODEL_PER_PROVIDER } from './model-registry';

export interface LLMProvider {
  name: Provider;
  model: string;
  generate(prompt: string, systemInstruction?: string): Promise<string>;
  embed(text: string): Promise<number[]>;
}

function isAuthError(error: any): boolean {
  if (!error) return false;
  const status = error.status || error.statusCode || error.response?.status;
  if (status === 401 || status === 403) return true;
  const msg = (error.message || String(error)).toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid_api_key') ||
    msg.includes('unauthorized') ||
    msg.includes('authentication') ||
    msg.includes('api_key_invalid')
  );
}

class GeminiUserProvider implements LLMProvider {
  name: Provider = 'gemini';
  model: string;
  private apiKey: string;
  private userId: string;

  constructor(apiKey: string, model: string, userId: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.userId = userId;
  }

  async generate(prompt: string, systemInstruction?: string): Promise<string> {
    recordMetric.recordLLMRequest({ provider: this.name });
    try {
      logger.info(`🔮 [GeminiUserProvider] Generating with model ${this.model}...`);
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const response = await ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });
      return response.text || '';
    } catch (error: any) {
      logger.error('❌ [GeminiUserProvider] Error:', error);
      if (isAuthError(error)) {
        await ByokService.markApiKeyInvalid(this.userId, 'gemini');
        throw new AppError('Your GEMINI API key is no longer valid — please update it in Settings.', 401);
      }
      throw new Error(`Gemini Provider failed: ${error.message}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });
      const res = response as any;
      if (res.embedding?.values) return res.embedding.values;
      if (res.embeddings?.[0]?.values) return res.embeddings[0].values;
      return [];
    } catch (error: any) {
      if (isAuthError(error)) {
        await ByokService.markApiKeyInvalid(this.userId, 'gemini');
        throw new AppError('Your GEMINI API key is no longer valid — please update it in Settings.', 401);
      }
      throw new Error(`Gemini embedding failed: ${error.message}`);
    }
  }
}

class OpenAIUserProvider implements LLMProvider {
  name: Provider = 'openai';
  model: string;
  private apiKey: string;
  private userId: string;

  constructor(apiKey: string, model: string, userId: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.userId = userId;
  }

  async generate(prompt: string, systemInstruction?: string): Promise<string> {
    recordMetric.recordLLMRequest({ provider: this.name });
    try {
      logger.info(`🔮 [OpenAIUserProvider] Generating with model ${this.model}...`);
      const client = new OpenAI({ apiKey: this.apiKey });
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: prompt });

      const completion = await client.chat.completions.create({
        model: this.model,
        messages,
      });
      return completion.choices[0]?.message?.content || '';
    } catch (error: any) {
      logger.error('❌ [OpenAIUserProvider] Error:', error);
      if (isAuthError(error)) {
        await ByokService.markApiKeyInvalid(this.userId, 'openai');
        throw new AppError('Your OPENAI API key is no longer valid — please update it in Settings.', 401);
      }
      throw new Error(`OpenAI Provider failed: ${error.message}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const client = new OpenAI({ apiKey: this.apiKey });
      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0]?.embedding || [];
    } catch (error: any) {
      if (isAuthError(error)) {
        await ByokService.markApiKeyInvalid(this.userId, 'openai');
        throw new AppError('Your OPENAI API key is no longer valid — please update it in Settings.', 401);
      }
      throw new Error(`OpenAI embedding failed: ${error.message}`);
    }
  }
}

class AnthropicUserProvider implements LLMProvider {
  name: Provider = 'anthropic';
  model: string;
  private apiKey: string;
  private userId: string;

  constructor(apiKey: string, model: string, userId: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.userId = userId;
  }

  async generate(prompt: string, systemInstruction?: string): Promise<string> {
    recordMetric.recordLLMRequest({ provider: this.name });
    try {
      logger.info(`🔮 [AnthropicUserProvider] Generating with model ${this.model}...`);
      const client = new Anthropic({ apiKey: this.apiKey });
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemInstruction || undefined,
        messages: [{ role: 'user', content: prompt }],
      });
      const firstBlock = response.content[0];
      if (firstBlock && firstBlock.type === 'text') {
        return firstBlock.text;
      }
      return '';
    } catch (error: any) {
      logger.error('❌ [AnthropicUserProvider] Error:', error);
      if (isAuthError(error)) {
        await ByokService.markApiKeyInvalid(this.userId, 'anthropic');
        throw new AppError('Your ANTHROPIC API key is no longer valid — please update it in Settings.', 401);
      }
      throw new Error(`Anthropic Provider failed: ${error.message}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const geminiClient = await getLlmClientForUser(this.userId, 'gemini').catch(() => null);
      if (geminiClient) return await geminiClient.embed(text);
      const openaiClient = await getLlmClientForUser(this.userId, 'openai').catch(() => null);
      if (openaiClient) return await openaiClient.embed(text);
    } catch (e) {}
    return [];
  }
}

function instantiateProviderClient(provider: Provider, apiKey: string, model: string, userId: string): LLMProvider {
  if (provider === 'openai') {
    return new OpenAIUserProvider(apiKey, model, userId);
  }
  if (provider === 'anthropic') {
    return new AnthropicUserProvider(apiKey, model, userId);
  }
  return new GeminiUserProvider(apiKey, model, userId);
}

/**
 * Gets LLM client for user, strictly requiring user to have configured a valid API key.
 */
export async function getLlmClientForUser(userId: string, requestedProvider?: string): Promise<LLMProvider> {
  const userKeys = await ByokService.getUserKeys(userId);
  const validKeys = userKeys.filter(k => k.isValid);

  if (validKeys.length === 0) {
    throw new AppError('No valid API key configured for this user. Please configure at least one API key in Settings before starting an interview session.', 403);
  }

  let targetKey = requestedProvider ? validKeys.find(k => k.provider === requestedProvider) : undefined;
  if (!targetKey) {
    targetKey = validKeys[0];
  }

  const record = await ByokService.getKeyRecord(userId, targetKey.provider);
  if (!record || !record.isValid) {
    throw new AppError(`No valid ${targetKey.provider.toUpperCase()} API key configured for this user.`, 403);
  }

  const apiKey = decryptApiKey(record.encryptedKey);
  const model = record.preferredModel || DEFAULT_MODEL_PER_PROVIDER[record.provider];

  return instantiateProviderClient(record.provider, apiKey, model, userId);
}

/**
 * Helper to wrap getLlmClientForUser for legacy call signatures where provider/userId might be passed.
 */
export async function getLLMProvider(requestedProvider?: string, userId?: string): Promise<LLMProvider> {
  const resolvedUserId = userId || 'usr-anonymous';
  return getLlmClientForUser(resolvedUserId, requestedProvider);
}
