'use client';

import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import { invalidateApiToken } from '@/lib/api';
import type { Profile } from '@/types';
import type { Session } from '@supabase/supabase-js';

// Module-level singleton — avoids creating a new client per method call
const supabase = createClient();

interface AuthState {
  user: Profile | null;
  session: Session | null;
  loading: boolean;
  initialize: () => { unsubscribe: () => void };
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,

  initialize: () => {
    // `onAuthStateChange` fires an INITIAL_SESSION event right after subscription,
    // which means a manual getSession() call would race with it and run loadUser
    // twice on every mount. We rely on the listener for the initial load and
    // avoid the duplicate fetch.
    const loadUser = async (session: Session | null) => {
      try {
        if (session?.user) {
          set({ session });
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          set({ user: (data as Profile) ?? null });
        } else {
          set({ user: null, session: null });
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
        set({ user: null });
      } finally {
        set({ loading: false });
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        loadUser(session);
      }
    );

    return { unsubscribe: () => subscription.unsubscribe() };
  },

  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks',
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
        },
      },
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    invalidateApiToken();
    set({ user: null, session: null });
  },
}));
