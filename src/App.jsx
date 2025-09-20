import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ToastProvider } from "./hooks/useToast.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import InboxPage from "./pages/InboxPage.jsx";
import Layout from "./components/layout/Layout.jsx";

function PrivateRoute({ children }) {
  const { user, loaded } = useAuth();
  if (!loaded)
    return (
      <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
        加载中...
      </div>
    );
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Layout fullScreen>
                      <InboxPage />
                    </Layout>
                  </PrivateRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
