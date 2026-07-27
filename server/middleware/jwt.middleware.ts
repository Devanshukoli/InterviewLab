import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { User, db, stringToUUID } from '../db';
import { userContextStorage } from './userContext.middleware';
import { getSupabaseClient } from '../services/supabase';
import { logger } from '../observability';

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  jti?: string;
  iat?: number;
  exp?: number;
  sessionId?: string;
}

export interface RefreshJwtPayload {
  id: string;
  email: string;
  tokenId: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Signs a short-lived access JWT token containing user identity details (valid for 15m)
 */
export function generateJwtToken(user: User | { id: string; email: string; name: string; role: 'user' | 'admin' }, sessionId?: string): string {
  const jti = 'at-' + crypto.randomBytes(16).toString('hex');
  const payload: JwtPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    jti,
    sessionId
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '15m', // Short-lived access token valid for 15 minutes
    issuer: 'InterviewOps-Auth'
  });
}

/**
 * Revokes an access token server-side by adding its token string and jti to the denylist
 */
export function revokeAccessToken(token: string): void {
  try {
    const decoded = jwt.decode(token) as JwtPayload | null;
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : Date.now() + 15 * 60 * 1000;
    const jti = decoded?.jti;
    const revokedAt = new Date().toISOString();

    if (jti) {
      db.revokedAccessTokens.set(jti, { tokenIdentifier: jti, jti, expiresAt, revokedAt });
    }
    db.revokedAccessTokens.set(token, { tokenIdentifier: token, jti, expiresAt, revokedAt });
  } catch (err) {
    db.revokedAccessTokens.set(token, {
      tokenIdentifier: token,
      expiresAt: Date.now() + 15 * 60 * 1000,
      revokedAt: new Date().toISOString()
    });
  }
}

/**
 * Checks if an access token or its jti has been revoked in the server denylist
 */
export function isTokenRevoked(token: string, jti?: string): boolean {
  if (db.revokedAccessTokens.has(token) || (jti && db.revokedAccessTokens.has(jti))) {
    return true;
  }

  // Housekeeping: clean expired tokens from memory denylist
  const now = Date.now();
  for (const [key, val] of db.revokedAccessTokens.entries()) {
    if (now > val.expiresAt) {
      db.revokedAccessTokens.delete(key);
    }
  }

  return false;
}

/**
 * Signs a refresh JWT token for user session renewal (valid for 7 days)
 */
export function generateRefreshToken(user: { id: string; email: string }, tokenId: string): string {
  const payload: RefreshJwtPayload = {
    id: user.id,
    email: user.email,
    tokenId,
    type: 'refresh'
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '7d', // Refresh token valid for 7 days
    issuer: 'InterviewOps-Auth'
  });
}

/**
 * Helper to issue both access token and refresh token, saving the refresh token session in storage
 */
export function generateTokens(user: User | { id: string; email: string; name: string; role: 'user' | 'admin' }): { token: string; refreshToken: string } {
  const context = userContextStorage.getStore();
  const ipAddress = context?.ipAddress || '127.0.0.1';
  const userAgent = context?.userAgent || 'Chrome / macOS (Current Session)';
  const isMobile = /mobile|android|iphone|ipad|phone/i.test(userAgent);
  const deviceType = isMobile ? 'mobile' : 'desktop';

  const sessionId = 'sess-' + crypto.randomBytes(12).toString('hex');
  const token = generateJwtToken(user, sessionId);
  const tokenId = 'rt-' + crypto.randomBytes(16).toString('hex');
  const refreshToken = generateRefreshToken(user, tokenId);

  db.refreshTokens.set(tokenId, {
    id: tokenId,
    userId: user.id,
    token: refreshToken,
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
    revoked: false,
    createdAt: new Date().toISOString()
  });

  // Track the active user session in-memory
  db.userSessions.push({
    id: sessionId,
    userId: user.id,
    token,
    ipAddress,
    userAgent,
    deviceType,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    isActive: true
  });

  // Track the session in Supabase if configured
  const supabase = getSupabaseClient();
  if (supabase) {
    const sessRow = {
      id: stringToUUID(sessionId),
      user_id: stringToUUID(user.id),
      session_token: token,
      ip_address: ipAddress,
      user_agent: userAgent,
      device_type: deviceType,
      is_active: true,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString()
    };
    (async () => {
      try {
        const { error } = await supabase.from('user_sessions').insert(sessRow);
        if (error) {
          logger.warn('🔮 [generateTokens] Failed to insert session into Supabase:', error);
        }
      } catch (err) {
        logger.warn('🔮 [generateTokens] Error inserting session into Supabase:', err);
      }
    })();
  }

  return { token, refreshToken };
}

/**
 * Checks if a session has been revoked (either in the local DB or via Supabase if configured)
 */
export async function isSessionRevoked(userId: string, sessionId?: string): Promise<boolean> {
  if (!sessionId) return false;

  // Check in-memory DB first
  const inMemorySession = db.userSessions.find(s => s.id === sessionId && s.userId === userId);
  if (inMemorySession) {
    return !inMemorySession.isActive;
  }

  // Check Supabase if configured
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('is_active')
        .eq('id', stringToUUID(sessionId))
        .eq('user_id', stringToUUID(userId))
        .maybeSingle();
      
      if (error) {
        logger.warn('🔮 [isSessionRevoked] Error checking session from Supabase:', error);
      } else if (data && data.is_active === false) {
        return true;
      }
    } catch (err) {
      logger.warn('🔮 [isSessionRevoked] Exception checking Supabase session:', err);
    }
  }

  return false;
}

/**
 * Verifies a JWT access token signature and payload
 */
export function verifyJwtToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret, { issuer: 'InterviewOps-Auth' }) as JwtPayload;
}

/**
 * Verifies a JWT refresh token signature and payload
 */
export function verifyRefreshToken(token: string): RefreshJwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret, { issuer: 'InterviewOps-Auth' }) as RefreshJwtPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

/**
 * Middleware that extracts Bearer JWT token from Request header,
 * verifies it, and populates req.user.
 */
export async function authenticateJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization || (req.headers['x-access-token'] as string);
  
  if (!authHeader) {
    next();
    return;
  }

  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7).trim() 
    : authHeader.trim();

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = verifyJwtToken(token);
    const isRevoked = isTokenRevoked(token, decoded.jti) || await isSessionRevoked(decoded.id, decoded.sessionId);
    if (isRevoked) {
      req.user = undefined;
      next();
      return;
    }
    req.user = decoded;
    next();
  } catch (err: any) {
    // If token is malformed, expired, or invalid, clear req.user so downstream routes handle appropriately
    req.user = undefined;
    next();
  }
}

/**
 * Middleware that strictly enforces authenticated requests.
 */
export function requireJWT(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required. Please provide a valid Bearer JWT.' });
    return;
  }
  next();
}
