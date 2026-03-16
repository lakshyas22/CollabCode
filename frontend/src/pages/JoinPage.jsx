import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../utils/api.js';

/**
 * JoinPage — handles invite links.
 * Accepts:
 *   /join/:token        — direct token in URL path
 *   /join?link=<url>    — full invite URL pasted by user
 */
export default function JoinPage() {
  const { token: pathToken } = useParams();
  const [sp]                 = useSearchParams();
  const { user, loading }    = useAuth();
  const navigate             = useNavigate();
  const [status, setStatus]  = useState('idle');
  const [error,  setError]   = useState('');

  // Extract token from path or from a pasted full URL
  const extractToken = (raw) => {
    if (!raw) return '';
    raw = raw.trim();
    // If it looks like a URL, extract the token from the path
    try {
      const url = new URL(raw);
      const parts = url.pathname.split('/').filter(Boolean);
      const joinIdx = parts.indexOf('join');
      if (joinIdx >= 0 && parts[joinIdx + 1]) return parts[joinIdx + 1];
    } catch (_) {}
    // Otherwise treat the whole string as the token
    return raw;
  };

  const token = pathToken || extractToken(sp.get('link') || '');

  useEffect(() => {
    if (loading) return;
    if (!token) { setStatus('error'); setError('No invite token found in the link.'); return; }
    if (!user) {
      navigate(`/login?redirect=/join/${token}`, { replace: true });
      return;
    }
    setStatus('joining');
    api.joinByToken(token)
      .then(ws => navigate(`/workspace/${ws.id}`, { replace: true }))
      .catch(e  => { setStatus('error'); setError(e.message); });
  }, [token, user, loading]);

  if (loading || status === 'idle' || status === 'joining') {
    return (
      <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg0)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, color:'var(--t1)', fontSize:14 }}>
          <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid var(--cyan)', borderTopColor:'transparent', animation:'spin 1s linear infinite' }} />
          {status === 'joining' ? 'Joining workspace…' : 'Checking invite link…'}
        </div>
        <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg0)', padding:20 }}>
      <div style={{ textAlign:'center', padding:'40px 48px', background:'var(--bg1)', border:'1px solid var(--b0)', borderRadius:14, maxWidth:420 }}>
        <div style={{ fontSize:36, marginBottom:16 }}>⚠️</div>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:8, color:'var(--t0)' }}>Could not join workspace</div>
        <div style={{ fontSize:13, color:'var(--red)', marginBottom:24, lineHeight:1.6 }}>{error}</div>
        <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
          <button onClick={()=>navigate('/dashboard')}
            style={{ padding:'9px 20px', background:'var(--bg3)', border:'1px solid var(--b0)', borderRadius:8, color:'var(--t0)', cursor:'pointer', fontSize:13 }}>
            Go to Dashboard
          </button>
          <button onClick={()=>navigate(`/login?redirect=/join/${token}`)}
            style={{ padding:'9px 20px', background:'linear-gradient(135deg,var(--cyan),var(--violet))', border:'none', borderRadius:8, color:'#000', cursor:'pointer', fontSize:13, fontWeight:700 }}>
            Switch Account
          </button>
        </div>
      </div>
    </div>
  );
}
