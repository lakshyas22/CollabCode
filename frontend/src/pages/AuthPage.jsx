import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const GCID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const OAUTH_ERRORS = {
  google_denied:           'Google sign-in was cancelled.',
  google_not_configured:   'Google OAuth is not configured on the server.',
  google_token_failed:     'Google authentication failed. Please try again.',
  google_no_email:         'Your Google account has no verified email address.',
  google_server_error:     'Server error during Google login. Please try again.',
  github_denied:           'GitHub sign-in was cancelled.',
  github_not_configured:   'GitHub OAuth is not configured on the server.',
  github_token_failed:     'GitHub authentication failed. Please try again.',
  github_no_email:         'Your GitHub account has no public verified email. Add one at github.com/settings/emails',
  github_server_error:     'Server error during GitHub login. Please try again.',
};

const RULES = [
  { id:'len', label:'8+ characters',    test: p => p.length >= 8 },
  { id:'up',  label:'Uppercase letter', test: p => /[A-Z]/.test(p) },
  { id:'lo',  label:'Lowercase letter', test: p => /[a-z]/.test(p) },
  { id:'num', label:'Number',           test: p => /[0-9]/.test(p) },
  { id:'sym', label:'Special character',test: p => /[^A-Za-z0-9]/.test(p) },
];

export default function AuthPage() {
  const location = useLocation();
  const [sp]     = useSearchParams();
  const redirect = sp.get('redirect') || '/dashboard';
  const initMode = location.pathname === '/signup' ? 'signup' : 'login';
  const [mode, setMode]   = useState(initMode);
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [conf, setConf]   = useState('');
  const [showP, setShowP] = useState(false);
  const [showC, setShowC] = useState(false);
  const [err,  setErr]    = useState('');
  const [busy, setBusy]   = useState(false);
  const { login, signup, loginWithGoogle } = useAuth();
  const nav = useNavigate();

  // Show errors returned by backend OAuth redirects (e.g. ?error=github_denied)
  useEffect(() => {
    const oauthErr = sp.get('error');
    if (oauthErr && OAUTH_ERRORS[oauthErr]) setErr(OAUTH_ERRORS[oauthErr]);
  }, []);

  const checks = RULES.map(r => ({ ...r, ok: r.test(pass) }));
  const score  = checks.filter(c => c.ok).length;
  const colors = ['', '#ff4d6d', '#ff8c42', '#ffd166', '#2cf59e', '#38e2ff'];

  /* Google GSI button */
  useEffect(() => {
    if (!GCID) return;
    const render = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: GCID,
        callback: async res => {
          setBusy(true); setErr('');
          try { await loginWithGoogle(res.credential); nav(redirect.startsWith('/') ? redirect : '/dashboard', { replace: true }); }
          catch (e) { setErr(e.message || 'Google sign-in failed'); }
          finally { setBusy(false); }
        },
      });
      const el = document.getElementById('g-signin-btn');
      if (el) window.google.accounts.id.renderButton(el, {
        theme: 'filled_black', size: 'large', width: 356,
        shape: 'rectangular', text: mode === 'signup' ? 'signup_with' : 'signin_with',
      });
    };
    if (window.google) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = render;
    document.head.appendChild(s);
  }, [mode]);

  const submit = async e => {
    e.preventDefault(); setErr('');
    if (mode === 'signup') {
      if (!name.trim())  { setErr('Name is required.'); return; }
      if (score < 5)     { setErr('Password does not meet all requirements.'); return; }
      if (pass !== conf) { setErr('Passwords do not match.'); return; }
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(email, pass);
      else                  await signup(name, email, pass);
      nav(redirect.startsWith('/') ? redirect : '/dashboard', { replace: true });
    } catch (e) { setErr(e.message || 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const flip = () => {
    setMode(m => m === 'login' ? 'signup' : 'login');
    setErr(''); setPass(''); setConf('');
  };

  return (
    <div className="page-auth" style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      minHeight: '100dvh', padding: '40px 16px 60px',
      background: '#0a0b0f',
      backgroundImage: 'radial-gradient(ellipse at 20% 30%, rgba(56,226,255,.07) 0%, transparent 50%), radial-gradient(ellipse at 80% 10%, rgba(162,89,255,.07) 0%, transparent 50%)',
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#0d0f18', border: '1px solid #1a1f30',
        borderRadius: 14, padding: '32px 28px',
        boxShadow: '0 24px 64px rgba(0,0,0,.6)',
        animation: 'fadein .25s ease',
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
          <div style={{ width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#38e2ff,#a259ff)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,color:'#000',fontFamily:"'JetBrains Mono',monospace" }}>CC</div>
          <span style={{ fontSize:16, fontWeight:800 }}>CollabCode</span>
        </div>

        {redirect.startsWith('/join/') && (
          <div style={{ padding:'10px 14px',borderRadius:8,background:'rgba(56,226,255,.07)',border:'1px solid rgba(56,226,255,.2)',marginBottom:18 }}>
            <div style={{ fontSize:12,fontWeight:700,color:'#38e2ff',marginBottom:2 }}>🔗 Workspace invite</div>
            <div style={{ fontSize:11,color:'#4e5878' }}>Sign in to accept the invite.</div>
          </div>
        )}

        <h1 style={{ fontSize:18,fontWeight:700,marginBottom:2 }}>{mode==='login' ? 'Sign in' : 'Create account'}</h1>
        <p style={{ fontSize:12,color:'#4e5878',marginBottom:22 }}>{mode==='login' ? 'Welcome back to CollabCode.' : 'Start collaborating in seconds.'}</p>

        {/* Social login buttons */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:18 }}>
          {GCID ? (
            <div id="g-signin-btn" style={{ minHeight:44, display:'flex', alignItems:'center', justifyContent:'center' }} />
          ) : (
            <OAuthButton
              icon={<GoogleIcon />}
              label={mode==='login' ? 'Continue with Google' : 'Sign up with Google'}
              onClick={() => { window.location.href = '/api/v1/auth/oauth/google/login'; }}
              color="#4285F4"
            />
          )}
          <OAuthButton
            icon={<GithubIcon />}
            label={mode==='login' ? 'Continue with GitHub' : 'Sign up with GitHub'}
            onClick={() => { window.location.href = '/api/v1/auth/oauth/github'; }}
            color="#e8ecf5"
          />
        </div>

        <Divider />

        <form onSubmit={submit} style={{ marginTop:14 }}>
          {mode === 'signup' && (
            <Field label="Full Name" value={name} onChange={setName} placeholder="Alice Chen" autoFocus={mode==='signup'} />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus={mode==='login'} />

          <div style={{ marginBottom:14 }}>
            <label style={LS}>Password</label>
            <PassField value={pass} onChange={setPass} show={showP}
              onToggle={() => setShowP(x => !x)}
              placeholder={mode==='signup' ? 'Create a strong password' : 'Your password'} />
            {mode === 'signup' && pass.length > 0 && (
              <div style={{ marginTop:8,padding:'10px 12px',background:'#161b28',border:'1px solid #1a1f30',borderRadius:8 }}>
                <div style={{ display:'flex', gap:3, marginBottom:8 }}>
                  {[0,1,2,3,4].map(i => (
                    <div key={i} style={{ flex:1,height:3,borderRadius:3,background:i<score?colors[score]:'#1c2030',transition:'background .2s' }} />
                  ))}
                </div>
                {checks.map(c => (
                  <div key={c.id} style={{ display:'flex',alignItems:'center',gap:7,marginBottom:4 }}>
                    <div style={{ width:14,height:14,borderRadius:'50%',background:c.ok?'#2cf59e':'#1c2030',border:`1.5px solid ${c.ok?'#2cf59e':'#252b3d'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:8,fontWeight:900,color:c.ok?'#000':'transparent' }}>✓</div>
                    <span style={{ fontSize:11,color:c.ok?'#2cf59e':'#4e5878' }}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {mode === 'signup' && (
            <div style={{ marginBottom:14 }}>
              <label style={LS}>Confirm Password</label>
              <PassField value={conf} onChange={setConf} show={showC}
                onToggle={() => setShowC(x => !x)} placeholder="Re-enter password"
                borderOverride={conf.length===0 ? undefined : conf===pass ? '#2cf59e' : '#ff4d6d'} />
              {conf.length > 0 && (
                <div style={{ marginTop:5,fontSize:11,fontWeight:600,color:conf===pass?'#2cf59e':'#ff4d6d' }}>
                  {conf===pass ? '✓ Passwords match' : '✕ Passwords do not match'}
                </div>
              )}
            </div>
          )}

          {err && (
            <div style={{ padding:'9px 12px',background:'rgba(255,77,109,.07)',border:'1px solid rgba(255,77,109,.3)',borderRadius:7,marginBottom:14,fontSize:12,color:'#ff4d6d',lineHeight:1.4 }}>
              {err}
            </div>
          )}

          <button type="submit" disabled={busy} style={{
            width:'100%',padding:'11px',borderRadius:8,border:'none',
            color:'#000',fontSize:13,fontWeight:700,
            cursor:busy?'not-allowed':'pointer',
            background:'linear-gradient(135deg,#38e2ff,#a259ff)',
            opacity:busy?0.7:1,transition:'opacity .15s',
          }}>
            {busy ? '…' : mode==='login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p style={{ marginTop:18,textAlign:'center',fontSize:12,color:'#4e5878' }}>
          {mode==='login' ? "Don't have an account? " : 'Already have one? '}
          <button onClick={flip} style={{ background:'none',border:'none',color:'#38e2ff',cursor:'pointer',fontSize:12,fontWeight:600 }}>
            {mode==='login' ? 'Sign up free' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

/* ── sub-components ── */
const LS = { display:'block',fontSize:10,fontWeight:700,color:'#4e5878',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:5 };
const IS = { width:'100%',padding:'9px 12px',background:'#161b28',border:'1px solid #1a1f30',borderRadius:6,color:'#e8ecf5',fontSize:13,outline:'none',boxSizing:'border-box',transition:'border-color .15s' };

function Field({ label, type='text', value, onChange, placeholder, autoFocus }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ marginBottom:14 }}>
      <label style={LS}>{label}</label>
      <input type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ ...IS, borderColor: f ? '#38e2ff' : '#1a1f30' }} />
    </div>
  );
}

function PassField({ value, onChange, show, onToggle, placeholder, borderOverride }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position:'relative' }}>
      <input type={show ? 'text' : 'password'} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ ...IS, paddingRight:52, borderColor: f ? '#38e2ff' : (borderOverride || '#1a1f30') }} />
      <button type="button" onClick={onToggle} style={{ position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'#4e5878',cursor:'pointer',fontSize:11,fontWeight:600 }}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function OAuthButton({ icon, label, onClick, color }) {
  const [h, setH] = useState(false);
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width:'100%', padding:'11px 14px', borderRadius:8,
        border:`1px solid ${h ? color + '60' : '#1a1f30'}`,
        background: h ? '#161b28' : '#111420',
        color:'#e8ecf5', fontSize:13, fontWeight:600, cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:10,
        transition:'all .15s',
        boxShadow: h ? `0 0 0 1px ${color}30` : 'none',
      }}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Divider() {
  return (
    <div style={{ display:'flex',alignItems:'center',gap:10,margin:'4px 0' }}>
      <div style={{ flex:1,height:1,background:'#1a1f30' }} />
      <span style={{ fontSize:11,color:'#2a3050',fontWeight:600 }}>or continue with email</span>
      <div style={{ flex:1,height:1,background:'#1a1f30' }} />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#6b7594">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}
