'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

export function useAuth() {
  const { user, session, loading, initialize, signInWithGoogle, signOut } =
    useAuthStore();

  useEffect(() => {
    const { unsubscribe } = initialize();
    return () => unsubscribe();
  }, [initialize]);

  return { user, session, loading, signInWithGoogle, signOut };
}
