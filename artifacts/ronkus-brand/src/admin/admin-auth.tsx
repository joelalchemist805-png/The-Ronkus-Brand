import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { adminSupabase } from './admin-supabase';
import { isInactivityExpired } from './helpers';

type SignInResult = 'success' | 'credentials' | 'not-admin' | 'error';

type AdminAuthValue = {
  isAdmin: boolean;
  checking: boolean;
  initialized: boolean;
  message: string | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  clearMessage: () => void;
};

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

async function revokeSession(): Promise<string | null> {
  const { error } = await adminSupabase.auth.signOut();
  return error ? 'Could not safely end the current session. Please try signing out again.' : null;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let verification = 0;

    const verifySession = async (session: Session, silent = false) => {
      const currentVerification = ++verification;
      const { data, error } = await adminSupabase.rpc('is_admin');
      if (!active || currentVerification !== verification) return;

      if (error) {
        if (silent) return;
        const signOutError = await revokeSession();
        if (!active) return;
        setIsAdmin(false);
        setChecking(false);
        setInitialized(true);
        setMessage(signOutError ?? 'Could not verify admin access. Please sign in again.');
        return;
      }

      if (data !== true) {
        const signOutError = await revokeSession();
        if (!active) return;
        setIsAdmin(false);
        setChecking(false);
        setInitialized(true);
        setMessage(signOutError
          ? `This account does not have admin access. ${signOutError}`
          : 'This account does not have admin access.');
        return;
      }

      if (session.user.id) {
        setIsAdmin(true);
        setChecking(false);
        setInitialized(true);
        setMessage(null);
      }
    };

    void adminSupabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setChecking(false);
        setInitialized(true);
        setMessage('Could not restore the admin session. Please sign in again.');
        return;
      }
      if (data.session) {
        void verifySession(data.session);
      } else {
        setIsAdmin(false);
        setChecking(false);
        setInitialized(true);
      }
    });

    const { data: authListener } = adminSupabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        verification += 1;
        setIsAdmin(false);
        setChecking(false);
        setInitialized(true);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (event === 'SIGNED_IN') setChecking(true);
        queueMicrotask(() => {
          if (active) void verifySession(session, event !== 'SIGNED_IN');
        });
      }
    });

    return () => {
      active = false;
      verification += 1;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const inactivityLimitMs = 30 * 60 * 1000;
    let lastActivity = Date.now();
    let signOutStarted = false;
    const endForInactivity = async () => {
      const signOutError = await revokeSession();
      setIsAdmin(false);
      setChecking(false);
      setMessage(signOutError ?? 'You were signed out after 30 minutes of inactivity.');
    };
    const checkInactivity = () => {
      if (!isInactivityExpired(lastActivity, Date.now(), inactivityLimitMs)) return false;
      if (!signOutStarted) {
        signOutStarted = true;
        void endForInactivity();
      }
      return true;
    };
    const recordActivity = () => {
      if (!checkInactivity()) lastActivity = Date.now();
    };
    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
    activityEvents.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    document.addEventListener('visibilitychange', checkInactivity);
    window.addEventListener('focus', checkInactivity);
    const interval = window.setInterval(checkInactivity, 30_000);

    return () => {
      window.clearInterval(interval);
      activityEvents.forEach((event) => window.removeEventListener(event, recordActivity));
      document.removeEventListener('visibilitychange', checkInactivity);
      window.removeEventListener('focus', checkInactivity);
    };
  }, [isAdmin]);

  const value = useMemo<AdminAuthValue>(() => ({
    isAdmin,
    checking,
    initialized,
    message,
    clearMessage: () => setMessage(null),
    signIn: async (email, password) => {
      setChecking(true);
      setMessage(null);
      const { data, error } = await adminSupabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        setIsAdmin(false);
        setChecking(false);
        return 'credentials';
      }

      const { data: adminResult, error: adminError } = await adminSupabase.rpc('is_admin');
      if (adminError || adminResult !== true) {
        const signOutError = await revokeSession();
        setIsAdmin(false);
        setChecking(false);
        setMessage(
          adminError
            ? signOutError
              ? `Could not verify admin access. ${signOutError}`
              : 'Could not verify admin access. Please sign in again.'
            : signOutError
              ? `This account does not have admin access. ${signOutError}`
              : 'This account does not have admin access.',
        );
        return adminError ? 'error' : 'not-admin';
      }

      setIsAdmin(true);
      setChecking(false);
      setMessage(null);
      return 'success';
    },
    signOut: async () => {
      const signOutError = await revokeSession();
      setIsAdmin(false);
      setChecking(false);
      setMessage(signOutError);
    },
  }), [checking, initialized, isAdmin, message]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error('useAdminAuth must be used within AdminAuthProvider.');
  return value;
}
