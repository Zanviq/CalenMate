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
const TOKEN_CACHE_MS = 30_000; // 30 seconds

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
    tokenExpiresAt = now + TOKEN_CACHE_MS;
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
