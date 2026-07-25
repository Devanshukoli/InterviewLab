import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { User, db } from '../db';

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  jti?: string;
  iat?: number;
  exp?: number;
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
export function generateJwtToken(user: User | { id: string; email: string; name: string; role: 'user' | 'admin' }): string {
  const jti = 'at-' + crypto.randomBytes(16).toString('hex');
  const payload: JwtPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    jti
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
  const token = generateJwtToken(user);
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

  return { token, refreshToken };
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
export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
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
    if (isTokenRevoked(token, decoded.jti)) {
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
