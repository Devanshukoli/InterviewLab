import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  QuestionAgent, 
  validateAndNormalizeQuestionResult, 
  calculateQuestionSimilarity 
} from '../modules/agents/question-agent';
import { LLMProvider } from '../services/llm';

describe('Question Agent Diversity and Retry Logic', () => {
  it('calculateQuestionSimilarity correctly identifies duplicates and dissimilar questions', () => {
    const q1 = "Given your background in AWS Cloud at a mid level, how would you design a fault-tolerant microservice architecture to handle spikes in traffic?";
    const q2 = "Given your background in TypeScript at a mid level, how would you design a fault-tolerant microservice architecture to handle spikes in traffic?";
    const q3 = "Explain how React's virtual DOM reconciliation algorithm works in detail.";

    const similarityDuplicates = calculateQuestionSimilarity(q1, q2);
    assert.ok(
      similarityDuplicates >= 0.6, 
      `Expected duplicate similarity >= 0.6, got ${similarityDuplicates}`
    );

    const similarityDistinct = calculateQuestionSimilarity(q1, q3);
    assert.ok(
      similarityDistinct < 0.6, 
      `Expected distinct similarity < 0.6, got ${similarityDistinct}`
    );
  });

  it('validateAndNormalizeQuestionResult flags duplicate questions as invalid', () => {
    const duplicatePayload = {
      questions: [
        {
          id: 'q-1',
          question: "Given your background in AWS Cloud at a mid level, how would you design a fault-tolerant microservice architecture to handle spikes in traffic?",
          category: 'technical',
          difficulty: 'medium',
          expectedTopics: ['AWS Cloud']
        },
        {
          id: 'q-2',
          question: "Given your background in TypeScript at a mid level, how would you design a fault-tolerant microservice architecture to handle spikes in traffic?",
          category: 'technical',
          difficulty: 'medium',
          expectedTopics: ['TypeScript']
        }
      ]
    };

    const validation = validateAndNormalizeQuestionResult(duplicatePayload, 'technical', 'medium');
    assert.equal(validation.isValid, false);
    assert.ok(validation.errors.some(e => e.includes('too similar')));
  });

  it('QuestionAgent triggers a retry when LLM returns duplicate questions', async () => {
    const duplicateResponse = JSON.stringify({
      questions: [
        {
          id: 'q-1',
          question: "Given your background in AWS Cloud at a mid level, how would you design a fault-tolerant microservice architecture to handle spikes in traffic?",
          category: 'technical',
          difficulty: 'medium',
          expectedTopics: ['AWS Cloud']
        },
        {
          id: 'q-2',
          question: "Given your background in TypeScript at a mid level, how would you design a fault-tolerant microservice architecture to handle spikes in traffic?",
          category: 'technical',
          difficulty: 'medium',
          expectedTopics: ['TypeScript']
        }
      ]
    });

    const diverseResponse = JSON.stringify({
      questions: [
        {
          id: 'q-1',
          question: "Given your background in AWS Cloud at a mid level, how would you design a fault-tolerant microservice architecture to handle spikes in traffic?",
          category: 'system-design',
          difficulty: 'medium',
          expectedTopics: ['AWS Cloud', 'Microservices']
        },
        {
          id: 'q-2',
          question: "In TypeScript, explain the practical difference between interfaces and type aliases when modeling application state.",
          category: 'coding',
          difficulty: 'medium',
          expectedTopics: ['TypeScript', 'Types']
        }
      ]
    });

    const calls: Array<{ prompt: string; systemInstruction?: string }> = [];

    const mockLLM: LLMProvider = {
      name: 'gemini' as any,
      model: 'gemini-2.5-flash',
      async generate(prompt: string, systemInstruction?: string): Promise<string> {
        calls.push({ prompt, systemInstruction });
        if (calls.length === 1) {
          return duplicateResponse;
        }
        return diverseResponse;
      },
      async embed(): Promise<number[]> {
        return [];
      }
    };

    const agent = new QuestionAgent('gemini', mockLLM);

    const input = {
      resume: {
        candidateName: 'Test Candidate',
        skills: ['AWS Cloud', 'aws cloud', 'TypeScript', '  TYPESCRIPT  ']
      },
      numberOfQuestions: 2,
      interviewType: 'technical',
      difficulty: 'medium',
      experienceLevel: 'mid'
    };

    const result = await agent.generateQuestions(input);

    // Assert retry was triggered
    assert.equal(calls.length, 2, 'Expected generate to be called twice (initial + retry)');
    assert.ok(calls[1].prompt.includes('CRITICAL DIVERSITY FAILURE IN PREVIOUS ATTEMPT'));
    assert.equal(result.questions.length, 2);
    assert.equal(result.questions[0].category, 'system-design');
    assert.equal(result.questions[1].category, 'coding');
  });
});
