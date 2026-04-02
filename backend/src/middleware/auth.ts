import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../services/supabase';

export interface AuthRequest extends Request {
  userId?: string;
}

// Short-lived cache for token → userId mapping
// Avoids hitting Supabase auth on every single API request
interface CachedAuth {
  userId: string;
  expiresAt: number;
}

const authCache = new Map<string, CachedAuth>();
const AUTH_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes (balance between performance and token revocation window)

// Periodically clean up expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of authCache) {
    if (now >= entry.expiresAt) {
      authCache.delete(key);
    }
  }
}, 60_000).unref();

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const token = authHeader.split(' ')[1];

  // Check cache first
  const cached = authCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    req.userId = cached.userId;
    next();
    return;
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      authCache.delete(token);
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Cache the result
    authCache.set(token, {
      userId: user.id,
      expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
    });

    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}
