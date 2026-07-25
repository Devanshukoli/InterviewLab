import { InterviewOptions } from './domain-types';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface StartInterviewRequest {
  resumeId: string;
  resumeText?: string;
  jobDescriptionText?: string;
  options: InterviewOptions;
}

export interface EvaluateAnswerRequest {
  sessionId: string;
  questionId: string;
  answerText: string;
}

export interface UploadResumeRequest {
  text: string;
  title?: string;
  fileType?: string;
}
