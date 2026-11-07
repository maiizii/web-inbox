// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ToastProvider } from "./hooks/useToast.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import InboxPage from "./pages/InboxPage.jsx";
import Layout from "./components/layout/Layout.jsx";
import SessionExpiredModal from "./components/auth/SessionExpiredModal.jsx";

function PrivateRoute({ children }) {
  const { user, loaded } = useAuth();

  if (!loaded) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
          加载中...
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          {/* 让路由出口拿到确定的可分配高度；内部组件才能用 min-h-0 做滚动分配 */}
          <div className="h-screen min-h-0 flex flex-col">
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      {/* fullScreen 只是个标志，真正高度控制在 Layout.jsx 里做 */}
                      <Layout fullScreen>
                        <InboxPage />
                      </Layout>
                    </PrivateRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              {/* 登录态失效的全局弹窗：任意业务接口 401 时立即提示，可直接就地重新登录 */}
              <SessionExpiredModal />
            </BrowserRouter>
          </div>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
