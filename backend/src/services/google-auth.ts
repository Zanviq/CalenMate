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
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes (Google tokens auto-refresh via event handler)

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

  // Debounce token persistence to avoid hammering Supabase on rapid refreshes
  let tokenSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTokens: { access_token?: string; refresh_token?: string } = {};

  oauth2Client.on('tokens', (tokens) => {
    if (tokens.access_token) pendingTokens.access_token = tokens.access_token;
    if (tokens.refresh_token) pendingTokens.refresh_token = tokens.refresh_token;

    if (tokenSaveTimer) clearTimeout(tokenSaveTimer);
    tokenSaveTimer = setTimeout(async () => {
      const update: Record<string, string> = { updated_at: new Date().toISOString() };
      if (pendingTokens.access_token) update.google_access_token = pendingTokens.access_token;
      if (pendingTokens.refresh_token) update.google_refresh_token = pendingTokens.refresh_token;
      pendingTokens = {};
      await supabaseAdmin.from('profiles').update(update).eq('id', userId);
    }, 500);
  });

  authCache.set(userId, {
    oauth2Client,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return oauth2Client;
}

/**
 * Check if an error is an invalid_grant error (expired/revoked tokens).
 * When detected, invalidates the auth cache so the next call creates a fresh client.
 */
export function isInvalidGrantError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message || '';
  const code = (err as { code?: string }).code || '';
  return message.includes('invalid_grant') || code === 'invalid_grant';
}

/**
 * Invalidate cache and clear stored tokens when invalid_grant is detected.
 * Returns a user-friendly error message.
 */
export async function handleInvalidGrant(userId: string): Promise<string> {
  invalidateAuthCache(userId);
  await supabaseAdmin
    .from('profiles')
    .update({
      google_access_token: null,
      google_refresh_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  return 'Google 인증이 만료되었습니다. 설정 페이지에서 다시 로그인해주세요.';
}
