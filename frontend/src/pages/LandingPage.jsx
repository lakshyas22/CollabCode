import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useState, useEffect, useRef } from 'react';

const features = [
  { icon:'⚡', color:'#38e2ff', title:'Real-Time Collaboration',  desc:'Multiple developers edit the same file simultaneously. See live cursors and changes instantly — just like Google Docs.' },
  { icon:'🖥️', color:'#a259ff', title:'Built-in Code Runner',     desc:'Run Python, JavaScript, and more directly in the browser. A sandboxed terminal streams output in real time.' },
  { icon:'🎨', color:'#2cf59e', title:'VS Code Experience',       desc:'Syntax highlighting for 15+ languages, keyboard shortcuts, file explorer, version history, and live HTML preview.' },
  { icon:'🔒', color:'#ffd166', title:'Role-Based Access',        desc:'Invite teammates as Editor or Viewer. Permissions are enforced server-side — not just in the frontend.' },
  { icon:'📜', color:'#ff8c42', title:'Version History',          desc:'Auto-snapshots every 50 edits plus manual named saves. Restore any previous version with one click.' },
  { icon:'💬', color:'#ff4d6d', title:'Team Chat',                desc:'Built-in per-workspace chat so your team stays in sync without needing to switch apps.' },
];

const steps = [
  { n:'1', label:'Create an account', sub:'Sign up free — email, Google, or GitHub.' },
  { n:'2', label:'Create a workspace', sub:'Name your project. Starter file included.' },
  { n:'3', label:'Invite your team',   sub:'Share an invite link. Join with one click.' },
  { n:'4', label:'Code together',      sub:'Everyone sees changes live. No refresh.' },
];

// Full code text with metadata for each character's color
const CODE_LINES = [
  { parts:[{t:'# Real-time collaboration demo',c:'#6272a4'}] },
  { parts:[] },
  { parts:[{t:'def ',c:'#38e2ff'},{t:'calculate_sum',c:'#2cf59e'},{t:'(numbers):',c:'#cdd5f5'}] },
  { parts:[{t:'    """Sum a list of numbers."""',c:'#6272a4'}] },
  { parts:[{t:'    total ',c:'#cdd5f5'},{t:'= ',c:'#8b96c8'},{t:'0',c:'#ff4d6d'}] },
  { parts:[{t:'    for ',c:'#38e2ff'},{t:'num ',c:'#cdd5f5'},{t:'in ',c:'#38e2ff'},{t:'numbers:',c:'#cdd5f5'}] },
  { parts:[{t:'        total ',c:'#cdd5f5'},{t:'+= ',c:'#8b96c8'},{t:'num',c:'#cdd5f5'}] },
  { parts:[{t:'    return ',c:'#38e2ff'},{t:'total',c:'#cdd5f5'}] },
  { parts:[] },
  { parts:[{t:'result ',c:'#cdd5f5'},{t:'= ',c:'#8b96c8'},{t:'calculate_sum',c:'#2cf59e'},{t:'([',c:'#cdd5f5'},{t:'1',c:'#ff4d6d'},{t:', ',c:'#cdd5f5'},{t:'2',c:'#ff4d6d'},{t:', ',c:'#cdd5f5'},{t:'3',c:'#ff4d6d'},{t:'])',c:'#cdd5f5'}] },
  { parts:[{t:'print',c:'#2cf59e'},{t:'(f"Sum: ',c:'#cdd5f5'},{t:'{result}',c:'#38e2ff'},{t:'")',c:'#cdd5f5'}] },
];

// Flatten into a sequence of {lineIdx, partIdx, charIdx, char, color}
function buildTypeSeq() {
  const seq = [];
  CODE_LINES.forEach((line, li) => {
    line.parts.forEach((part, pi) => {
      for (let ci = 0; ci < part.t.length; ci++) {
        seq.push({ li, pi, ci, char: part.t[ci], color: part.c });
      }
    });
    seq.push({ li, pi: -1, ci: -1, char: '\n', color: null }); // end of line
  });
  return seq;
}

function TypedCodeEditor({ isDark }) {
  const SEQ = useRef(buildTypeSeq());
  // visibleLines[li] = array of {pi, text, color} spans built up so far
  const [visibleLines, setVisibleLines] = useState(() => CODE_LINES.map(() => []));
  const [cursorLine, setCursorLine] = useState(0);
  const [cursorCol, setCursorCol]   = useState(0);
  const [done, setDone] = useState(false);
  const posRef = useRef(0);

  useEffect(() => {
    let raf;
    let lastTime = 0;
    const SPEED = 28; // ms per character

    function tick(now) {
      if (now - lastTime < SPEED) { raf = requestAnimationFrame(tick); return; }
      lastTime = now;

      const pos = posRef.current;
      if (pos >= SEQ.current.length) { setDone(true); return; }

      const ev = SEQ.current[pos];
      posRef.current = pos + 1;

      if (ev.char === '\n') {
        setCursorLine(ev.li + 1);
        setCursorCol(0);
      } else {
        setVisibleLines(prev => {
          const next = prev.map(l => [...l]);
          const line = next[ev.li];
          // Find or create span for this part
          const existing = line.find(s => s.pi === ev.pi);
          if (existing) {
            existing.text += ev.char;
          } else {
            line.push({ pi: ev.pi, text: ev.char, color: ev.color });
          }
          return next;
        });
        setCursorLine(ev.li);
        setCursorCol(c => c + 1);
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const edBg    = isDark ? '#0b0d1a' : '#f8f9ff';
  const chromeBg = isDark ? '#0f1221' : '#e0e4f0';
  const numColor = '#3a4460';

  return (
    <div style={{ borderRadius:16, overflow:'hidden', border:'1px solid var(--b0)', boxShadow: isDark ? '0 24px 80px rgba(0,0,0,0.6)' : '0 24px 80px rgba(0,0,0,0.14)' }}>
      {/* Chrome bar */}
      <div style={{ background:chromeBg, padding:'10px 16px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid var(--b0)' }}>
        <div style={{ width:12, height:12, borderRadius:'50%', background:'#ff5f57' }} />
        <div style={{ width:12, height:12, borderRadius:'50%', background:'#febc2e' }} />
        <div style={{ width:12, height:12, borderRadius:'50%', background:'#28c840' }} />
        <div style={{ flex:1 }} />
        <div style={{ fontSize:11, color:'var(--t3)', fontFamily:"'JetBrains Mono',monospace" }}>main.py — CollabCode</div>
        <div style={{ flex:1 }} />
        {['#38e2ff','#a259ff','#2cf59e'].map((c,i) => (
          <div key={i} style={{ width:22, height:22, borderRadius:'50%', background:c+'22', border:`2px solid ${c}`, fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', color:c, fontWeight:800 }}>
            {['A','B','C'][i]}
          </div>
        ))}
      </div>

      {/* Code area */}
      <div style={{ background:edBg, padding:'20px 24px', fontFamily:"'JetBrains Mono',monospace", fontSize:13, lineHeight:'22px', minHeight:260 }}>
        {CODE_LINES.map((line, li) => (
          <div key={li} style={{ display:'flex', minHeight:22 }}>
            <span style={{ width:30, color:numColor, userSelect:'none', flexShrink:0, textAlign:'right', marginRight:18, fontSize:11, opacity:0.6 }}>{li+1}</span>
            <span style={{ position:'relative' }}>
              {(visibleLines[li] || []).map((span, si) => (
                <span key={si} style={{ color:span.color }}>{span.text}</span>
              ))}
              {/* Blinking cursor on current line */}
              {!done && cursorLine === li && (
                <span style={{ display:'inline-block', width:2, height:15, background:'#38e2ff', marginLeft:1, verticalAlign:'text-bottom', animation:'blink 0.9s step-end infinite' }} />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, setTheme, themes } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg0)', color:'var(--t0)', fontFamily:"'Syne',system-ui,sans-serif", overflowY:'auto' }}>

      {/* Navbar */}
      <nav style={{ position:'sticky', top:0, zIndex:100, height:60, display:'flex', alignItems:'center', padding:'0 40px', gap:12, background: isDark ? 'rgba(13,15,26,0.88)' : 'rgba(240,242,248,0.92)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--b0)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#38e2ff,#a259ff)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, color:'#000', fontFamily:"'JetBrains Mono',monospace", boxShadow:'0 2px 12px rgba(56,226,255,0.3)' }}>CC</div>
          <span style={{ fontSize:18, fontWeight:800, color:'var(--t0)', letterSpacing:'-.3px' }}>CollabCode</span>
        </div>
        <div style={{ flex:1 }} />
        <button onClick={() => setTheme(t => t==='dark'?'light':t==='light'?'system':'dark')}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:20, border:'1px solid var(--b0)', background:'var(--bg2)', color:'var(--t1)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
          <span>{themes[theme] && themes[theme].icon}</span>
          <span>{themes[theme] && themes[theme].name}</span>
        </button>
        <button onClick={() => navigate('/login')} style={{ padding:'8px 20px', borderRadius:8, border:'1px solid var(--b0)', background:'transparent', color:'var(--t0)', fontSize:13, fontWeight:600, cursor:'pointer' }}>Sign In</button>
        <button onClick={() => navigate('/signup')} style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#38e2ff,#a259ff)', color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 12px rgba(56,226,255,0.3)' }}>Get Started Free</button>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth:860, margin:'0 auto', padding:'88px 32px 64px', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'5px 16px', borderRadius:20, marginBottom:28, background: isDark?'rgba(56,226,255,0.08)':'rgba(0,85,204,0.08)', border:'1px solid var(--cyan)', color:'var(--cyan)', fontSize:11, fontWeight:700, letterSpacing:'.8px' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--cyan)', display:'inline-block', animation:'pulse 2s infinite' }} />
          REAL-TIME COLLABORATIVE CODE EDITOR
        </div>
        <h1 style={{ fontSize:56, fontWeight:900, lineHeight:1.1, marginBottom:22, color:'var(--t0)', letterSpacing:'-1.5px' }}>
          Code Together,{' '}
          <span style={{ background:'linear-gradient(135deg,#38e2ff,#a259ff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Ship Faster</span>
        </h1>
        <p style={{ fontSize:19, color:'var(--t2)', maxWidth:540, margin:'0 auto 40px', lineHeight:1.7 }}>
          The collaborative code editor built for teams. Write, run, and review code together in real time — from any browser.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={() => navigate('/signup')}
            style={{ padding:'15px 36px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#38e2ff,#a259ff)', color:'#000', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 24px rgba(56,226,255,0.35)', transition:'transform .15s,box-shadow .15s' }}
            onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 8px 32px rgba(56,226,255,0.45)';}}
            onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='0 4px 24px rgba(56,226,255,0.35)';}}>
            Start Coding Free →
          </button>
          <button onClick={() => navigate('/login')}
            style={{ padding:'15px 36px', borderRadius:10, border:'1px solid var(--b1)', background:'var(--bg2)', color:'var(--t0)', fontSize:15, fontWeight:600, cursor:'pointer', transition:'border-color .15s' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor='var(--cyan)'}
            onMouseLeave={e=>e.currentTarget.style.borderColor='var(--b1)'}>
            Sign In
          </button>
        </div>
        {/* Stats */}
        <div style={{ display:'flex', gap:48, justifyContent:'center', marginTop:56, flexWrap:'wrap' }}>
          {[['15+','Languages'],['∞','Live cursors'],['1-click','Workspace sharing'],['Free','No credit card']].map(([val,label]) => (
            <div key={label} style={{ textAlign:'center' }}>
              <div style={{ fontSize:26, fontWeight:900, color:'var(--cyan)', letterSpacing:'-0.5px' }}>{val}</div>
              <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Animated Code Preview */}
      <section style={{ maxWidth:860, margin:'0 auto', padding:'0 32px 80px' }}>
        <TypedCodeEditor isDark={isDark} />
      </section>

      {/* Features */}
      <section style={{ maxWidth:1000, margin:'0 auto', padding:'0 32px 88px' }}>
        <div style={{ textAlign:'center', marginBottom:48 }}>
          <h2 style={{ fontSize:34, fontWeight:800, color:'var(--t0)', marginBottom:10, letterSpacing:'-.5px' }}>Everything your team needs</h2>
          <p style={{ fontSize:16, color:'var(--t2)' }}>One tool for writing, running, and reviewing code together.</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))', gap:16 }}>
          {features.map(f => (
            <div key={f.title}
              style={{ padding:'26px', borderRadius:14, background:'var(--bg1)', border:'1px solid var(--b0)', transition:'border-color .2s,transform .2s,box-shadow .2s', cursor:'default' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=f.color;e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow=`0 8px 28px ${f.color}18`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--b0)';e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='none';}}>
              <div style={{ width:44, height:44, borderRadius:12, background:f.color+'18', border:`1px solid ${f.color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, marginBottom:14 }}>{f.icon}</div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--t0)', marginBottom:7 }}>{f.title}</div>
              <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ background:'var(--bg1)', borderTop:'1px solid var(--b0)', borderBottom:'1px solid var(--b0)', padding:'72px 32px' }}>
        <div style={{ maxWidth:820, margin:'0 auto', textAlign:'center' }}>
          <h2 style={{ fontSize:32, fontWeight:800, color:'var(--t0)', marginBottom:10, letterSpacing:'-.4px' }}>Get started in minutes</h2>
          <p style={{ fontSize:15, color:'var(--t2)', marginBottom:52 }}>No downloads. No configuration. Just open your browser and start coding.</p>
          <div style={{ display:'flex', alignItems:'stretch', gap:0 }}>
            {steps.map((s, i) => (
              <div key={s.n} style={{ display:'flex', alignItems:'center', flex:1 }}>
                <div style={{ flex:1, padding:'28px 16px', borderRadius:14, background:'var(--bg2)', border:'1px solid var(--b0)', textAlign:'center', margin:'0 6px', height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
                  <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,#38e2ff,#a259ff)', color:'#000', fontSize:16, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{s.n}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--t0)' }}>{s.label}</div>
                  <div style={{ fontSize:11, color:'var(--t2)', lineHeight:1.5 }}>{s.sub}</div>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ fontSize:32, fontWeight:900, color:'#38e2ff', flexShrink:0, padding:'0 4px', lineHeight:1, textShadow:'0 0 12px rgba(56,226,255,0.5)' }}>›</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding:'88px 32px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background: isDark?'radial-gradient(ellipse 60% 50% at 50% 50%,rgba(56,226,255,0.06),transparent 70%)':'radial-gradient(ellipse 60% 50% at 50% 50%,rgba(0,85,204,0.06),transparent 70%)', pointerEvents:'none' }} />
        <h2 style={{ fontSize:36, fontWeight:800, color:'var(--t0)', marginBottom:12, letterSpacing:'-.5px', position:'relative' }}>Ready to collaborate?</h2>
        <p style={{ fontSize:16, color:'var(--t2)', marginBottom:32, position:'relative' }}>Create your free account in 30 seconds. No credit card required.</p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', position:'relative' }}>
          <button onClick={() => navigate('/signup')} style={{ padding:'15px 40px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#38e2ff,#a259ff)', color:'#000', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 24px rgba(56,226,255,0.35)' }}>
            Create Free Account →
          </button>
          <button onClick={() => navigate('/login')} style={{ padding:'15px 32px', borderRadius:10, border:'1px solid var(--b1)', background:'var(--bg2)', color:'var(--t1)', fontSize:15, fontWeight:600, cursor:'pointer' }}>
            Sign in instead
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop:'1px solid var(--b0)', padding:'24px 32px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:22, height:22, borderRadius:5, background:'linear-gradient(135deg,#38e2ff,#a259ff)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:900, color:'#000' }}>CC</div>
          <span style={{ fontSize:12, color:'var(--t3)' }}>CollabCode — Real-time collaborative code editor</span>
        </div>
        <div style={{ display:'flex', gap:20 }}>
          <span onClick={() => navigate('/login')} style={{ fontSize:12, color:'var(--t3)', cursor:'pointer' }}>Sign In</span>
          <span onClick={() => navigate('/signup')} style={{ fontSize:12, color:'var(--cyan)', cursor:'pointer', fontWeight:600 }}>Get Started</span>
        </div>
      </footer>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
