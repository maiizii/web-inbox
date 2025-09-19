import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiLogin, apiLogout, apiMe } from "../api/cloudflare.js";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiMe();
      setUser(data.user || data || null);
    } catch (e) {
      if (e.status === 401) {
        setUser(null);
      } else {
        console.warn("[Auth] refresh failed:", e);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  async function login(email, password) {
    await apiLogin(email, password);
    await refreshUser();
  }
  async function logout() {
    try { await apiLogout(); } catch {}
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loaded, loading: !loaded, refreshUser, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
