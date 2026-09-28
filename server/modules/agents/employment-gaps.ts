import type { EmploymentGap } from '../../../src/shared/types/agent-types';

export const EMPLOYMENT_GAP_MIN_MONTHS = 4;

export interface YearMonth {
  year: number;
  month: number;
}

export interface EmploymentRole {
  label: string;
  start: YearMonth;
  end: YearMonth | 'present';
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_NAME = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const PRESENT = 'present|current|now|today';
const SEP = '(?:-|–|—|to)';
const EDUCATION = /\b(university|college|bachelor|masters?|master's|ph\.?\s*d|gpa|high school|b\.?\s*tech|diploma|b\.s\.|m\.s\.|b\.sc|m\.sc)\b/i;

function monthIndex(value: YearMonth): number {
  return value.year * 12 + (value.month - 1);
}

function monthsBetween(earlier: YearMonth, later: YearMonth): number {
  return monthIndex(later) - monthIndex(earlier);
}

function shiftMonth(value: YearMonth, delta: number): YearMonth {
  const index = monthIndex(value) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month };
}

function formatYearMonth(value: YearMonth): string {
  return `${value.year}-${String(value.month).padStart(2, '0')}`;
}

function asYearMonth(date: Date): YearMonth {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function gapQuestion(months: number, previousLabel: string, nextLabel: string, toToday: boolean): string {
  const count = `${months} month${months === 1 ? '' : 's'}`;
  if (toToday) {
    const where = previousLabel === 'a previous role' ? '' : ` at ${previousLabel}`;
    return `You have ${count} of gap from your last working month${where} to today. What happened? What were you doing these months?`;
  }
  return `You have ${count} of gap between ${previousLabel} and ${nextLabel}. What happened? What were you doing these months?`;
}

export function findEmploymentGaps(
  roles: EmploymentRole[],
  today: Date,
  minMonths = EMPLOYMENT_GAP_MIN_MONTHS
): EmploymentGap[] {
  const now = asYearMonth(today);
  const spans = roles
    .map((role) => ({
      label: role.label.trim() || 'a previous role',
      start: role.start,
      end: role.end === 'present' ? now : role.end,
    }))
    .filter((span) => span.start.month >= 1 && span.start.month <= 12 && span.end.month >= 1 && span.end.month <= 12)
    .filter((span) => monthsBetween(span.start, span.end) >= 0)
    .sort((a, b) => monthIndex(a.start) - monthIndex(b.start) || monthIndex(a.end) - monthIndex(b.end));

  const merged: typeof spans = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (!last || monthsBetween(last.end, span.start) > 1) {
      merged.push({ ...span });
      continue;
    }
    if (monthsBetween(last.end, span.end) > 0) {
      last.end = span.end;
      last.label = span.label;
    }
  }

  const gaps: EmploymentGap[] = [];
  for (let i = 0; i < merged.length - 1; i++) {
    const previous = merged[i];
    const next = merged[i + 1];
    const emptyMonths = monthsBetween(previous.end, next.start) - 1;
    if (emptyMonths >= minMonths) {
      gaps.push({
        months: emptyMonths,
        from: formatYearMonth(shiftMonth(previous.end, 1)),
        to: formatYearMonth(shiftMonth(next.start, -1)),
        previousLabel: previous.label,
        nextLabel: next.label,
        question: gapQuestion(emptyMonths, previous.label, next.label, false),
      });
    }
  }

  const latest = merged[merged.length - 1];
  if (latest && monthsBetween(latest.end, now) >= minMonths) {
    const months = monthsBetween(latest.end, now);
    gaps.push({
      months,
      from: formatYearMonth(shiftMonth(latest.end, 1)),
      to: 'today',
      previousLabel: latest.label,
      nextLabel: 'today',
      question: gapQuestion(months, latest.label, 'today', true),
    });
  }

  return gaps.sort((a, b) => {
    if (a.to === 'today') return -1;
    if (b.to === 'today') return 1;
    return b.months - a.months;
  });
}

interface DateHit {
  index: number;
  endIndex: number;
  start: YearMonth;
  end: YearMonth | 'present';
}

function monthFromName(name: string): number | null {
  return MONTHS[name.toLowerCase().replace(/\./g, '')] ?? null;
}

function hitsInLine(line: string): DateHit[] {
  const hits: DateHit[] = [];
  const monthRange = new RegExp(
    `\\b(${MONTH_NAME})\\.?\\s+(\\d{4})\\s*${SEP}\\s*(?:(${PRESENT})|(${MONTH_NAME})\\.?\\s+(\\d{4}))`,
    'gi'
  );
  const numericRange = new RegExp(
    `\\b(\\d{1,2})\\/(\\d{4})\\s*${SEP}\\s*(?:(${PRESENT})|(\\d{1,2})\\/(\\d{4}))`,
    'gi'
  );
  const yearRange = new RegExp(
    `\\b((?:19|20)\\d{2})\\s*${SEP}\\s*(?:(${PRESENT})|((?:19|20)\\d{2}))\\b`,
    'gi'
  );

  for (const match of line.matchAll(monthRange)) {
    const startMonth = monthFromName(match[1]);
    const startYear = Number(match[2]);
    if (!startMonth) continue;
    if (match[3]) {
      hits.push({
        index: match.index ?? 0,
        endIndex: (match.index ?? 0) + match[0].length,
        start: { year: startYear, month: startMonth },
        end: 'present',
      });
      continue;
    }
    const endMonth = monthFromName(match[4]);
    const endYear = Number(match[5]);
    if (!endMonth) continue;
    hits.push({
      index: match.index ?? 0,
      endIndex: (match.index ?? 0) + match[0].length,
      start: { year: startYear, month: startMonth },
      end: { year: endYear, month: endMonth },
    });
  }

  for (const match of line.matchAll(numericRange)) {
    const startMonth = Number(match[1]);
    const startYear = Number(match[2]);
    if (startMonth < 1 || startMonth > 12) continue;
    if (match[3]) {
      hits.push({
        index: match.index ?? 0,
        endIndex: (match.index ?? 0) + match[0].length,
        start: { year: startYear, month: startMonth },
        end: 'present',
      });
      continue;
    }
    const endMonth = Number(match[4]);
    const endYear = Number(match[5]);
    if (endMonth < 1 || endMonth > 12) continue;
    hits.push({
      index: match.index ?? 0,
      endIndex: (match.index ?? 0) + match[0].length,
      start: { year: startYear, month: startMonth },
      end: { year: endYear, month: endMonth },
    });
  }

  for (const match of line.matchAll(yearRange)) {
    const index = match.index ?? 0;
    const endIndex = index + match[0].length;
    if (hits.some((hit) => index < hit.endIndex && endIndex > hit.index)) continue;
    const startYear = Number(match[1]);
    if (match[2]) {
      hits.push({
        index,
        endIndex,
        start: { year: startYear, month: 1 },
        end: 'present',
      });
      continue;
    }
    hits.push({
      index,
      endIndex,
      start: { year: startYear, month: 1 },
      end: { year: Number(match[3]), month: 12 },
    });
  }

  return hits;
}

function isEducationContext(lines: string[], lineIndex: number): boolean {
  const window = lines.slice(Math.max(0, lineIndex - 2), lineIndex + 1).join(' ');
  return EDUCATION.test(window);
}

function labelFor(lines: string[], lineIndex: number, hit: DateHit): string {
  const sameLine = lines[lineIndex].slice(0, hit.index) + lines[lineIndex].slice(hit.endIndex);
  const cleaned = sameLine.replace(/[|•\-–—,]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length > 2) return cleaned;
  const bits: string[] = [];
  for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 2); i--) {
    const line = lines[i].trim();
    if (!line || hitsInLine(line).length > 0) continue;
    bits.unshift(line);
  }
  return bits.join(', ') || 'a previous role';
}

export function parseEmploymentRoles(resumeText: string): EmploymentRole[] {
  const lines = resumeText.split(/\r?\n/);
  const roles: EmploymentRole[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (isEducationContext(lines, lineIndex)) continue;
    for (const hit of hitsInLine(lines[lineIndex])) {
      roles.push({
        label: labelFor(lines, lineIndex, hit),
        start: hit.start,
        end: hit.end,
      });
    }
  }
  return roles;
}

export function employmentGapsFromResume(resumeText: string, today: Date): EmploymentGap[] {
  return findEmploymentGaps(parseEmploymentRoles(resumeText), today);
}

export function asksAboutEmploymentGaps(interviewType: string): boolean {
  const value = interviewType.toLowerCase();
  return value === 'behavioral' || value === 'mixed' || value.includes('hr');
}

export function preferEmploymentGapQuestions<T extends { id?: string; question?: string; questionText?: string; category?: string; type?: string; topic?: string; expectedTopics?: string[]; expectedConcepts?: string[] }>(
  questions: T[],
  gaps: EmploymentGap[],
  interviewType: string,
  limit: number
): T[] {
  if (!asksAboutEmploymentGaps(interviewType) || gaps.length === 0 || limit < 1) {
    return questions;
  }

  const leading = gaps.slice(0, limit);
  const placed: T[] = leading.map((gap, index) => {
    const base = questions[index] ?? questions[0] ?? ({} as T);
    const next: T = { ...base, id: `q-${index + 1}` };
    if ('questionText' in base || !('question' in base)) {
      next.questionText = gap.question;
    }
    if ('question' in base) {
      next.question = gap.question;
    }
    if (!('questionText' in base) && !('question' in base)) {
      next.questionText = gap.question;
    }
    if ('type' in base) next.type = 'behavioral';
    if ('category' in base) next.category = 'behavioral';
    if ('topic' in base) next.topic = 'Employment history';
    if ('expectedConcepts' in base) next.expectedConcepts = ['Employment gap', 'Career narrative'];
    if ('expectedTopics' in base) next.expectedTopics = ['Employment gap', 'Career narrative'];
    return next;
  });

  const rest = questions.slice(leading.length).map((question, index) => ({
    ...question,
    id: `q-${leading.length + index + 1}`,
  }));

  return [...placed, ...rest].slice(0, limit).map((question, index) => ({
    ...question,
    id: `q-${index + 1}`,
  }));
}
