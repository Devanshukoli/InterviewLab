import React from 'react';
import AppLogo from './AppLogo';

export default function AppBootSplash() {
  return (
    <div
      className="h-full w-full flex flex-col items-center justify-center bg-zinc-50 dark:bg-[#09090b] gap-4"
      role="status"
      aria-live="polite"
      aria-label="Loading InterviewLab"
    >
      <AppLogo size={72} className="animate-pulse ring-1 ring-zinc-200 dark:ring-white/15" />
      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
        Loading
      </span>
    </div>
  );
}
