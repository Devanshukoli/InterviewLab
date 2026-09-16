export function historyClientQuestionKey(index: number): string {
  return `q-${index + 1}`;
}

/** Maps generated_questions.id (the answers.question_id FK) to the client question key. */
export function historyQuestionKeyByDbId(
  questionRows: Array<{ id?: string | null }>
): Map<string, string> {
  const keyByDbId = new Map<string, string>();
  questionRows.forEach((row, idx) => {
    if (!row.id) return;
    keyByDbId.set(String(row.id).toLowerCase(), historyClientQuestionKey(idx));
  });
  return keyByDbId;
}
