import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { db } from '../db';
import { decrypt } from '../api/auth/utils/crypto';

export interface UserContext {
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const userContextStorage = new AsyncLocalStorage<UserContext>();

/**
 * Middleware that runs downstream handlers within the request-scoped AsyncLocalStorage context.
 */
export function userContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context: UserContext = {
    ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'Chrome / macOS (Current Session)'
  };
  if (req.user) {
    context.userId = req.user.id;
    context.email = req.user.email;
  }
  userContextStorage.run(context, () => {
    next();
  });
}

/**
 * Helper to retrieve decrypted user API keys for the current request context.
 * Returns null if no user is authenticated or no keys are saved.
 */
export function getCurrentUserKeys(): { gemini?: string; openai?: string; anthropic?: string } | null {
  const context = userContextStorage.getStore();
  if (!context || !context.userId) {
    return null;
  }

  // Look up user in db by email or ID
  let user = context.email ? db.users.get(context.email) : undefined;
  if (!user) {
    for (const u of db.users.values()) {
      if (u.id === context.userId) {
        user = u;
        break;
      }
    }
  }

  const savedSettings = db.userSettings.get(context.userId);
  const rawApiKeys = user?.apiKeys || savedSettings?.apiKeys;

  if (!rawApiKeys) {
    return null;
  }

  return {
    gemini: rawApiKeys.gemini ? decrypt(rawApiKeys.gemini) : undefined,
    openai: rawApiKeys.openai ? decrypt(rawApiKeys.openai) : undefined,
    anthropic: rawApiKeys.anthropic ? decrypt(rawApiKeys.anthropic) : undefined,
  };
}
