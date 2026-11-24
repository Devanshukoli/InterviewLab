import { DEFAULT_MODEL_PER_PROVIDER, type Provider } from './model-registry';

export type SelectableByokKey = {
  provider: Provider;
  isValid: boolean;
  isPrimary: boolean;
  preferredModel?: string;
};

export type SelectedByokLlm = {
  provider: Provider;
  model: string;
};

export function selectByokLlmTarget(
  keys: SelectableByokKey[],
  requestedProvider?: string,
): SelectedByokLlm {
  const validKeys = keys.filter((key) => key.isValid);
  if (validKeys.length === 0) {
    throw new Error('No valid API key configured');
  }

  let target = requestedProvider
    ? validKeys.find((key) => key.provider === requestedProvider)
    : undefined;
  if (!target) {
    target = validKeys.find((key) => key.isPrimary);
  }
  if (!target) {
    target = validKeys[0];
  }

  return {
    provider: target.provider,
    model: target.preferredModel || DEFAULT_MODEL_PER_PROVIDER[target.provider],
  };
}
