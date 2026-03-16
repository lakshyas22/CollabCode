import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('cc_token');
    if (!t) { setLoading(false); return; }
    api.me().then(setUser).catch(() => localStorage.removeItem('cc_token')).finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api.login(email, password);
    localStorage.setItem('cc_token', r.access_token);
    setUser(r.user);
  };

  const signup = async (name, email, password) => {
    const r = await api.signup(name, email, password);
    localStorage.setItem('cc_token', r.access_token);
    setUser(r.user);
  };

  const loginWithGoogle = async (credential) => {
    const r = await api.googleAuth(credential);
    localStorage.setItem('cc_token', r.access_token);
    setUser(r.user);
  };

  // Used by OAuthCallback page after GitHub redirect
  const loginWithToken = async (token) => {
    localStorage.setItem('cc_token', token);
    const u = await api.me();
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('cc_token');
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch (_) {}
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, signup, loginWithGoogle, loginWithToken, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }
