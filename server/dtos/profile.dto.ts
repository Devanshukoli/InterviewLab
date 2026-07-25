import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('Invalid email address').optional(),
  appearance: z.enum(['light', 'dark', 'system']).optional(),
  twoFactorEnabled: z.boolean().optional(),
  apiKeys: z.object({
    gemini: z.string().optional(),
    openai: z.string().optional(),
    anthropic: z.string().optional()
  }).optional(),
  notifications: z.object({
    emailSummaries: z.boolean().optional(),
    practiceReminders: z.boolean().optional(),
    productUpdates: z.boolean().optional()
  }).optional(),
  privacy: z.object({
    dataRetentionDays: z.number().optional(),
    anonymousAIUsage: z.boolean().optional(),
    allowTelemetry: z.boolean().optional(),
    searchHistoryCleared: z.boolean().optional()
  }).optional()
});
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export const deleteProfileSchema = z.object({
  password: z.string().optional()
});
export type DeleteProfileDto = z.infer<typeof deleteProfileSchema>;

export const clearSpecificDataSchema = z.object({
  category: z.string().min(1, 'Category is required')
});
export type ClearSpecificDataDto = z.infer<typeof clearSpecificDataSchema>;
