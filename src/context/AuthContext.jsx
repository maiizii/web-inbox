import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiMe, apiLogout, apiLogin } from "../api/cloudflare.js";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiMe();
      setUser(data?.user || null);
      return data?.user || null;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  async function login(email, password) {
    await apiLogin(email, password);
    return refreshUser();
  }

  async function logout() {
    await apiLogout();
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, refreshUser, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
