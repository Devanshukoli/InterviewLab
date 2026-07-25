import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(1, 'Password is required')
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export const refreshSchema = z.object({
  refreshToken: z.string().optional()
});

export const requestResetSchema = z.object({
  email: z.string().email('Invalid email address')
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset code is required'),
  newPassword: z.string().min(1, 'New password is required')
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(1, 'New password is required')
});

export const verifyLogin2FASchema = z.object({
  mfaToken: z.string().min(1, 'MFA session token is required'),
  code: z.string().min(1, 'Verification code is required')
});

export const verify2FASchema = z.object({
  code: z.string().min(1, 'Verification code is required')
});

export const googleAuthSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  name: z.string().optional(),
  credential: z.string().optional(),
  code: z.string().optional(),
  redirect_uri: z.string().optional()
});
