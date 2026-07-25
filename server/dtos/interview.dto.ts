import { z } from 'zod';

export const uploadResumeSchema = z.object({
  text: z.string().min(1, 'Resume text content is required'),
  title: z.string().optional(),
  fileType: z.string().optional()
});
export type UploadResumeDto = z.infer<typeof uploadResumeSchema>;

export const uploadJobDescriptionSchema = z.object({
  text: z.string().min(1, 'Job description text content is required')
});
export type UploadJobDescriptionDto = z.infer<typeof uploadJobDescriptionSchema>;

export const generateQuestionsSchema = z.object({
  resumeId: z.string().min(1, 'resumeId parameter is required')
}).passthrough();
export type GenerateQuestionsDto = z.infer<typeof generateQuestionsSchema>;

export const evaluateSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  questionId: z.string().min(1, 'questionId is required'),
  answerText: z.string().min(1, 'answerText is required')
});
export type EvaluateDto = z.infer<typeof evaluateSchema>;

export const updateResumeSchema = z.object({
  title: z.string().optional(),
  text: z.string().optional(),
  fileType: z.string().optional()
});
export type UpdateResumeDto = z.infer<typeof updateResumeSchema>;
