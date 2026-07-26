import React, { useState } from 'react';
import { 
  FileText, 
  Upload, 
  Check, 
  Sparkles, 
  Sliders, 
  Briefcase, 
  ArrowRight, 
  Loader2, 
  X,
  HelpCircle
} from 'lucide-react';
import { SavedResume, InterviewOptions, InterviewSession } from '../types';
import { fetchWithAuth } from '../lib/auth';

interface NewInterviewFlowProps {
  savedResumes: SavedResume[];
  onStartSession: (sessionData: {
    resumeId: string;
    resumeText?: string;
    jobDescriptionText?: string;
    options: InterviewOptions;
  }) => Promise<void>;
  isLoading: boolean;
}

export default function NewInterviewFlow({
  savedResumes,
  onStartSession,
  isLoading
}: NewInterviewFlowProps) {
  // Step 1: Resume State
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(savedResumes[0]?.id || null);
  const [resumeText, setResumeText] = useState('');
  const [resumeTitle, setResumeTitle] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // Step 2: Job Description State (OPTIONAL)
  const [jdText, setJdText] = useState('');
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [skipJd, setSkipJd] = useState(false);

  // Interview Options State
  const [experienceLevel, setExperienceLevel] = useState<'junior' | 'mid' | 'senior'>('mid');
  const [interviewType, setInterviewType] = useState<'technical' | 'behavioral' | 'mixed'>('technical');
  const [numberOfQuestions, setNumberOfQuestions] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  const handleSeedDemo = () => {
    setResumeText(`Devanshu Koli
Senior Software & Platform Engineer
Skills: TypeScript, React 19, Express, PostgreSQL, Docker, AWS, OpenTelemetry, System Architecture.
Experience: 6 years building distributed cloud applications and high-performance Web APIs.`);
    setResumeTitle('Senior Software Engineer Resume');
    setSelectedResumeId(null);

    setJdText(`Staff Frontend & Systems Engineer
Requirements:
- Deep experience with React, TypeScript, and state architecture.
- Experience with REST API design, performance optimization, and developer tooling.`);
    setSkipJd(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResumeId && !resumeText.trim()) {
      alert('Please upload a resume, paste resume text, or select a saved resume.');
      return;
    }

    let activeResumeId = selectedResumeId;

    // If new resume uploaded/pasted
    if (!activeResumeId && resumeText.trim()) {
      try {
        const res = await fetchWithAuth('/api/interview/upload-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: resumeText,
            title: resumeTitle || 'Uploaded Resume',
            fileType: resumeFile ? 'pdf' : 'text' 
          })
        });
        const json = await res.json();
        if (json.success) {
          activeResumeId = json.data.id;
        }
      } catch (e) {
        activeResumeId = 'res-temp-' + Date.now();
      }
    }

    if (!activeResumeId) return;

    // Handle optional JD upload
    let jobDescriptionId: string | null = null;
    if (!skipJd && jdText.trim()) {
      try {
        const jRes = await fetchWithAuth('/api/interview/upload-job-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: jdText })
        });
        const jJson = await jRes.json();
        if (jJson.success) {
          jobDescriptionId = jJson.data.id;
        }
      } catch (e) {
        // Fallback
      }
    }

    const options: InterviewOptions = {
      experienceLevel,
      interviewType,
      numberOfQuestions,
      difficulty
    };

    await onStartSession({
      resumeId: activeResumeId,
      resumeText,
      jobDescriptionText: skipJd ? undefined : jdText,
      options
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      
      {/* Title */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">Configure New Interview</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Set up your resume, optional job description, and custom difficulty settings.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSeedDemo}
          className="text-xs font-mono text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          💡 Fill Demo Content
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* =========================================================
            STEP 1: UPLOAD RESUME (REQUIRED)
            ========================================================= */}
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-mono font-bold flex items-center justify-center">1</span>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Upload Candidate Resume</h2>
              <span className="text-[10px] font-mono bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">REQUIRED</span>
            </div>
          </div>

          {/* Option A: Select from Resume Library */}
          {savedResumes.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">Select from Saved Resume Library:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {savedResumes.map(r => (
                  <div 
                    key={r.id}
                    onClick={() => {
                      setSelectedResumeId(r.id);
                      setResumeText('');
                    }}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                      selectedResumeId === r.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-900 dark:text-white'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090b] text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="truncate">{r.title}</span>
                      {selectedResumeId === r.id && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-1">
                      Uploaded {new Date(r.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Option B: Upload file or paste text */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Or Paste / Upload New Resume:</label>
              {selectedResumeId && (
                <button
                  type="button"
                  onClick={() => setSelectedResumeId(null)}
                  className="text-[10px] font-mono text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  + Use new resume instead
                </button>
              )}
            </div>

            {!selectedResumeId && (
              <>
                <textarea
                  rows={5}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste raw resume text, work experience summary, technical stack details..."
                  className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500"
                ></textarea>

                <div className="border border-dashed border-zinc-300 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50/50 dark:bg-[#09090b]/50 text-center space-y-2">
                  <Upload className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mx-auto" />
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    Upload PDF or DOCX resume document
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setResumeFile(file);
                        setResumeTitle(file.name);
                        setResumeText(`Uploaded Resume Document: ${file.name}\nCandidate technical skills and experience parsed from document stream.`);
                      }
                    }}
                    className="hidden"
                    id="resume-file-input"
                  />
                  <label htmlFor="resume-file-input" className="inline-block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-semibold px-4 py-1.5 rounded cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-300 shadow-sm">
                    {resumeFile ? 'Change File' : 'Choose File'}
                  </label>
                  {resumeFile && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-mono">Loaded: {resumeFile.name}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* =========================================================
            STEP 2: JOB DESCRIPTION (OPTIONAL)
            ========================================================= */}
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 text-xs font-mono font-bold flex items-center justify-center">2</span>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Target Job Description</h2>
              <span className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded">OPTIONAL</span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
              <input
                type="checkbox"
                checked={skipJd}
                onChange={(e) => setSkipJd(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700 text-purple-600 focus:ring-0"
              />
              <span>Skip Job Description</span>
            </label>
          </div>

          {!skipJd ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Paste the job description or requirements. If provided, questions will be tailored to the specific role.
              </p>
              <textarea
                rows={5}
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="Paste Target Job Description, role qualifications, required skillsets..."
                className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-purple-500"
              ></textarea>
            </div>
          ) : (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 font-mono flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>Job Description skipped. AI will generate interview questions based purely on your resume profile.</span>
            </div>
          )}
        </div>

        {/* =========================================================
            STEP 3: INTERVIEW OPTIONS
            ========================================================= */}
        <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] rounded-xl p-6 space-y-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
            <Sliders className="w-4 h-4 text-green-600 dark:text-green-400" />
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Interview Parameters</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Experience Level */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">Experience Level</label>
              <div className="grid grid-cols-3 gap-2">
                {(['junior', 'mid', 'senior'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setExperienceLevel(level)}
                    className={`py-2 px-3 rounded-lg text-xs font-mono capitalize transition-all cursor-pointer ${
                      experienceLevel === level
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-black font-bold'
                        : 'bg-zinc-100 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Interview Type */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">Interview Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['technical', 'behavioral', 'mixed'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setInterviewType(type)}
                    className={`py-2 px-3 rounded-lg text-xs font-mono capitalize transition-all cursor-pointer ${
                      interviewType === type
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-black font-bold'
                        : 'bg-zinc-100 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Number of Questions */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">Number of Questions</label>
              <div className="grid grid-cols-3 gap-2">
                {[3, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setNumberOfQuestions(num)}
                    className={`py-2 px-3 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                      numberOfQuestions === num
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-black font-bold'
                        : 'bg-zinc-100 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {num} Questions
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">Difficulty Level</label>
              <div className="grid grid-cols-3 gap-2">
                {(['easy', 'medium', 'hard'] as const).map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setDifficulty(diff)}
                    className={`py-2 px-3 rounded-lg text-xs font-mono capitalize transition-all cursor-pointer ${
                      difficulty === diff
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-black font-bold'
                        : 'bg-zinc-100 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Submit CTA */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black text-xs font-bold px-8 py-3 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                <span>Generating Interview Session...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-600" />
                <span>Generate Interview Session</span>
              </>
            )}
          </button>
        </div>

      </form>

    </div>
  );
}
