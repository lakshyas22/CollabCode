import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Landing page for GitHub OAuth callback.
 * GitHub redirects to: /oauth/callback?token=<jwt>
 * We read the token, store it, load the user, then redirect to dashboard.
 */
export default function OAuthCallback() {
  const [sp]      = useSearchParams();
  const navigate  = useNavigate();
  const { loginWithToken } = useAuth();
  const [error, setError]  = useState('');

  useEffect(() => {
    const token = sp.get('token');
    const err   = sp.get('error');

    if (err) {
      const msgs = {
        github_denied:       'GitHub login was cancelled.',
        github_not_configured: 'GitHub OAuth is not configured on the server.',
        github_token_failed: 'GitHub authentication failed. Please try again.',
        github_no_email:     'Your GitHub account has no public or verified email address. Please add one at github.com/settings/emails and try again.',
        github_server_error: 'Server error during GitHub login. Please try again.',
      };
      setError(msgs[err] || 'OAuth login failed. Please try again.');
      return;
    }

    if (!token) {
      setError('No authentication token received.');
      return;
    }

    // Store token and load user
    loginWithToken(token).then(() => {
      navigate('/dashboard', { replace: true });
    }).catch(e => {
      setError(e.message || 'Failed to complete login.');
    });
  }, []);

  if (error) {
    return (
      <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0b0f', padding:20 }}>
        <div style={{ maxWidth:400, textAlign:'center', padding:'40px 32px', background:'#0d0f18', border:'1px solid #1a1f30', borderRadius:14 }}>
          <div style={{ fontSize:36, marginBottom:16 }}>⚠️</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#e8ecf5', marginBottom:12 }}>Login Failed</div>
          <div style={{ fontSize:13, color:'#ff4d6d', marginBottom:24, lineHeight:1.6 }}>{error}</div>
          <button onClick={() => navigate('/login')} style={{ padding:'10px 24px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#38e2ff,#a259ff)', color:'#000', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0b0f', gap:14, color:'#4e5878', fontSize:14 }}>
      <div style={{ width:18, height:18, borderRadius:'50%', border:'2px solid #38e2ff', borderTopColor:'transparent', animation:'spin 1s linear infinite' }} />
      Completing sign in…
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
