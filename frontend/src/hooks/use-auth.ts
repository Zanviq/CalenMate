'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

export function useAuth() {
  const { user, loading, initialize, signIn, signUp, signOut } = useAuthStore();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return { user, loading, signIn, signUp, signOut };
}
