import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  employmentGapsFromResume,
  findEmploymentGaps,
  preferEmploymentGapQuestions,
  type EmploymentRole,
} from '../modules/agents/employment-gaps.ts';

const today = new Date(2026, 8, 28);

describe('employment gaps', () => {
  it('asks about a 7 month gap from the last working month to today', () => {
    const resume = `Acme Corp
Software Engineer
February 2026 - February 2026
`;
    const gaps = employmentGapsFromResume(resume, today);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].months, 7);
    assert.equal(gaps[0].to, 'today');
    assert.equal(
      gaps[0].question,
      'You have 7 months of gap from your last working month at Acme Corp, Software Engineer to today. What happened? What were you doing these months?'
    );
  });

  it('asks about 4 empty months between two companies and ignores a current role', () => {
    const resume = `Acme Corp
Engineer
March 2018 - January 2020

Beta LLC
Engineer
June 2020 - Present
`;
    const gaps = employmentGapsFromResume(resume, today);
    assert.deepEqual(gaps.map((gap) => gap.months), [4]);
    assert.match(gaps[0].question, /4 months of gap between Acme Corp, Engineer and Beta LLC, Engineer/);
  });

  it('ignores a 3 month hole and a degree date range', () => {
    const resume = `State University
B.S. Computer Science
2016 - 2020

Acme Corp
Engineer
January 2020 - March 2020

Beta LLC
Engineer
July 2020 - Present
`;
    assert.deepEqual(employmentGapsFromResume(resume, today), []);
  });

  it('merges overlapping roles before measuring a gap', () => {
    const roles: EmploymentRole[] = [
      { label: 'Acme', start: { year: 2018, month: 1 }, end: { year: 2020, month: 6 } },
      { label: 'Contract', start: { year: 2019, month: 6 }, end: { year: 2020, month: 1 } },
      { label: 'Beta', start: { year: 2020, month: 8 }, end: 'present' },
    ];
    const gaps = findEmploymentGaps(roles, today);
    assert.equal(gaps.length, 0);
  });

  it('replaces the leading behavioral questions and leaves a technical interview alone', () => {
    const gaps = employmentGapsFromResume(`Acme
Engineer
February 2026 - February 2026
`, today);
    const original = [
      { id: 'q-1', questionText: 'Tell me about a stakeholder decision.', type: 'behavioral', topic: 'Communication', expectedConcepts: ['Communication'] },
      { id: 'q-2', questionText: 'How do you prioritize?', type: 'behavioral', topic: 'Prioritization', expectedConcepts: ['Prioritization'] },
    ];
    const placed = preferEmploymentGapQuestions(original, gaps, 'behavioral', 2);
    assert.equal(placed[0].questionText, gaps[0].question);
    assert.equal(placed[0].topic, 'Employment history');
    assert.equal(placed[1].questionText, 'How do you prioritize?');
    assert.deepEqual(preferEmploymentGapQuestions(original, gaps, 'technical', 2), original);
  });
});
