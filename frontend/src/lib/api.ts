import axios from 'axios';
import { createClient } from '@/lib/supabase/client';

// Singleton Supabase client for the API interceptor
let supabaseInstance: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = createClient();
  }
  return supabaseInstance;
}

// Cache the session to avoid fetching it on every API request
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;
const TOKEN_CACHE_MS = 5 * 60 * 1000; // 5 minutes

// Extract JWT exp claim to avoid caching tokens that are about to expire
function getJwtExpMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch { return null; }
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Supabase JWT
api.interceptors.request.use(async (config) => {
  const now = Date.now();

  // Use cached token if still valid
  if (cachedAccessToken && now < tokenExpiresAt) {
    config.headers.Authorization = `Bearer ${cachedAccessToken}`;
    return config;
  }

  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    cachedAccessToken = session.access_token;
    // Use the earlier of: cache TTL or 30s before JWT expiry
    const jwtExp = getJwtExpMs(session.access_token);
    const cacheUntil = jwtExp ? Math.min(now + TOKEN_CACHE_MS, jwtExp - 30_000) : now + TOKEN_CACHE_MS;
    tokenExpiresAt = Math.max(cacheUntil, now); // never set to the past
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }

  return config;
});

// Invalidate cached token on 401 and retry once
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Force refresh the token using refreshSession for reliability
      cachedAccessToken = null;
      tokenExpiresAt = 0;

      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.refreshSession();

      if (session?.access_token) {
        cachedAccessToken = session.access_token;
        tokenExpiresAt = Date.now() + TOKEN_CACHE_MS;
        originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
        return api(originalRequest);
      }
    }

    return Promise.reject(error);
  }
);

export function invalidateApiToken() {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

export default api;
