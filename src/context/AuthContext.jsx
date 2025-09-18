import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiLogin, apiLogout, apiRegister, apiMe } from "../api/cloudflare.js";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 初始化拉取会话
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await apiMe();
      if (!cancelled) {
        setUser(u);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await apiLogin(email, password);
    // apiLogin 返回 { user: ... }
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (email, password, name) => {
    const res = await apiRegister(email, password, name);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
