import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../utils/api';
import Tooltip from '../components/Tooltip';

const TIPS = [
  'Ctrl+S — save file',
  'Ctrl+Enter — run code',
  'Ctrl+/ — toggle comment',
  'Alt+↑↓ — move line',
  'Ctrl+Shift+K — delete line',
  'Ctrl+Shift+D — duplicate line',
];

export default function Dashboard() {
  const { user, logout }    = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const navigate            = useNavigate();
  const [workspaces, setWS] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel]   = useState(null);
  const [newName, setNewName] = useState('');
  const [joinToken, setJoin] = useState('');
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [uploadWs, setUploadWs] = useState('');
  const [showTheme, setShowTheme] = useState(false);
  const themeRef = useRef(null);
  const tip = TIPS[new Date().getMinutes() % TIPS.length];

  useEffect(() => {
    api.listWorkspaces().then(setWS).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  // Close theme picker on outside click
  useEffect(() => {
    const h = e => { if (themeRef.current && !themeRef.current.contains(e.target)) setShowTheme(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const doCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true); setError('');
    try { const ws = await api.createWorkspace(newName.trim()); navigate(`/workspace/${ws.id}`); }
    catch(e) { setError(e.message); setBusy(false); }
  };

  const doJoin = async () => {
    if (!joinToken.trim()) return;
    setBusy(true); setError('');
    try { const ws = await api.joinByToken(joinToken.trim()); navigate(`/workspace/${ws.id}`); }
    catch(e) { setError(e.message); setBusy(false); }
  };

  const openRecent = () => {
    setPanel('recent');
  };

  const [uploadProgress, setUploadProgress] = useState('');

  const doUpload = async (e) => {
    const allFiles = Array.from(e.target.files || []);
    if (!allFiles.length) return;

    // Skip only true binary formats — accept everything else
    const BINARY_EXTS = new Set([
      // Images
      'png','jpg','jpeg','gif','bmp','ico','webp','tiff','tif','psd','ai','eps','raw','heic','avif',
      // Video
      'mp4','avi','mov','mkv','wmv','flv','webm','m4v','3gp',
      // Audio
      'mp3','wav','ogg','aac','flac','m4a','wma',
      // Compiled/binary
      'exe','dll','so','dylib','bin','obj','o','a','lib','out',
      'class','jar','war','ear','pyc','pyd','pyo',
      // Archives
      'zip','tar','gz','bz2','xz','7z','rar','dmg','iso','pkg','deb','rpm',
      // Fonts
      'ttf','otf','woff','woff2','eot',
      // Documents (binary)
      'pdf','doc','docx','xls','xlsx','ppt','pptx',
      // Database
      'db','sqlite','sqlite3',
      // Lock files (large and not useful to edit)
      'lock',
    ]);

    // Also skip hidden system folders and build artifacts
    const SKIP_DIRS = new Set([
      'node_modules','.git','.svn','__pycache__','.venv','venv','env',
      'dist','build','.next','.nuxt','out','target','vendor','coverage',
      '.idea','.vscode','.DS_Store','Thumbs.db',
    ]);

    const files = allFiles.filter(f => {
      const rawPath = f.webkitRelativePath || f.name;
      const pathParts = rawPath.split('/');
      // Skip if any part of the path is a skipped directory
      if (pathParts.some(p => SKIP_DIRS.has(p))) return false;
      const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
      // Skip binary extensions
      if (BINARY_EXTS.has(ext)) return false;
      // Skip very large files (> 500KB — likely binary or generated)
      if (f.size > 512000) return false;
      return true;
    });

    if (!files.length) {
      setError('No code files found. Binary files, images, and node_modules are automatically skipped.');
      return;
    }

    const wsName = uploadWs.trim() || `Uploaded ${new Date().toLocaleDateString()}`;
    setBusy(true); setError(''); setUploadProgress('Creating workspace…');

    try {
      // skip_default=true so no auto main.py is created
      const ws = await api.createWorkspace(wsName, true);
      const { detectLanguage } = await import('../utils/syntax.js');
      let done = 0;

      for (const file of files) {
        const rawPath = file.webkitRelativePath || file.name;
        const parts = rawPath.split('/');
        // Strip top-level folder: "collabcode/src/App.jsx" → "src/App.jsx"
        // For single files (no folder): keep as-is
        const fileName = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
        // Skip empty, hidden files, or files that are just a dot
        if (!fileName || fileName === '.' || fileName.startsWith('./')) { done++; continue; }

        setUploadProgress(`Uploading ${done + 1} / ${files.length}: ${fileName}`);

        try {
          const text = await file.text();
          const lang = detectLanguage(fileName) || 'text';
          const newFile = await api.createFile(ws.id, fileName, lang);
          if (text.trim()) await api.updateFile(newFile.id, text);
          done++;
        } catch(fileErr) {
          // Skip files that fail individually — don't abort the whole upload
          done++;
        }
      }

      setUploadProgress('');
      navigate(`/workspace/${ws.id}`);
    } catch(err) {
      setUploadProgress('');
      setError(err.message || 'Upload failed. Please try again.');
      setBusy(false);
    }
    e.target.value = '';
  };

  const doDelete = async (wsId) => {
    await api.deleteWorkspace(wsId);
    setWS(prev => prev.filter(w => w.id !== wsId));
  };

  const ACTIONS = [
    { icon:'📄', label:'New Workspace',  sub:'Start a new coding project',   id:'create',   onClick:()=>{setPanel('create');} },
    { icon:'📂', label:'Open File/Folder',sub:'Upload files from your device',id:'upload',  onClick:()=>{setPanel('upload');} },
    { icon:'🔗', label:'Join Workspace', sub:'Paste an invite link',          id:'join',     onClick:()=>{setPanel('join');} },
    { icon:'🕒', label:'Open Recent',    sub:'Jump back to a workspace',      id:'recent',   onClick:openRecent },
  ];

  return (
    <div style={{minHeight:'100dvh',background:'var(--bg0)',display:'flex',flexDirection:'column',overflow:'auto',transition:'background .2s'}}>
      {/* Top bar */}
      <nav style={{height:48,background:'var(--bg1)',borderBottom:'1px solid var(--b0)',display:'flex',alignItems:'center',padding:'0 20px',gap:12,flexShrink:0}}>
        <div style={{width:30,height:30,borderRadius:8,background:'linear-gradient(135deg,#38e2ff,#a259ff)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,color:'#000',fontFamily:'var(--mono)'}}>CC</div>
        <span style={{fontWeight:800,fontSize:15,color:'var(--t0)'}}>CollabCode</span>
        <div style={{flex:1}}/>

        {/* ── Theme switcher ── */}
        <div ref={themeRef} style={{position:'relative'}}>
          <Tooltip label="Change theme">
            <button onClick={()=>setShowTheme(p=>!p)} style={{
              display:'flex',alignItems:'center',gap:7,padding:'5px 12px',
              borderRadius:20,border:`1px solid ${showTheme?'#38e2ff':'var(--b0)'}`,
              background:showTheme?'rgba(56,226,255,.08)':'var(--bg3)',
              color:'var(--t1)',fontSize:12,fontWeight:600,cursor:'pointer',
              transition:'all .15s',
            }}>
              <span style={{fontSize:15}}>{themes[theme]?.icon || '🎨'}</span>
              <span style={{color:'var(--t1)'}}>{themes[theme]?.name || 'Theme'}</span>
              <span style={{fontSize:9,color:'var(--t2)',transform:showTheme?'rotate(180deg)':'none',transition:'transform .2s'}}>▼</span>
            </button>
          </Tooltip>

          {showTheme && (
            <div style={{
              position:'absolute',top:'calc(100% + 8px)',right:0,
              background:'var(--bg2)',border:'1px solid var(--b1)',
              borderRadius:12,padding:8,minWidth:180,
              boxShadow:'0 16px 48px rgba(0,0,0,.5)',zIndex:1000,
              animation:'fadein .15s ease',
            }}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.7px',padding:'4px 10px 8px'}}>Appearance</div>
              {Object.entries(themes).map(([key, t]) => (
                <button key={key} onClick={()=>{ setTheme(key); setShowTheme(false); }}
                  style={{
                    width:'100%',display:'flex',alignItems:'center',gap:10,
                    padding:'9px 12px',borderRadius:8,border:'none',cursor:'pointer',
                    background:theme===key?'rgba(56,226,255,.1)':'transparent',
                    transition:'background .12s',textAlign:'left',
                  }}
                  onMouseEnter={e=>{ if(theme!==key) e.currentTarget.style.background='rgba(255,255,255,.05)'; }}
                  onMouseLeave={e=>{ if(theme!==key) e.currentTarget.style.background='transparent'; }}>
                  {/* Theme preview swatch */}
                  <div style={{position:'relative',width:32,height:22,borderRadius:5,overflow:'hidden',border:`1px solid ${theme===key?'#38e2ff':'var(--b1)'}`,flexShrink:0}}>
                    <div style={{position:'absolute',inset:0,background:key==='light'?'#f5f6fa':key==='dark'?'#0a0b0f':'linear-gradient(135deg,#0a0b0f 50%,#f5f6fa 50%)'}}/>
                    <div style={{position:'absolute',bottom:2,right:2,width:8,height:8,borderRadius:'50%',background:key==='light'?'#7c3aed':'#38e2ff'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:theme===key?'#38e2ff':'var(--t0)'}}>{t.name}</div>
                    <div style={{fontSize:10,color:'var(--t2)'}}>{key==='dark'?'Easy on the eyes':key==='light'?'Classic bright view':'Follows your OS'}</div>
                  </div>
                  {theme===key && <div style={{marginLeft:'auto',width:6,height:6,borderRadius:'50%',background:'#38e2ff',flexShrink:0}}/>}
                </button>
              ))}
            </div>
          )}
        </div>

        <span style={{fontSize:12,color:'var(--t2)'}}>{user?.name || user?.email}</span>
        <Tooltip label="Sign out">
          <button onClick={logout} style={{padding:'4px 12px',borderRadius:6,background:'transparent',border:'1px solid var(--b0)',color:'var(--t2)',fontSize:11,fontWeight:600,cursor:'pointer',transition:'border-color .15s'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor='#ff4d6d'}
            onMouseLeave={e=>e.currentTarget.style.borderColor='var(--b0)'}>Sign out</button>
        </Tooltip>
      </nav>

      <div style={{flex:1,display:'flex',minHeight:0}}>
        {/* Left sidebar */}
        <div style={{width:280,background:'var(--bg0)',borderRight:'1px solid var(--b0)',padding:'28px 20px',flexShrink:0,display:'flex',flexDirection:'column',gap:0}}>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',letterSpacing:'1px',textTransform:'uppercase',marginBottom:6}}>Welcome</div>
            <div style={{fontSize:20,fontWeight:800,lineHeight:1.2,marginBottom:3,color:'var(--t0)'}}>CollabCode</div>
            <div style={{fontSize:12,color:'var(--t2)',lineHeight:1.5}}>Real-time collaborative code editor</div>
          </div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',letterSpacing:'.8px',textTransform:'uppercase',marginBottom:8}}>Start</div>
            {ACTIONS.map(a=>(
              <SidebarRow key={a.id} icon={a.icon} label={a.label} sub={a.sub}
                active={panel===a.id} onClick={()=>{ setError(''); setNewName(''); setJoin(''); a.onClick(); }} />
            ))}
          </div>

          <div style={{flex:1}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',letterSpacing:'.8px',textTransform:'uppercase',marginBottom:8}}>Recent</div>
            {loading ? (
              <div style={{fontSize:12,color:'var(--t3)',padding:'6px 0'}}>Loading…</div>
            ) : workspaces.length === 0 ? (
              <div style={{fontSize:12,color:'var(--t3)',lineHeight:1.6}}>No workspaces yet.</div>
            ) : (
              workspaces.slice(0,6).map(ws=>(
                <div key={ws.id}
                  style={{width:'100%',display:'flex',alignItems:'center',gap:4,marginBottom:1,borderRadius:6,background:'transparent'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg2)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <button onClick={()=>navigate(`/workspace/${ws.id}`)}
                    style={{flex:1,textAlign:'left',padding:'6px 8px',borderRadius:6,background:'transparent',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:13}}>📁</span>
                    <div style={{overflow:'hidden'}}>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--t1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ws.name}</div>
                      <div style={{fontSize:10,color:'var(--t3)'}}>{ws.file_count} file{ws.file_count!==1?'s':''}</div>
                    </div>
                  </button>
                  <button onClick={()=>{ if(window.confirm(`Delete "${ws.name}"?`)) doDelete(ws.id); }}
                    title="Delete workspace"
                    style={{flexShrink:0,padding:'3px 5px',background:'none',border:'none',color:'var(--t3)',cursor:'pointer',fontSize:11,borderRadius:4,opacity:0.6}}
                    onMouseEnter={e=>{e.currentTarget.style.color='#ff4d6d';e.currentTarget.style.opacity='1';}}
                    onMouseLeave={e=>{e.currentTarget.style.color='var(--t3)';e.currentTarget.style.opacity='0.6';}}>🗑</button>
                </div>
              ))
            )}
          </div>

          <div style={{marginTop:16,paddingTop:16,fontSize:11,color:'var(--t3)',lineHeight:1.5,borderTop:'1px solid var(--bg2)'}}>
            <span style={{color:'#38e2ff',fontWeight:700}}>Tip: </span>{tip}
          </div>
        </div>

        {/* Main content */}
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',padding:'40px 28px',overflow:'auto'}}>

          {/* Action cards — default view */}
          {!panel && (
            <div style={{width:'100%',maxWidth:660}}>
              <p style={{fontSize:13,color:'var(--t2)',marginBottom:18}}>What would you like to do?</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:36}}>
                {ACTIONS.map(a=>(
                  <ActionCard key={a.id} icon={a.icon} label={a.label} sub={a.sub}
                    onClick={()=>{ setError(''); setNewName(''); setJoin(''); a.onClick(); }} />
                ))}
              </div>
              {!loading && workspaces.length > 0 && (
                <>
                  <p style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:12}}>Your Workspaces</p>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:10}}>
                    {workspaces.map(ws=>(
                      <WSCard key={ws.id} ws={ws} onClick={()=>navigate(`/workspace/${ws.id}`)} onDelete={doDelete} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Create panel */}
          {panel === 'create' && (
            <div style={{width:'100%',maxWidth:420,animation:'fadein .18s ease'}}>
              <BackBtn onClick={()=>setPanel(null)} />
              <h2 style={{fontSize:18,fontWeight:700,marginBottom:4,color:'var(--t0)'}}>New Workspace</h2>
              <p style={{fontSize:12,color:'var(--t2)',marginBottom:22}}>Give your workspace a name to get started.</p>
              <label style={LS}>Workspace name</label>
              <input value={newName} onChange={e=>setNewName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&doCreate()}
                placeholder="e.g. My Python Project" autoFocus
                style={inputS()}
                onFocus={e=>e.target.style.borderColor='#38e2ff'}
                onBlur={e=>e.target.style.borderColor='var(--b0)'}/>
              {error&&<p style={{fontSize:12,color:'#ff4d6d',margin:'0 0 10px'}}>{error}</p>}
              <button onClick={doCreate} disabled={busy||!newName.trim()} style={primaryBtn(busy||!newName.trim())}>
                {busy?'Creating…':'Create Workspace →'}
              </button>
            </div>
          )}

          {/* Upload panel */}
          {panel === 'upload' && (
            <div style={{width:'100%',maxWidth:440,animation:'fadein .18s ease'}}>
              <BackBtn onClick={()=>setPanel(null)} />
              <h2 style={{fontSize:18,fontWeight:700,marginBottom:4,color:'var(--t0)'}}>Open File or Folder</h2>
              <p style={{fontSize:13,color:'var(--t2)',marginBottom:20,lineHeight:1.6}}>
                Upload files or an entire folder from your computer. They'll be imported into a new workspace.
              </p>
              <label style={LS}>Workspace name (optional)</label>
              <input value={uploadWs} onChange={e=>setUploadWs(e.target.value)}
                placeholder="My Project"
                style={inputS()}
                onFocus={e=>e.target.style.borderColor='var(--cyan)'}
                onBlur={e=>e.target.style.borderColor='var(--b0)'}/>
              {error&&<div style={{padding:'8px 12px',background:'rgba(255,77,109,.08)',border:'1px solid rgba(255,77,109,.25)',borderRadius:7,marginBottom:12,fontSize:12,color:'var(--red)'}}>{error}</div>}
              <div style={{display:'flex',gap:10}}>
                <label style={{flex:1,padding:'12px',borderRadius:8,border:'2px dashed var(--b1)',background:'var(--bg2)',cursor:'pointer',textAlign:'center',transition:'border-color .15s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--cyan)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--b1)'}>
                  <input type="file" multiple onChange={doUpload} disabled={busy} style={{display:'none'}} />
                  <div style={{fontSize:24,marginBottom:6}}>📄</div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--t0)',marginBottom:2}}>Upload Files</div>
                  <div style={{fontSize:11,color:'var(--t2)'}}>Select one or more files</div>
                </label>
                <label style={{flex:1,padding:'12px',borderRadius:8,border:'2px dashed var(--b1)',background:'var(--bg2)',cursor:'pointer',textAlign:'center',transition:'border-color .15s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--cyan)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--b1)'}>
                  <input type="file" multiple webkitdirectory="" onChange={doUpload} disabled={busy} style={{display:'none'}} />
                  <div style={{fontSize:24,marginBottom:6}}>📁</div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--t0)',marginBottom:2}}>Upload Folder</div>
                  <div style={{fontSize:11,color:'var(--t2)'}}>Select an entire folder</div>
                </label>
              </div>
              {busy && (
                <div style={{marginTop:14,padding:'10px 14px',background:'rgba(56,226,255,.06)',border:'1px solid rgba(56,226,255,.2)',borderRadius:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <div style={{width:14,height:14,borderRadius:'50%',border:'2px solid var(--cyan)',borderTopColor:'transparent',animation:'spin 1s linear infinite',flexShrink:0}}/>
                    <span style={{fontSize:12,color:'var(--cyan)',fontWeight:600}}>Uploading…</span>
                  </div>
                  {uploadProgress && <div style={{fontSize:11,color:'var(--t2)',fontFamily:'var(--mono)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{uploadProgress}</div>}
                </div>
              )}
              <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
            </div>
          )}

          {/* Join panel */}
          {panel === 'join' && (
            <div style={{width:'100%',maxWidth:460,animation:'fadein .18s ease'}}>
              <BackBtn onClick={()=>setPanel(null)} />
              <h2 style={{fontSize:18,fontWeight:700,marginBottom:4,color:'var(--t0)'}}>Join a Workspace</h2>
              <p style={{fontSize:13,color:'var(--t2)',marginBottom:20,lineHeight:1.6}}>
                Paste an invite link <strong style={{color:'var(--t1)'}}>or</strong> an invite token — both work.
              </p>

              {/* Option A — Invite Link */}
              <div style={{padding:'14px 16px',background:'rgba(56,226,255,.05)',border:'1px solid rgba(56,226,255,.2)',borderRadius:10,marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <div style={{width:22,height:22,borderRadius:'50%',background:'rgba(56,226,255,.15)',border:'1px solid rgba(56,226,255,.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#38e2ff',flexShrink:0}}>A</div>
                  <span style={{fontSize:12,fontWeight:700,color:'#38e2ff'}}>Paste an Invite Link</span>
                </div>
                <p style={{fontSize:11,color:'var(--t2)',marginBottom:8,lineHeight:1.5}}>The workspace owner clicks <strong style={{color:'var(--t1)'}}>Share → Copy Invite Link</strong> and sends you the full URL.</p>
                <input
                  placeholder="http://localhost:5173/join/abc123..."
                  value={joinToken} onChange={e=>setJoin(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){const r=joinToken.trim();if(!r)return;let t=r;try{const u=new URL(r);const p=u.pathname.split('/').filter(Boolean);const i=p.indexOf('join');if(i>=0&&p[i+1])t=p[i+1];}catch(_){}setBusy(true);setError('');api.joinByToken(t).then(ws=>navigate('/workspace/'+ws.id)).catch(e=>{setError(e.message);setBusy(false);}); }}}
                  style={{width:'100%',padding:'9px 11px',background:'var(--bg2)',border:'1px solid var(--b0)',borderRadius:7,color:'var(--t0)',fontSize:12,outline:'none',boxSizing:'border-box',fontFamily:'var(--mono)'}}
                  onFocus={e=>e.target.style.borderColor='#38e2ff'}
                  onBlur={e=>e.target.style.borderColor='var(--b0)'}/>
              </div>

              {/* OR divider */}
              <div style={{display:'flex',alignItems:'center',gap:10,margin:'4px 0 12px'}}>
                <div style={{flex:1,height:1,background:'var(--b0)'}}/><span style={{fontSize:11,fontWeight:700,color:'var(--t3)',letterSpacing:'.5px'}}>OR</span><div style={{flex:1,height:1,background:'var(--b0)'}}/>
              </div>

              {/* Option B — Token */}
              <div style={{padding:'14px 16px',background:'rgba(162,89,255,.05)',border:'1px solid rgba(162,89,255,.2)',borderRadius:10,marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <div style={{width:22,height:22,borderRadius:'50%',background:'rgba(162,89,255,.15)',border:'1px solid rgba(162,89,255,.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#a259ff',flexShrink:0}}>B</div>
                  <span style={{fontSize:12,fontWeight:700,color:'#a259ff'}}>Paste an Invite Token</span>
                </div>
                <p style={{fontSize:11,color:'var(--t2)',marginBottom:8,lineHeight:1.5}}>The owner clicks <strong style={{color:'var(--t1)'}}>Share → Copy Token</strong> and sends you the short token string.</p>
                <input
                  placeholder="e.g. aB3xK9mNpQrTzW..."
                  value={joinToken} onChange={e=>setJoin(e.target.value)}
                  style={{width:'100%',padding:'9px 11px',background:'var(--bg2)',border:'1px solid var(--b0)',borderRadius:7,color:'var(--t0)',fontSize:12,outline:'none',boxSizing:'border-box',fontFamily:'var(--mono)'}}
                  onFocus={e=>e.target.style.borderColor='#a259ff'}
                  onBlur={e=>e.target.style.borderColor='var(--b0)'}/>
              </div>

              {error && (
                <div style={{padding:'8px 12px',background:'rgba(255,77,109,.08)',border:'1px solid rgba(255,77,109,.25)',borderRadius:7,marginBottom:12,fontSize:12,color:'var(--red)'}}>{error}</div>
              )}
              <button onClick={()=>{
                const raw = joinToken.trim();
                if (!raw) return;
                let token = raw;
                try { const u = new URL(raw); const p = u.pathname.split('/').filter(Boolean); const i = p.indexOf('join'); if(i>=0&&p[i+1]) token=p[i+1]; } catch(_) {}
                setBusy(true); setError('');
                api.joinByToken(token).then(ws=>navigate('/workspace/'+ws.id)).catch(e=>{setError(e.message);setBusy(false);});
              }} disabled={busy||!joinToken.trim()} style={primaryBtn(busy||!joinToken.trim())}>
                {busy?'Joining…':'Join Workspace →'}
              </button>
            </div>
          )}

                    {/* Open Recent panel — FULLY WORKING */}
          {panel === 'recent' && (
            <div style={{width:'100%',maxWidth:560,animation:'fadein .18s ease'}}>
              <BackBtn onClick={()=>setPanel(null)} />
              <h2 style={{fontSize:18,fontWeight:700,marginBottom:4,color:'var(--t0)'}}>Recent Workspaces</h2>
              <p style={{fontSize:12,color:'var(--t2)',marginBottom:22}}>Click any workspace to open it.</p>
              {loading ? (
                <div style={{color:'var(--t2)',fontSize:13}}>Loading…</div>
              ) : workspaces.length === 0 ? (
                <div style={{textAlign:'center',padding:'40px 20px',border:'1px dashed var(--b0)',borderRadius:12,color:'var(--t2)'}}>
                  <div style={{fontSize:28,marginBottom:10}}>📂</div>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:6,color:'var(--t1)'}}>No recent workspaces</div>
                  <div style={{fontSize:12}}>Create one to get started.</div>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {workspaces.map((ws,i) => (
                    <button key={ws.id} onClick={()=>navigate(`/workspace/${ws.id}`)}
                      style={{
                        display:'flex',alignItems:'center',gap:14,
                        padding:'14px 18px',borderRadius:10,
                        background:'var(--bg1)',border:'1px solid var(--b0)',
                        cursor:'pointer',textAlign:'left',
                        transition:'all .15s',
                        animation:`fadein .2s ease ${i*0.04}s both`,
                      }}
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor='#38e2ff'; e.currentTarget.style.background='var(--bg2)'; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--b0)'; e.currentTarget.style.background='var(--bg1)'; }}>
                      <div style={{width:40,height:40,borderRadius:10,background:'linear-gradient(135deg,rgba(56,226,255,.15),rgba(162,89,255,.15))',border:'1px solid var(--b0)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>📁</div>
                      <div style={{flex:1,overflow:'hidden'}}>
                        <div style={{fontSize:13,fontWeight:700,color:'var(--t0)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ws.name}</div>
                        <div style={{fontSize:11,color:'var(--t2)',marginTop:2}}>{ws.file_count} file{ws.file_count!==1?'s':''} · {ws.members?.length||0} member{ws.members?.length!==1?'s':''}</div>
                      </div>
                      <div style={{fontSize:11,color:'#38e2ff',fontWeight:600,flexShrink:0}}>Open →</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',color:'var(--t2)',cursor:'pointer',fontSize:12,fontWeight:600,marginBottom:20,padding:0}}
      onMouseEnter={e=>e.currentTarget.style.color='var(--t0)'}
      onMouseLeave={e=>e.currentTarget.style.color='var(--t2)'}>
      ← Back
    </button>
  );
}

function SidebarRow({ icon, label, sub, active, onClick }) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{width:'100%',textAlign:'left',padding:'7px 8px',borderRadius:7,background:active?'rgba(56,226,255,.07)':h?'var(--bg2)':'transparent',border:`1px solid ${active?'rgba(56,226,255,.2)':'transparent'}`,cursor:'pointer',display:'flex',alignItems:'center',gap:10,marginBottom:2,transition:'all .12s'}}>
      <span style={{fontSize:15,flexShrink:0}}>{icon}</span>
      <div>
        <div style={{fontSize:12,fontWeight:600,color:active?'#38e2ff':'var(--t1)'}}>{label}</div>
        <div style={{fontSize:10,color:'var(--t3)'}}>{sub}</div>
      </div>
    </button>
  );
}

function ActionCard({ icon, label, sub, onClick }) {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{padding:'18px 20px',borderRadius:12,background:h?'var(--bg2)':'var(--bg1)',border:`1px solid ${h?'var(--b1)':'var(--b0)'}`,cursor:'pointer',textAlign:'left',transition:'all .15s',boxShadow:h?'0 4px 20px rgba(0,0,0,.2)':'none'}}>
      <div style={{fontSize:26,marginBottom:10}}>{icon}</div>
      <div style={{fontSize:13,fontWeight:700,color:'var(--t0)',marginBottom:3}}>{label}</div>
      <div style={{fontSize:11,color:'var(--t2)',lineHeight:1.4}}>{sub}</div>
    </button>
  );
}

function WSCard({ ws, onClick, onDelete }) {
  const [h, setH] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    setDeleting(true);
    try { await onDelete(ws.id); }
    catch(err) { alert(err.message); setDeleting(false); setConfirming(false); }
  };

  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => { setH(false); setConfirming(false); }}
      style={{ position:'relative', padding:'14px 16px', borderRadius:10, background:h?'var(--bg2)':'var(--bg1)', border:`1px solid ${h?'rgba(56,226,255,.3)':'var(--b0)'}`, transition:'all .15s', cursor:'pointer' }}
      onClick={onClick}>
      {/* Delete button — top right */}
      <button
        onClick={handleDelete}
        title={confirming ? 'Click again to confirm delete' : 'Delete workspace'}
        style={{
          position:'absolute', top:8, right:8,
          width:24, height:24, borderRadius:6,
          border:`1px solid ${confirming ? 'rgba(255,77,109,.6)' : 'transparent'}`,
          background: confirming ? 'rgba(255,77,109,.12)' : 'transparent',
          color: confirming ? '#ff4d6d' : 'var(--t3)',
          fontSize:13, cursor:'pointer', display:'flex', alignItems:'center',
          justifyContent:'center', lineHeight:1, transition:'all .15s',
          opacity: h ? 1 : 0,
        }}
        onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.background='rgba(255,77,109,.15)'; e.currentTarget.style.color='#ff4d6d'; e.currentTarget.style.borderColor='rgba(255,77,109,.5)'; }}
        onMouseLeave={e => { e.stopPropagation(); if(!confirming){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--t3)';e.currentTarget.style.borderColor='transparent';} }}>
        {deleting ? '…' : confirming ? '✓' : '🗑'}
      </button>
      {confirming && (
        <div style={{ position:'absolute', top:36, right:8, background:'var(--bg3)', border:'1px solid rgba(255,77,109,.4)', borderRadius:6, padding:'4px 8px', fontSize:10, color:'#ff4d6d', whiteSpace:'nowrap', zIndex:10, pointerEvents:'none' }}>
          Click 🗑 again to confirm
        </div>
      )}
      <div style={{ fontSize:20, marginBottom:6 }}>📁</div>
      <div style={{ fontSize:12, fontWeight:700, color:'var(--t0)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:20 }}>{ws.name}</div>
      <div style={{ fontSize:10, color:'var(--t2)' }}>{ws.file_count} file{ws.file_count!==1?'s':''}</div>
    </div>
  );
}

const LS={display:'block',fontSize:10,fontWeight:700,color:'var(--t2)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6};
const inputS=()=>({width:'100%',padding:'10px 12px',background:'var(--bg1)',border:'1px solid var(--b0)',borderRadius:7,color:'var(--t0)',fontSize:13,outline:'none',boxSizing:'border-box',marginBottom:14,transition:'border-color .15s'});
const primaryBtn=dis=>({width:'100%',padding:'11px',borderRadius:8,border:'none',color:dis?'var(--t2)':'#000',fontSize:13,fontWeight:700,cursor:dis?'not-allowed':'pointer',background:dis?'var(--bg3)':'linear-gradient(135deg,#38e2ff,#a259ff)',transition:'opacity .15s'});
