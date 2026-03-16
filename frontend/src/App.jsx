import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import ErrorBoundary   from './components/ErrorBoundary.jsx';
import LandingPage     from './pages/LandingPage.jsx';
import AuthPage        from './pages/AuthPage.jsx';
import Dashboard       from './pages/Dashboard.jsx';
import WorkspacePage   from './pages/WorkspacePage.jsx';
import JoinPage        from './pages/JoinPage.jsx';
import OAuthCallback   from './pages/OAuthCallback.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0d0f1a', color:'#8b96c8', fontFamily:'system-ui', fontSize:14 }}>
      Loading…
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/"         element={<PublicOnly><LandingPage /></PublicOnly>} />
            <Route path="/login"    element={<PublicOnly><AuthPage /></PublicOnly>} />
            <Route path="/signup"   element={<PublicOnly><AuthPage /></PublicOnly>} />
            <Route path="/oauth/callback"         element={<OAuthCallback />} />
            <Route path="/join/:token"            element={<JoinPage />} />
            <Route path="/dashboard"              element={<Protected><ErrorBoundary><Dashboard /></ErrorBoundary></Protected>} />
            <Route path="/workspace/:workspaceId" element={<Protected><ErrorBoundary><WorkspacePage /></ErrorBoundary></Protected>} />
            <Route path="*"                       element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
