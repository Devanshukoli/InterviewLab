import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Trash2, Plus, Loader2, X, Edit3, Paperclip, CheckCircle2, AlertCircle } from 'lucide-react';
import { SavedResume } from '../types';

interface ResumeLibraryViewProps {
  resumes: SavedResume[];
  onUploadResume: (payload: { text?: string; file?: File }, title: string) => Promise<void>;
  onUpdateResume: (id: string, payload: { title: string; text?: string; file?: File }) => Promise<void>;
  onDeleteResume: (id: string) => Promise<void>;
  onSelectResumeForSession: (resumeId: string) => void;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 30) return 'just now';
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'yesterday';
  if (diffInDays < 30) return `${diffInDays} days ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths} mo ago`;
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} y ago`;
}

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ResumeLibraryView({
  resumes,
  onUploadResume,
  onUpdateResume,
  onDeleteResume,
  onSelectResumeForSession
}: ResumeLibraryViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingResume, setEditingResume] = useState<SavedResume | null>(null);

  // Modal form state
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal Esc key binding
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const openAddModal = () => {
    setEditingResume(null);
    setTitle('');
    setText('');
    setSelectedFile(null);
    setFileError(null);
    setActiveTab('file');
    setIsModalOpen(true);
  };

  const openEditModal = (resume: SavedResume) => {
    setEditingResume(resume);
    setTitle(resume.title || '');
    setText(resume.text || '');
    setSelectedFile(null);
    setFileError(null);
    setActiveTab(resume.fileName ? 'file' : 'text');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingResume(null);
    setSelectedFile(null);
    setFileError(null);
  };

  const handleFileChange = (file: File | null) => {
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Check size limit: 8 MB max
    const MAX_SIZE = 8 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setFileError('File size exceeds the 8 MB limit. Please select a smaller file.');
      setSelectedFile(null);
      return;
    }

    // Check allowed extensions
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'doc', 'docx', 'txt'].includes(ext)) {
      setFileError('Invalid file format. Only PDF, DOC, DOCX, and TXT files are accepted.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteResume(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === 'file') {
      if (!editingResume && !selectedFile) {
        setFileError('Please select a PDF or DOC resume file to upload.');
        return;
      }
    } else {
      if (!text.trim()) {
        setFileError('Please paste your resume text content.');
        return;
      }
    }

    const finalTitle = title.trim() || (selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '') : 'My Resume');

    setIsSubmitting(true);
    setFileError(null);

    try {
      if (editingResume) {
        await onUpdateResume(editingResume.id, {
          title: finalTitle,
          text: activeTab === 'text' ? text : undefined,
          file: activeTab === 'file' && selectedFile ? selectedFile : undefined
        });
      } else {
        await onUploadResume(
          {
            text: activeTab === 'text' ? text : undefined,
            file: activeTab === 'file' && selectedFile ? selectedFile : undefined
          },
          finalTitle
        );
      }
      closeModal();
    } catch (err: any) {
      setFileError(err.message || 'Failed to process resume. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Resume Library
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Manage your uploaded resumes, file attachments, and extracted skill profiles.
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-zinc-900 dark:bg-white text-white dark:text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Resume
        </button>
      </div>

      {/* Grid of Resumes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {resumes.length === 0 ? (
          <div className="col-span-2 p-12 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3 bg-zinc-50/50 dark:bg-[#0c0c0e]/50">
            <FileText className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-700 dark:text-zinc-400 font-medium">No resumes saved in your library.</p>
            <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
              Upload PDF or DOC files up to 8MB or paste text to build personalized technical interview sessions.
            </p>
            <button
              onClick={openAddModal}
              className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-semibold px-4 py-2 rounded-lg text-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors mt-2"
            >
              Upload First Resume
            </button>
          </div>
        ) : (
          resumes.map(r => {
            const relUploaded = formatRelativeTime(r.uploadedAt);
            const dateUploaded = formatDate(r.uploadedAt);
            const relUpdated = r.updatedAt && r.updatedAt !== r.uploadedAt ? formatRelativeTime(r.updatedAt) : null;

            return (
              <div 
                key={r.id} 
                className="border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0c0c0e] hover:border-zinc-300 dark:hover:border-zinc-700/80 rounded-xl p-5 space-y-4 flex flex-col justify-between transition-all shadow-sm"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate max-w-[210px]" title={r.title}>
                          {r.title}
                        </h3>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          r.fileType === 'pdf' 
                            ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300' 
                            : r.fileType === 'docx' || r.fileType === 'doc'
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300'
                            : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}>
                          {r.fileType ? r.fileType.toUpperCase() : 'TEXT'}
                        </span>
                      </div>
                      {r.fileName && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 font-mono">
                          <Paperclip className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                          <span className="truncate max-w-[220px]">{r.fileName}</span>
                          {r.fileSize && (
                            <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">
                              ({Math.round(r.fileSize / 1024)} KB)
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Actions: Edit & Delete */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(r)}
                        className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
                        title="Edit resume details"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="text-zinc-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer disabled:opacity-50"
                        title="Delete resume"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-red-500 dark:text-red-400" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-3 font-mono leading-relaxed bg-zinc-50 dark:bg-[#09090b] p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800/50">
                    {r.text || 'No preview text extracted.'}
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800/80">
                  {/* Skills badges */}
                  <div className="flex flex-wrap gap-1">
                    {r.skills.map((s, idx) => (
                      <span key={idx} className="text-[9px] font-mono bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>

                  {/* Dates & CTA */}
                  <div className="flex items-end justify-between text-[10px] text-zinc-500 font-mono">
                    <div className="space-y-0.5">
                      <div>Uploaded {dateUploaded} {relUploaded && `(${relUploaded})`}</div>
                      {relUpdated && (
                        <div className="text-zinc-600 dark:text-zinc-400 font-semibold">Updated {relUpdated}</div>
                      )}
                    </div>
                    <button
                      onClick={() => onSelectResumeForSession(r.id)}
                      className="bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-sans"
                    >
                      Use in Interview
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Resume Modal */}
      {isModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-pointer"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#0c0c0e] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-5 relative cursor-default shadow-2xl">
            {/* Close X Button */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Close modal (Esc)"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                {editingResume ? 'Edit Resume' : 'Add Resume to Library'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {editingResume 
                  ? 'Update title, upload a replacement file, or edit text content.' 
                  : 'Choose to upload a document file (PDF/DOC, max 8MB) or paste raw text.'}
              </p>
            </div>

            {/* Option Tabs: Upload File vs Paste Text */}
            <div className="flex border-b border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => { setActiveTab('file'); setFileError(null); }}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'file' 
                    ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400' 
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload File (PDF/DOC)
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('text'); setFileError(null); }}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'text' 
                    ? 'border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400' 
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Paste Text
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error Banner */}
              {fileError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}

              {/* Title / Label */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Resume Label / Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Senior Full-Stack Architect 2026"
                  className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Tab 1: Upload File */}
              {activeTab === 'file' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                    <span>Upload File</span>
                    <span className="text-[10px] text-zinc-500">PDF, DOC, DOCX, TXT (Max 8 MB)</span>
                  </label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  />

                  {selectedFile ? (
                    <div className="p-3.5 bg-zinc-50 dark:bg-[#09090b] border border-blue-200 dark:border-blue-900/50 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-medium text-zinc-900 dark:text-zinc-200 truncate">{selectedFile.name}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'Document'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-2 py-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-[#09090b] p-6 rounded-xl text-center space-y-2 cursor-pointer transition-colors"
                    >
                      <Upload className="w-6 h-6 text-zinc-400 dark:text-zinc-400 mx-auto" />
                      <div>
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          Click to browse or drag & drop resume file
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Supports PDF, DOC, DOCX, TXT up to 8MB
                        </p>
                      </div>
                    </div>
                  )}

                  {editingResume?.fileName && !selectedFile && (
                    <p className="text-[11px] text-zinc-500 font-mono">
                      Current file: <span className="text-zinc-700 dark:text-zinc-300">{editingResume.fileName}</span> (Leave unchanged or select a new file)
                    </p>
                  )}
                </div>
              )}

              {/* Tab 2: Paste Text */}
              {activeTab === 'text' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Resume Text Content</label>
                  <textarea
                    rows={7}
                    required={activeTab === 'text'}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste complete resume text here..."
                    className="w-full bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
                  ></textarea>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-4 py-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-black text-xs font-bold px-5 py-2 rounded-lg cursor-pointer flex items-center gap-2 disabled:opacity-60 transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingResume ? 'Update Resume' : 'Save Resume'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
