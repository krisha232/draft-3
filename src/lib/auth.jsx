import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase, PROFILE_COLS } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(undefined); // null = no profile yet
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle();
    setProfile(data ?? null);
  }, [userId]);

  useEffect(() => {
    if (session === undefined) return;
    setProfile(undefined);
    refreshProfile();
  }, [session === undefined, userId, refreshProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut();
    setRecovering(false);
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user, profile, refreshProfile, recovering, setRecovering, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
