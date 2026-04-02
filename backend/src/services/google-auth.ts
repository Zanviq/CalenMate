import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { supabaseAdmin } from './supabase';

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

interface CachedAuth {
  oauth2Client: OAuth2Client;
  expiresAt: number;
}

const authCache = new Map<string, CachedAuth>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function clearExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of authCache) {
    if (now >= entry.expiresAt) {
      authCache.delete(key);
    }
  }
}

setInterval(clearExpiredCache, 60_000).unref();

export function invalidateAuthCache(userId: string) {
  authCache.delete(userId);
}

export async function getOAuth2Client(userId: string): Promise<OAuth2Client> {
  const cached = authCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.oauth2Client;
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

  authCache.set(userId, {
    oauth2Client,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return oauth2Client;
}
