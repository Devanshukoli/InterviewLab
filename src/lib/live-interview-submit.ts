export type AfterAnswerSubmitAction = 'stay' | 'next' | 'finish';

const NETWORK_SAVE_FALLBACK =
  'Network issue. Your answer was not saved. Stay on this question and try again.';

export function afterAnswerSubmitAction(
  submitSucceeded: boolean,
  isLastQuestion: boolean,
): AfterAnswerSubmitAction {
  if (!submitSucceeded) return 'stay';
  if (isLastQuestion) return 'finish';
  return 'next';
}

export function formatAnswerSaveError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return NETWORK_SAVE_FALLBACK;
}
