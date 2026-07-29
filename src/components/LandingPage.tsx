import React, { useState } from 'react';
import { 
  Sparkles, 
  FileText, 
  Cpu, 
  Target, 
  TrendingUp, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  ArrowRight,
  Shield,
  Zap,
  Globe
} from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export default function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "How does InterviewOps generate questions from my resume?",
      a: "Our AI engine parses your resume, identifies core technical competencies, frameworks, and career history, then crafts realistic interview questions tailored to your actual experience."
    },
    {
      q: "Is a Job Description mandatory to start an interview session?",
      a: "No! A Job Description is completely optional. If provided, questions will be tailored to the target role. If skipped, questions will focus entirely on your resume and chosen difficulty options."
    },
    {
      q: "Can I bring my own API keys?",
      a: "Yes. In your settings, you can bring your own API keys for Gemini, OpenAI, or Anthropic to customize LLM providers and manage API usage directly."
    },
    {
      q: "How is my resume data kept private?",
      a: "Your uploaded resumes and session history are securely stored in your personal account space and never shared or used to train public models."
    }
  ];

  return (
    <div className="min-h-screen w-full bg-[#09090b] text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white overflow-y-auto">
      
      {/* Header / Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#09090b]/80 border-b border-zinc-800/80 px-6 lg:px-12 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-white rounded flex items-center justify-center">
            <div className="w-3.5 h-3.5 bg-black rotate-45"></div>
          </div>
          <span className="font-bold text-base tracking-tight text-white font-sans">InterviewOps</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-zinc-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          <button 
            onClick={onSignIn}
            className="text-xs font-medium text-zinc-300 hover:text-white px-3 py-1.5 transition-colors cursor-pointer"
          >
            Sign In
          </button>
          <button 
            onClick={onGetStarted}
            className="bg-white text-black text-xs font-semibold px-4 py-2 rounded-md hover:bg-zinc-200 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 px-6 lg:px-12 max-w-6xl mx-auto text-center space-y-8">
        
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 font-mono">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>Next-gen AI Interview Preparation Engine</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.15]">
          Master technical interviews with <span className="text-zinc-400">AI precision</span>
        </h1>

        <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto font-normal leading-relaxed">
          Cross-examine your resume, simulate realistic technical & behavioral rounds, and receive detailed coaching feedback with actionable domain scoring.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button 
            onClick={onGetStarted}
            className="w-full sm:w-auto bg-white text-black text-sm font-semibold px-8 py-3 rounded-lg hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-white/5 active:scale-95"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </button>
          <button 
            onClick={onSignIn}
            className="w-full sm:w-auto border border-zinc-800 bg-zinc-950/50 hover:bg-zinc-900 text-zinc-300 text-sm font-medium px-8 py-3 rounded-lg transition-all cursor-pointer"
          >
            Sign In to Dashboard
          </button>
        </div>

        {/* Hero Code / UI Preview Mock */}
        <div className="mt-16 border border-zinc-800/80 rounded-xl bg-zinc-950/60 p-4 sm:p-6 shadow-2xl text-left overflow-hidden relative">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-zinc-800"></span>
              <span className="w-3 h-3 rounded-full bg-zinc-800"></span>
              <span className="w-3 h-3 rounded-full bg-zinc-800"></span>
              <span className="text-xs font-mono text-zinc-500 ml-2">interview-session-preview.ts</span>
            </div>
            <span className="text-[10px] font-mono bg-blue-950 border border-blue-800 text-blue-300 px-2 py-0.5 rounded">AI TAILORED</span>
          </div>
          
          <div className="space-y-3 font-mono text-xs text-zinc-300">
            <div className="text-zinc-500">// AI Agent analyzes candidate resume skills: React, TypeScript, Kubernetes</div>
            <div className="p-3 bg-[#09090b] border border-zinc-800/60 rounded-md">
              <span className="text-blue-400 font-bold">Q1:</span> Given your experience scaling TypeScript services, how do you handle state propagation under burst traffic conditions?
            </div>
            <div className="p-3 bg-zinc-900/40 border border-zinc-800/40 rounded-md text-zinc-400">
              <span className="text-green-400 font-bold">Feedback Score: 92/100</span> — Excellent architectural articulation. Identified key backpressure metrics & caching strategies.
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 lg:px-12 border-t border-zinc-800/80 max-w-6xl mx-auto">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Built for serious technical preparation</h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            Clean, focused tools designed to elevate your articulation and domain confidence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-950/40 space-y-3 hover:border-zinc-700 transition-all">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Smart Resume Analysis</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Upload PDF, DOCX, or raw text. Our engine extracts your technical skills and experience level to generate relevant questions.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-950/40 space-y-3 hover:border-zinc-700 transition-all">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-purple-400">
              <Target className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Optional Job Targeting</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Targeting a specific job? Paste the Job Description to tailor questions. Don't have one? Skip and practice purely from your resume.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-950/40 space-y-3 hover:border-zinc-700 transition-all">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-green-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Actionable AI Coaching</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Get instant, constructive scoring on clarity, missing concepts, domain strengths, and a customized recommended study roadmap.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-6 lg:px-12 border-t border-zinc-800/80 max-w-6xl mx-auto">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">How InterviewOps Works</h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            3 simple steps to transform your interview performance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-950/30 relative">
            <span className="text-4xl font-extrabold text-zinc-800 font-mono block mb-2">01</span>
            <h3 className="text-sm font-bold text-white mb-2">Upload Your Resume</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Upload your PDF, DOCX, or paste text. Save multiple resumes in your Resume Library for quick access.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-950/30 relative">
            <span className="text-4xl font-extrabold text-zinc-800 font-mono block mb-2">02</span>
            <h3 className="text-sm font-bold text-white mb-2">Configure Interview Parameters</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Select difficulty (Junior, Mid, Senior), interview type (Technical, Behavioral, Mixed), and optionally paste a target JD.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-950/30 relative">
            <span className="text-4xl font-extrabold text-zinc-800 font-mono block mb-2">03</span>
            <h3 className="text-sm font-bold text-white mb-2">Practice & Review Feedback</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Answer tailored scenario questions, receive AI grading, and track topic mastery over time in your Learning Progress.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section (Coming Soon) */}
      <section id="pricing" className="py-20 px-6 lg:px-12 border-t border-zinc-800/80 max-w-6xl mx-auto">
        <div className="text-center space-y-3 mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-800/60 text-[11px] text-amber-400 font-mono">
            <span>COMING SOON</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Flexible Pricing Plans</h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            InterviewOps is currently free during beta access. Subscription tiers are planned for future release.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-90">
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-950/40 space-y-4">
            <div className="text-xs font-mono text-zinc-400 uppercase">Starter (Beta Free)</div>
            <div className="text-2xl font-bold text-white">$0 <span className="text-xs font-normal text-zinc-500">/ forever</span></div>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Unlimited Resume Uploads</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Standard AI Evaluation</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Learning Progress Dashboard</li>
            </ul>
          </div>

          <div className="p-6 rounded-xl border border-blue-500/50 bg-blue-950/10 space-y-4 relative">
            <span className="absolute -top-2.5 right-4 bg-blue-600 text-white text-[10px] font-mono px-2 py-0.5 rounded">POPULAR</span>
            <div className="text-xs font-mono text-blue-400 uppercase">Pro Architect</div>
            <div className="text-2xl font-bold text-white">$19 <span className="text-xs font-normal text-zinc-500">/ month</span></div>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Advanced Multi-Agent Coaching</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Custom LLM Key Integration</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> Resume Library & Gap Reports</li>
            </ul>
          </div>

          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-950/40 space-y-4">
            <div className="text-xs font-mono text-zinc-400 uppercase">Team Workspace</div>
            <div className="text-2xl font-bold text-white">$49 <span className="text-xs font-normal text-zinc-500">/ month</span></div>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Collaborative Practice Rooms</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Custom Prompt Templates</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Dedicated SRE Benchmarks</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-6 lg:px-12 border-t border-zinc-800/80 max-w-4xl mx-auto">
        <div className="text-center space-y-3 mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              className="border border-zinc-800/80 rounded-lg bg-zinc-950/40 overflow-hidden"
            >
              <button 
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full text-left p-5 flex items-center justify-between text-sm font-semibold text-white hover:bg-zinc-900/50 transition-colors cursor-pointer"
              >
                <span>{faq.q}</span>
                {openFaq === index ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
              </button>
              {openFaq === index && (
                <div className="p-5 pt-0 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/40 mt-1">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 py-12 px-6 lg:px-12 max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-zinc-100 rounded flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-black rotate-45"></div>
          </div>
          <span className="font-semibold text-zinc-300">InterviewOps</span>
          {/* TODO: make year below dynamic */}
          <span>© 2026. All rights reserved.</span>
        </div>

        <div className="flex items-center gap-6">
          <a href="#features" className="hover:text-zinc-300 transition-colors">Features</a>
          <a href="#pricing" className="hover:text-zinc-300 transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-zinc-300 transition-colors">FAQ</a>
        </div>
      </footer>

    </div>
  );
}
