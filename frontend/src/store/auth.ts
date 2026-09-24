'use client';

import { create } from 'zustand';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import type { Profile } from '@/types';

interface RegisterInput {
  username: string;
  password: string;
  display_name?: string;
}

interface AuthState {
  user: Profile | null;
  loading: boolean;
  initialize: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
}

// Turn an API error into the Korean message the backend sent (if any).
export function getAuthErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string; details?: string[] } | undefined;
    if (data?.details?.length) return data.details.map((d) => d.replace(/^[^:]+:\s*/, '')).join('\n');
    if (data?.error) return data.error;
  }
  return fallback;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  // Load the current user from the session cookie.
  initialize: async () => {
    try {
      const { data } = await api.get<Profile>('/api/auth/me');
      set({ user: data });
    } catch {
      set({ user: null });
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (username, password) => {
    const { data } = await api.post<Profile>('/api/auth/login', { username, password });
    set({ user: data, loading: false });
  },

  signUp: async (input) => {
    const { data } = await api.post<Profile>('/api/auth/register', input);
    set({ user: data, loading: false });
  },

  signOut: async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      set({ user: null });
    }
  },
}));
