import React, { useState } from 'react';
import { TrendingUp, RefreshCw, Loader2 } from 'lucide-react';
import { ProgressMetric } from '../types';

interface LearningProgressViewProps {
  progress: ProgressMetric[];
  onRefresh: () => void;
}

export default function LearningProgressView({ progress, onRefresh }: LearningProgressViewProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Learning Progress & Topic Mastery
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Track confidence scores and practice frequency across engineering domains.
          </p>
        </div>
        <button
          onClick={handleRefreshClick}
          disabled={isRefreshing}
          className="border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-300 font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          {isRefreshing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 dark:text-purple-400" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          <span>{isRefreshing ? 'Updating...' : 'Refresh Stats'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {progress.length === 0 ? (
          <div className="col-span-2 p-12 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl space-y-2">
            <p className="text-xs text-zinc-500">No learning progress metrics calculated yet.</p>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-500">Complete practice interview sessions to track domain mastery over time.</p>
          </div>
        ) : (
          progress.map(item => (
            <div key={item.id} className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">{item.topic}</span>
                <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">{item.confidenceScore}%</span>
              </div>

              <div className="w-full bg-zinc-100 dark:bg-zinc-900 rounded-full h-2 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div 
                  className="bg-purple-600 dark:bg-purple-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${item.confidenceScore}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 font-mono pt-1">
                <span>{item.sessionCount} Practice Sessions</span>
                <span>Last: {new Date(item.lastPracticedAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
