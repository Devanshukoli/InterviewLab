import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { getCurrentUserKeys } from '../middleware/userContext.middleware';
import { recordMetric, logger } from '../observability';
import { EnvError, isEnvRelatedError } from '../middleware/error_handling';

export interface LLMProvider {
  name: string;
  generate(prompt: string, systemInstruction?: string): Promise<string>;
  embed(text: string): Promise<number[]>;
}

/**
 * GeminiProvider implements LLMProvider using official Google GenAI SDK (@google/genai)
 */
export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private ai: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    const userKeys = getCurrentUserKeys();
    const userApiKey = userKeys?.gemini;

    if (userApiKey) {
      logger.info('🔮 [GeminiProvider] Using request-scoped User BYOK key');
      return new GoogleGenAI({ apiKey: userApiKey });
    }

    if (!this.ai) {
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new EnvError('❌ GEMINI_API_KEY is not defined in the environment. Please add it via Secrets.');
      }
      this.ai = new GoogleGenAI({ apiKey });
    }
    return this.ai;
  }

  async generate(prompt: string, systemInstruction?: string): Promise<string> {
    recordMetric.recordLLMRequest({ provider: this.name });
    try {
      logger.info('🔮 [GeminiProvider] Initiating content generation call...');
      const client = this.getClient();
      const response = await client.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      logger.info('🔮 [GeminiProvider] Call completed successfully.');
      return response.text || '';
    } catch (error: any) {
      logger.error('❌ [GeminiProvider] Error:', error);
      if (isEnvRelatedError(error)) {
        throw error;
      }
      throw new Error(`Gemini Provider failed: ${error.message}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      logger.info('🔮 [GeminiProvider] Generating embedding vector...');
      const client = this.getClient();
      const response = await client.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });

      logger.info('🔮 [GeminiProvider] Embedding generated.');
      const res = response as any;
      if (res.embedding?.values) {
        return res.embedding.values;
      } else if (res.embeddings?.[0]?.values) {
        return res.embeddings[0].values;
      }
      return [];
    } catch (error: any) {
      logger.error('❌ [GeminiProvider] Embedding error:', error);
      if (isEnvRelatedError(error)) {
        throw error;
      }
      throw new Error(`Gemini embedding failed: ${error.message}`);
    }
  }
}

/**
 * OpenAIProvider implements LLMProvider using official OpenAI SDK
 */
export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    const userKeys = getCurrentUserKeys();
    const userApiKey = userKeys?.openai;

    if (userApiKey) {
      logger.info('🔮 [OpenAIProvider] Using request-scoped User BYOK key');
      return new OpenAI({ apiKey: userApiKey });
    }

    if (!this.client) {
      const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new EnvError('❌ OPENAI_API_KEY is not defined in the environment. Please add OPENAI_API_KEY to your environment or secrets.');
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async generate(prompt: string, systemInstruction?: string): Promise<string> {
    recordMetric.recordLLMRequest({ provider: this.name });
    try {
      logger.info('🔮 [OpenAIProvider] Initiating Chat Completion call (gpt-4o)...');
      const client = this.getClient();
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: prompt });

      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages,
      });

      logger.info('🔮 [OpenAIProvider] Call completed successfully.');
      return completion.choices[0]?.message?.content || '';
    } catch (error: any) {
      logger.error('❌ [OpenAIProvider] Error:', error);
      if (isEnvRelatedError(error)) {
        throw error;
      }
      throw new Error(`OpenAI Provider failed: ${error.message}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      logger.info('🔮 [OpenAIProvider] Generating text embedding (text-embedding-3-small)...');
      const client = this.getClient();
      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      logger.info('🔮 [OpenAIProvider] Embedding generated.');
      return response.data[0]?.embedding || [];
    } catch (error: any) {
      logger.error('❌ [OpenAIProvider] Embedding error:', error);
      if (isEnvRelatedError(error)) {
        throw error;
      }
      throw new Error(`OpenAI embedding failed: ${error.message}`);
    }
  }
}

/**
 * AnthropicProvider implements LLMProvider using official Anthropic SDK
 */
export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    const userKeys = getCurrentUserKeys();
    const userApiKey = userKeys?.anthropic;

    if (userApiKey) {
      logger.info('🔮 [AnthropicProvider] Using request-scoped User BYOK key');
      return new Anthropic({ apiKey: userApiKey });
    }

    if (!this.client) {
      const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new EnvError('❌ ANTHROPIC_API_KEY is not defined in the environment. Please add ANTHROPIC_API_KEY to your environment or secrets.');
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async generate(prompt: string, systemInstruction?: string): Promise<string> {
    recordMetric.recordLLMRequest({ provider: this.name });
    try {
      logger.info('🔮 [AnthropicProvider] Initiating Messages call (claude-3-5-sonnet-20241022)...');
      const client = this.getClient();
      const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: systemInstruction || undefined,
        messages: [{ role: 'user', content: prompt }],
      });

      logger.info('🔮 [AnthropicProvider] Call completed successfully.');
      const firstBlock = response.content[0];
      if (firstBlock && firstBlock.type === 'text') {
        return firstBlock.text;
      }
      return '';
    } catch (error: any) {
      logger.error('❌ [AnthropicProvider] Error:', error);
      if (isEnvRelatedError(error)) {
        throw error;
      }
      throw new Error(`Anthropic Provider failed: ${error.message}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    logger.warn('⚠️ [AnthropicProvider] Anthropic API does not offer native embeddings. Falling back to GeminiProvider for embeddings...');
    try {
      const gemini = new GeminiProvider();
      return await gemini.embed(text);
    } catch (e: any) {
      logger.error('❌ [AnthropicProvider] Embedding fallback failed:', e);
      if (isEnvRelatedError(e)) {
        throw e;
      }
      throw new Error(`Anthropic provider embedding fallback failed: ${e.message}`);
    }
  }
}

/**
 * Provider instances dictionary
 */
const providers: Record<string, LLMProvider> = {
  gemini: new GeminiProvider(),
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
};

/**
 * Returns active or requested LLM provider instance.
 * Defaults to config.llmProvider or 'gemini'.
 */
export function getLLMProvider(requestedProvider?: string): LLMProvider {
  const providerKey = (requestedProvider || config.llmProvider || 'gemini').toLowerCase();
  const selected = providers[providerKey];

  if (!selected) {
    logger.warn(`⚠️ Provider '${providerKey}' not recognized. Falling back to Gemini provider.`);
    return providers.gemini;
  }

  return selected;
}
