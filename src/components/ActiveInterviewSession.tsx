import React, { useState } from 'react';
import { 
  Send, 
  Loader2, 
  Info, 
  HelpCircle, 
  CheckCircle2, 
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { InterviewSession } from '../types';

interface ActiveInterviewSessionProps {
  session: InterviewSession;
  onAnswerSubmit: (questionId: string, answerText: string) => Promise<void>;
  onCompleteSession: () => void;
  isEvaluating: boolean;
}

export default function ActiveInterviewSession({
  session,
  onAnswerSubmit,
  onCompleteSession,
  isEvaluating
}: ActiveInterviewSessionProps) {
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState('');

  const questionsList = session.questions || [];
  const activeQuestion = questionsList[activeQuestionIndex];
  const isLastQuestion = activeQuestionIndex === questionsList.length - 1;
  const currentEvaluation = activeQuestion ? session.evaluations?.[activeQuestion.id] : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAnswer.trim()) return;

    await onAnswerSubmit(activeQuestion.id, currentAnswer);

    if (!isLastQuestion) {
      setActiveQuestionIndex(prev => prev + 1);
      setCurrentAnswer('');
    } else {
      onCompleteSession();
    }
  };

  const handleAutoFill = () => {
    setCurrentAnswer(
      `In my experience with ${activeQuestion.topic}, I structure components with clear separation of concerns, decoupling network and business state using reactive hooks. Under high traffic, I rely on client-side memoization and defensive fallback states.`
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      
      {/* Session Header Status Bar */}
      <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] p-4 rounded-xl flex items-center justify-between text-xs font-mono shadow-sm">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-zinc-900 dark:text-zinc-300 font-bold">{session.jobTitle || 'Active Practice Interview'}</span>
        </div>
        <span className="text-zinc-500 dark:text-zinc-400">
          Question <b className="text-zinc-900 dark:text-white">{activeQuestionIndex + 1}</b> of {questionsList.length}
        </span>
      </div>

      {/* Active Question Box */}
      {activeQuestion && (
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-6 sm:p-8 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase bg-blue-100 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 px-2.5 py-1 rounded font-bold">
              {activeQuestion.type} • {activeQuestion.difficulty}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              Topic: <b className="text-zinc-900 dark:text-zinc-200">{activeQuestion.topic}</b>
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-white leading-relaxed">
            {activeQuestion.questionText}
          </h2>

          {activeQuestion.expectedConcepts && activeQuestion.expectedConcepts.length > 0 && (
            <div className="p-3 bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800/80 rounded-lg text-xs space-y-1">
              <span className="text-zinc-600 dark:text-zinc-400 font-medium block">Key evaluation parameters:</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {activeQuestion.expectedConcepts.map((concept, idx) => (
                  <span key={idx} className="bg-zinc-200 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-[10px] font-mono px-2 py-0.5 rounded text-zinc-800 dark:text-zinc-300">
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evaluation Feedback if answered */}
      {currentEvaluation && (
        <div className="border border-green-300 dark:border-green-800/60 bg-green-50 dark:bg-green-950/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Question Score: {currentEvaluation.score}/100
            </span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono capitalize">Clarity: {currentEvaluation.clarityRating}</span>
          </div>
          <p className="text-xs text-zinc-800 dark:text-zinc-300 leading-relaxed">{currentEvaluation.feedback}</p>
        </div>
      )}

      {/* Answer Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between text-xs">
          <label className="font-bold text-zinc-800 dark:text-zinc-300 uppercase tracking-wider">Your Answer Response</label>
          <button
            type="button"
            onClick={handleAutoFill}
            className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white underline cursor-pointer"
          >
            💡 Auto-formulate response
          </button>
        </div>

        <textarea
          rows={8}
          required
          value={currentAnswer}
          onChange={(e) => setCurrentAnswer(e.target.value)}
          placeholder="Formulate your response detailing technical tradeoffs, architecture choices, and concrete problem-solving steps..."
          className="w-full bg-white dark:bg-[#09090b] border border-zinc-300 dark:border-zinc-800 rounded-xl p-4 text-xs font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 leading-relaxed shadow-sm"
        ></textarea>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => {
              if (activeQuestionIndex > 0) setActiveQuestionIndex(prev => prev - 1);
            }}
            disabled={activeQuestionIndex === 0}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 disabled:opacity-30 cursor-pointer"
          >
            ← Previous Question
          </button>

          <button
            type="submit"
            disabled={isEvaluating || !currentAnswer.trim()}
            className="bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black text-xs font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            {isEvaluating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                <span>Evaluating Answer...</span>
              </>
            ) : isLastQuestion ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                <span>Finish Interview & View Report</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Submit & Next Question</span>
              </>
            )}
          </button>
        </div>
      </form>

    </div>
  );
}
