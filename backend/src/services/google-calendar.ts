import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { supabaseAdmin } from './supabase';

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// In-memory cache for OAuth2 clients per user
interface CachedClient {
  oauth2Client: OAuth2Client;
  calendar: calendar_v3.Calendar;
  expiresAt: number; // timestamp when cache entry expires
}

const clientCache = new Map<string, CachedClient>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function clearExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of clientCache) {
    if (now >= entry.expiresAt) {
      clientCache.delete(key);
    }
  }
}

// Periodically clean up expired entries (.unref() prevents blocking graceful shutdown)
setInterval(clearExpiredCache, 60_000).unref();

export function invalidateCalendarCache(userId: string) {
  clientCache.delete(userId);
}

export async function getCalendarClient(userId: string) {
  // Check cache first
  const cached = clientCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return { calendar: cached.calendar, oauth2Client: cached.oauth2Client };
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('google_access_token, google_refresh_token')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new Error('User profile not found');
  }

  if (!profile.google_access_token) {
    throw new Error('Google 계정이 연결되지 않았습니다. 다시 로그인해주세요.');
  }

  const oauth2Client = createOAuth2Client();

  oauth2Client.setCredentials({
    access_token: profile.google_access_token,
    refresh_token: profile.google_refresh_token,
  });

  // Save refreshed tokens back to DB.
  // Note: The Google OAuth2Client mutates credentials in-place when tokens refresh,
  // so the cached instance automatically picks up new tokens without cache invalidation.
  oauth2Client.on('tokens', async (tokens) => {
    const update: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (tokens.access_token) {
      update.google_access_token = tokens.access_token;
    }
    if (tokens.refresh_token) {
      update.google_refresh_token = tokens.refresh_token;
    }
    await supabaseAdmin
      .from('profiles')
      .update(update)
      .eq('id', userId);
  });

  // Only refresh if we have a refresh token — the Google client library
  // will auto-refresh on 401, so we don't need to proactively refresh every time.
  // This saves ~200-500ms per request.

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Cache the client
  clientCache.set(userId, {
    oauth2Client,
    calendar,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return { calendar, oauth2Client };
}
