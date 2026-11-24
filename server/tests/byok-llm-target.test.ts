import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectByokLlmTarget } from '../services/byok-llm-target.ts';

const openai = {
  provider: 'openai' as const,
  isValid: true,
  isPrimary: true,
  preferredModel: 'gpt-4o-mini',
};

const gemini = {
  provider: 'gemini' as const,
  isValid: true,
  isPrimary: false,
  preferredModel: 'gemini-1.5-pro',
};

describe('selectByokLlmTarget', () => {
  it('uses the primary key preferred model when no provider is requested', () => {
    const target = selectByokLlmTarget([openai, gemini]);
    assert.deepEqual(target, { provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('honors an explicit provider request when that key is valid', () => {
    const target = selectByokLlmTarget([openai, gemini], 'gemini');
    assert.deepEqual(target, { provider: 'gemini', model: 'gemini-1.5-pro' });
  });

  it('falls back to the primary key when the requested provider is missing', () => {
    const target = selectByokLlmTarget([openai], 'gemini');
    assert.deepEqual(target, { provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('fills the provider default when preferredModel is empty', () => {
    const target = selectByokLlmTarget([
      { provider: 'gemini', isValid: true, isPrimary: true },
    ]);
    assert.deepEqual(target, { provider: 'gemini', model: 'gemini-2.5-flash' });
  });
});
