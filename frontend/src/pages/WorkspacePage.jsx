import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api, createTerminalWS } from '../utils/api';
import { useCollaboration } from '../hooks/useCollaboration';
import { useNotifications } from '../hooks/useNotifications';
import Notification from '../components/Notification';
import CodeEditor from '../components/CodeEditor';
import Tooltip from '../components/Tooltip';
import { LANG_META, detectLanguage } from '../utils/syntax';

const UCOLORS = ['#38e2ff','#a259ff','#2cf59e','#ff8c42','#ffd166','#ff4d6d'];
const uColor  = id => UCOLORS[(id || 0) % UCOLORS.length];

/* Error parser */
function parseErrors(out) {
  if (!out) return {};
  const map = {};
  const rules = [
    { rx: /File ".+?",\s*line (\d+)/g, t:'error' },
    { rx: /(?:error|Error).*?:(\d+)/g,  t:'error' },
    { rx: /line (\d+)/gi,               t:'error' },
    { rx: /\.py:(\d+)/g,                t:'error' },
    { rx: /\.js:(\d+)/g,                t:'error' },
    { rx: /warning.*line (\d+)/gi,      t:'warning' },
  ];
  for (const raw of out.split('\n')) {
    const clean = raw.replace(/\x1b\[[0-9;]*m/g,'').trim();
    if (!clean) continue;
    for (const { rx, t } of rules) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(clean)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n < 10000 && !map[n]) map[n] = { type:t, messages:[clean] };
      }
    }
  }
  return map;
}

export default function WorkspacePage() {
  const { workspaceId }  = useParams();
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const { notifications, push, dismiss } = useNotifications();
  const token = localStorage.getItem('cc_token');

  const [workspace,   setWorkspace]  = useState(null);
  const [files,       setFiles]      = useState([]);
  const [activeFile,  setActiveFile] = useState(null);
  const [versions,    setVersions]   = useState([]);
  const [rightTab,    setRightTab]   = useState('chat');
  const [showTerm,    setShowTerm]   = useState(false);
  const [termHeight,  setTermHeight] = useState(220);
  const [termOutput,  setTermOutput] = useState('');
  const [termRunning, setTermRunning]= useState(false);
  const [stdinVal,    setStdinVal]   = useState('');
  const [showPreview, setShowPreview]= useState(false);
  const [pageLoading, setPageLoading]= useState(true);
  const [mobileTab,   setMobileTab]  = useState('editor');

  const termWsRef = useRef(null);
  const termReady = useRef(false);
  const termEndRef= useRef(null);

  const collab    = useCollaboration(activeFile?.id, token);
  const errorMap  = useMemo(() => parseErrors(termOutput), [termOutput]);
  const errCount  = useMemo(() => Object.values(errorMap).filter(v=>v.type==='error').length, [errorMap]);
  const warnCount = useMemo(() => Object.values(errorMap).filter(v=>v.type==='warning').length, [errorMap]);
  const content   = collab.initialized ? collab.content : (activeFile?.content || '');

  const isPreviewable = useMemo(() => {
    const l = (activeFile?.language||'').toLowerCase();
    return ['html','javascript','jsx','css'].includes(l);
  }, [activeFile?.language]);

  /* Load */
  useEffect(() => {
    (async () => {
      try {
        const ws = await api.getWorkspace(workspaceId);
        setWorkspace(ws);
        const fs = await api.listFiles(workspaceId);
        setFiles(fs);
        if (fs.length > 0) setActiveFile(fs[0]);
      } catch(e) { push(e.message,'error'); navigate(-1); }
      finally { setPageLoading(false); }
    })();
  }, [workspaceId]);

  useEffect(() => {
    if (!activeFile) return;
    api.getVersions(activeFile.id).then(setVersions).catch(()=>{});
  }, [activeFile?.id]);

  useEffect(() => {
    if (rightTab !== 'chat' || !workspace) return;
    api.getHistory(workspace.id).then(msgs =>
      collab.setChatMessages(msgs.map(m=>({...m, is_me:m.user_id===user?.id})))
    ).catch(()=>{});
  }, [rightTab, workspace?.id]);

  /* Terminal */
  useEffect(() => {
    if (!showTerm || !activeFile?.id || !token) return;
    termReady.current = false;
    const ws = createTerminalWS(activeFile.id, token, {
      onMessage: d => {
        if (d.type==='ready')  { termReady.current=true; setTermOutput(p=>p+(d.msg||'')); }
        if (d.type==='output') setTermOutput(p=>p+(d.data||''));
        if (d.type==='done')   { setTermOutput(p=>p+(d.data||'')); setTermRunning(false); }
      },
      onDisconnect: ()=>{ setTermRunning(false); termReady.current=false; },
      onError:      ()=>{ setTermRunning(false); termReady.current=false; },
    });
    termWsRef.current = ws;
    return () => { ws.close(); termWsRef.current=null; termReady.current=false; };
  }, [showTerm, activeFile?.id, token]);

  useEffect(()=>{ termEndRef.current?.scrollIntoView({behavior:'smooth'}); },[termOutput]);

  const startDrag = useCallback(e => {
    e.preventDefault();
    const y0=e.clientY, h0=termHeight;
    const move=ev=>setTermHeight(Math.max(80,Math.min(500,h0+y0-ev.clientY)));
    const up=()=>{ removeEventListener('mousemove',move); removeEventListener('mouseup',up); };
    addEventListener('mousemove',move); addEventListener('mouseup',up);
  }, [termHeight]);

  /* Actions */
  const handleSave = useCallback(async () => {
    if (!activeFile) return;
    try { await api.updateFile(activeFile.id, collab.content); push('Saved ✓','success'); }
    catch(e) { push(e.message,'error'); }
  }, [activeFile, collab.content]);

  /* Download current file to device */
  const handleDownloadFile = useCallback(() => {
    if (!activeFile) return;
    const blob = new Blob([collab.content || ''], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
    push(`Downloaded ${activeFile.name}`, 'success');
  }, [activeFile, collab.content]);

  /* Download ALL files in workspace as a .zip */
  const handleDownloadAll = useCallback(async () => {
    if (!files.length) { push('No files to download','warning'); return; }
    try {
      // Build a simple multi-file text bundle since we have no zip lib
      // Each file separated by a clear header
      let bundle = `# CollabCode Workspace: ${workspace?.name}\n# Downloaded: ${new Date().toISOString()}\n\n`;
      for (const f of files) {
        let fileContent = f.content || '';
        if (f.id === activeFile?.id) fileContent = collab.content || fileContent;
        bundle += `${'='.repeat(60)}\n# FILE: ${f.name}\n${'='.repeat(60)}\n${fileContent}\n\n`;
      }
      const blob = new Blob([bundle], { type: 'text/plain;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${workspace?.name || 'workspace'}-files.txt`;
      a.click();
      URL.revokeObjectURL(url);
      push(`Downloaded ${files.length} files`, 'success');
    } catch(e) { push(e.message, 'error'); }
  }, [files, activeFile, collab.content, workspace]);

  const selectFile = useCallback(f => {
    setActiveFile(f); setTermOutput(''); setMobileTab('editor');
    api.getVersions(f.id).then(setVersions).catch(()=>{});
  }, []);

  /* Upload files or folders from device */
  const handleUpload = useCallback(async (e) => {
    const allFiles = Array.from(e.target.files || []);
    if (!allFiles.length) return;

    const BINARY_EXTS = new Set([
      'png','jpg','jpeg','gif','bmp','ico','webp','tiff','psd','ai','eps','raw','heic','avif',
      'mp4','avi','mov','mkv','wmv','flv','webm','m4v','mp3','wav','ogg','aac','flac','m4a',
      'exe','dll','so','dylib','bin','obj','o','a','class','jar','pyc','pyd',
      'zip','tar','gz','bz2','xz','7z','rar','dmg','iso','pkg','deb',
      'ttf','otf','woff','woff2','eot','pdf','doc','docx','xls','xlsx','ppt','pptx',
      'db','sqlite','sqlite3','lock',
    ]);
    const SKIP_DIRS = new Set([
      'node_modules','.git','__pycache__','.venv','venv','dist','build',
      '.next','.nuxt','out','target','vendor','coverage','.idea','.vscode',
    ]);

    const uploadedFiles = allFiles.filter(f => {
      const rawPath = f.webkitRelativePath || f.name;
      if (rawPath.split('/').some(p => SKIP_DIRS.has(p))) return false;
      const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
      if (BINARY_EXTS.has(ext)) return false;
      if (f.size > 512000) return false;
      return true;
    });

    if (!uploadedFiles.length) {
      push('No code files found. Binaries, images and node_modules are skipped.', 'warning');
      e.target.value = '';
      return;
    }

    let completed = 0;
    let lastFile = null;

    for (const file of uploadedFiles) {
      try {
        const rawPath = file.webkitRelativePath || file.name;
        const parts = rawPath.split('/');
        // Strip top-level folder name, keep subfolder structure
        const fileName = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
        if (!fileName || fileName === '.' || fileName.startsWith('./')) continue;

        const text = await file.text();
        const lang = detectLanguage(fileName) || 'text';
        const newFile = await api.createFile(parseInt(workspaceId), fileName, lang);
        if (text.trim()) await api.updateFile(newFile.id, text);
        newFile.content = text;
        setFiles(p => [...p, newFile]);
        completed++;
        lastFile = { ...newFile, content: text };
      } catch(err) {
        push(`Skipped ${file.name}: ${err.message}`, 'warning');
      }
    }

    if (completed > 0) {
      push(`Uploaded ${completed} file${completed > 1 ? 's' : ''} ✓`, 'success');
      if (completed === 1 && lastFile) selectFile(lastFile);
    }
    e.target.value = '';
  }, [workspaceId, selectFile]);

  const uploadRef = useRef(null);
  const uploadFolderRef = useRef(null);

  const handleFormat = useCallback(() => {
    const fmt = (collab.content||'').split('\n').map(l=>l.trimEnd()).join('\n')
      .replace(/\n{3,}/g,'\n\n').trimEnd()+'\n';
    collab.setContent(fmt); collab.sendEdit(fmt);
    push('Formatted ✓','info');
  }, [collab]);

  const handleRun = useCallback(() => {
    if (!activeFile) { push('No file selected','warning'); return; }
    const doRun = () => {
      if (!termWsRef.current || !termReady.current) { setTimeout(doRun, 200); return; }
      setTermOutput(''); setTermRunning(true);
      termWsRef.current.run(collab.content||activeFile.content||'', activeFile.language||'python');
    };
    if (!showTerm) { setShowTerm(true); setTimeout(doRun, 600); }
    else doRun();
  }, [activeFile, showTerm, collab.content]);

  const handleSnapshot = useCallback(async () => {
    if (!activeFile) return;
    const label = prompt('Snapshot label:', `v — ${user?.name}`);
    if (!label) return;
    try {
      await api.saveVersion(activeFile.id, label);
      setVersions(await api.getVersions(activeFile.id));
      push('Snapshot saved','success');
    } catch(e) { push(e.message,'error'); }
  }, [activeFile, user]);

  if (pageLoading) return <Screen text="Loading…" />;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', overflow:'hidden', background:'#0d0f1a' }}>
      <Notification notifications={notifications} onDismiss={dismiss} />

      <TopBar
        workspace={workspace} activeFile={activeFile} collab={collab}
        errCount={errCount} warnCount={warnCount}
        showTerm={showTerm} onToggleTerm={()=>setShowTerm(p=>!p)}
        showPreview={showPreview} isPreviewable={isPreviewable}
        onTogglePreview={()=>setShowPreview(p=>!p)}
        onRun={handleRun} onSave={handleSave} onFormat={handleFormat} onSnapshot={handleSnapshot}
        onDownloadFile={handleDownloadFile} onDownloadAll={handleDownloadAll}
        onLogout={()=>{ logout(); navigate('/login'); }}
        onBack={()=>{ if (window.history.length > 1) navigate(-1); else navigate('/dashboard'); }}
        onCopyLink={()=>{
          navigator.clipboard.writeText(`${location.origin}/join/${workspace?.invite_token}`)
            .then(()=>push('Link copied!','success'))
            .catch(()=>push(`/join/${workspace?.invite_token}`,'info'));
        }}
        onInvite={async (email,role)=>{
          try {
            await api.inviteToWorkspace(workspace.id,email,role);
            setWorkspace(await api.getWorkspace(workspace.id));
            push(`Invited ${email}`,'success');
          } catch(e){ push(e.message,'error'); }
        }}
      />

      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>
        <FileSidebar
          files={files} activeFile={activeFile}
          onSelect={selectFile}
          onUpload={handleUpload}
          uploadRef={uploadRef}
          uploadFolderRef={uploadFolderRef}
          onNew={async (name,lang)=>{
            try {
              const l = detectLanguage(name)!=='text' ? detectLanguage(name) : lang;
              const f = await api.createFile(parseInt(workspaceId),name,l);
              setFiles(p=>[...p,f]); selectFile(f); push(`Created ${name}`,'success');
            } catch(e){ push(e.message,'error'); }
          }}
          onDelete={async f=>{
            if (!confirm(`Delete "${f.name}"?`)) return;
            try {
              await api.deleteFile(f.id);
              const rem = files.filter(x=>x.id!==f.id);
              setFiles(rem);
              if (activeFile?.id===f.id) setActiveFile(rem[0]||null);
              push(`Deleted ${f.name}`,'success');
            } catch(e){ push(e.message,'error'); }
          }}
          onRename={async (f,name)=>{
            try {
              const upd = await api.renameFile(f.id,name);
              setFiles(p=>p.map(x=>x.id===f.id?upd:x));
              if (activeFile?.id===f.id) setActiveFile(upd);
            } catch(e){ push(e.message,'error'); }
          }}
          mobileVisible={mobileTab==='files'}
        />

        <div className={mobileTab==='editor' ? 'maincol show' : 'maincol hide'}
          style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

          {activeFile ? (<>
            <TabBar
              activeFile={activeFile} collab={collab} presence={collab.presence}
              errCount={errCount} warnCount={warnCount}
              onRun={handleRun} onSave={handleSave} onFormat={handleFormat} onSnapshot={handleSnapshot}
              onDownloadFile={handleDownloadFile} onDownloadAll={handleDownloadAll}
            />
            <div className="cc-editor" style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>
              <CodeEditor
                key={activeFile.id}
                content={content}
                remoteContent={collab.remoteContent}
                onChange={c=>{ collab.setContent(c); collab.sendEdit(c); }}
                language={activeFile.language||'text'}
                errorMap={errorMap}
                onSave={handleSave}
                onRun={handleRun}
                onFormat={handleFormat}
                onCursorMove={collab.sendCursor}
                readOnly={!collab.canEdit}
              />
              {showPreview && isPreviewable && (
                <LivePreview content={content} language={activeFile.language} />
              )}
            </div>
            {(errCount>0||warnCount>0) && (
              <div style={{ height:20, background:'#13162b', borderTop:'1px solid #2e3561', display:'flex', alignItems:'center', padding:'0 12px', gap:12, flexShrink:0 }}>
                {errCount>0  && <span style={{ fontSize:11, color:'#ff4d6d', fontWeight:600 }}>⚠ {errCount} error{errCount!==1?'s':''}</span>}
                {warnCount>0 && <span style={{ fontSize:11, color:'#ffd166', fontWeight:600 }}>⚡ {warnCount} warning{warnCount!==1?'s':''}</span>}
              </div>
            )}
          </>) : (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#13162b', color:'#8b96c8', gap:10 }}>
              <div style={{ fontSize:32 }}>📄</div>
              <div style={{ fontSize:12 }}>Select or create a file to start</div>
              <button onClick={()=>setMobileTab('files')} style={{ padding:'6px 14px', background:'rgba(56,226,255,.07)', border:'1px solid rgba(56,226,255,.2)', borderRadius:5, color:'#38e2ff', fontSize:11, cursor:'pointer' }}>Browse Files</button>
            </div>
          )}

          {showTerm && activeFile && (<>
            <div onMouseDown={startDrag}
              style={{ height:4, cursor:'ns-resize', flexShrink:0, background:'transparent', borderTop:'2px solid #1a1f30' }}
              onMouseEnter={e=>e.currentTarget.style.borderTopColor='#38e2ff55'}
              onMouseLeave={e=>e.currentTarget.style.borderTopColor='#2e3561'}
            />
            <TermPanel
              height={termHeight} output={termOutput} running={termRunning}
              stdinVal={stdinVal} onStdinChange={setStdinVal}
              onStdinSubmit={()=>{
                if (!stdinVal.trim()||!termWsRef.current) return;
                termWsRef.current.stdin(stdinVal+'\n');
                setTermOutput(p=>p+stdinVal+'\n');
                setStdinVal('');
              }}
              onRun={handleRun}
              onKill={()=>{ termWsRef.current?.kill(); setTermRunning(false); }}
              onClear={()=>setTermOutput('')}
              onClose={()=>setShowTerm(false)}
              language={activeFile.language||'python'}
              endRef={termEndRef}
            />
          </>)}
        </div>

        <div className={mobileTab==='right' ? 'rightpanel show' : 'rightpanel hide'}
          style={{ width:250, background:'#181c35', borderLeft:'2px solid #2e3561', display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 }}>
          <RightPanel
            tab={rightTab} onTabChange={setRightTab}
            chatMessages={collab.chatMessages}
            onSendChat={msg=>msg.trim()&&collab.sendChat(msg)}
            versions={versions}
            onRestore={async v=>{
              try {
                const upd = await api.restoreVersion(activeFile.id,v.id);
                collab.setContent(upd.content); collab.sendEdit(upd.content);
                setVersions(await api.getVersions(activeFile.id));
                push(`Restored: ${v.label}`,'success');
              } catch(e){ push(e.message,'error'); }
            }}
            presence={collab.presence} workspace={workspace} user={user}
            onRemoveMember={async (_,uid)=>{
              if (!confirm('Remove member?')) return;
              try {
                await api.removeMember(workspace.id,uid);
                setWorkspace(await api.getWorkspace(workspace.id));
                push('Member removed','success');
              } catch(e){ push(e.message,'error'); }
            }}
          />
        </div>
      </div>

      <MobileNav tab={mobileTab} onTab={setMobileTab} />
      <style>{CSS}</style>
    </div>
  );
}

/* Live Preview */
function LivePreview({ content, language }) {
  const ref = useRef(null);
  const getHTML = useCallback(()=>{
    const l=(language||'').toLowerCase();
    if (l==='html') return content||'';
    if (l==='css')  return `<!DOCTYPE html><html><head><style>body{margin:0;padding:12px}${content}</style></head><body></body></html>`;
    return `<!DOCTYPE html><html><head><style>body{margin:0;padding:12px;background:#0a0b0f;color:#c8cde3;font-family:monospace;font-size:12px}</style></head><body><script>
const d=document.body;console.log=(...a)=>{const p=document.createElement('p');p.style.margin='2px 0';p.textContent=a.join(' ');d.appendChild(p);};
console.error=(...a)=>{const p=document.createElement('p');p.style.color='#ff4d6d';p.style.margin='2px 0';p.textContent=a.join(' ');d.appendChild(p);};
window.onerror=(m,_,l)=>{const p=document.createElement('p');p.style.color='#ff4d6d';p.textContent='[L'+l+'] '+m;d.appendChild(p);return true;};
try{${content}}catch(e){const p=document.createElement('p');p.style.color='#ff4d6d';p.textContent=e.message;d.appendChild(p);}
<\/script></body></html>`;
  }, [content, language]);
  useEffect(()=>{
    if (!ref.current) return;
    const blob=new Blob([getHTML()],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    ref.current.src=url;
    return ()=>URL.revokeObjectURL(url);
  },[getHTML]);
  return (
    <div style={{ width:'40%', minWidth:200, display:'flex', flexDirection:'column', borderLeft:'1px solid #2e3561' }}>
      <div style={{ height:30, display:'flex', alignItems:'center', padding:'0 12px', gap:7, background:'#13162b', borderBottom:'1px solid #2e3561', flexShrink:0 }}>
        <span style={{ fontSize:11, color:'#4e5a8a', fontFamily:'var(--font-mono)' }}>● Live Preview</span>
        <div style={{ width:5, height:5, borderRadius:'50%', background:'#2cf59e', animation:'pulse-dot 2s infinite' }} />
      </div>
      <iframe ref={ref} sandbox="allow-scripts" style={{ flex:1, border:'none', background:'#fff' }} />
    </div>
  );
}

/* TabBar */
function TabBar({ activeFile, collab, presence, errCount, warnCount, onRun, onSave, onFormat, onSnapshot, onDownloadFile, onDownloadAll }) {
  const meta = LANG_META[activeFile.language] || LANG_META.text;
  return (
    <div style={{ height:33, background:'#181c35', borderBottom:'1px solid #2e3561', display:'flex', alignItems:'center', padding:'0 8px', gap:4, flexShrink:0, overflowX:'auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 10px', background:'#13162b', borderRadius:'4px 4px 0 0', border:'1px solid #2e3561', borderBottom:'1px solid var(--ed-bg)', position:'relative', top:1, flexShrink:0, maxWidth:180 }}>
        <div style={{ width:6,height:6,borderRadius:'50%',background:meta.color,flexShrink:0 }} />
        <span style={{ fontSize:12,fontFamily:'var(--font-mono)',color:'#cdd5f5',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{activeFile.name}</span>
        {collab.connected && <div style={{ width:4,height:4,borderRadius:'50%',background:'#38e2ff',flexShrink:0 }} />}
      </div>
      {errCount>0  && <span style={{ fontSize:10,padding:'1px 6px',borderRadius:8,background:'rgba(255,77,109,.12)',border:'1px solid rgba(255,77,109,.25)',color:'#ff4d6d',fontWeight:700,flexShrink:0 }}>⚠ {errCount}</span>}
      {warnCount>0 && <span style={{ fontSize:10,padding:'1px 6px',borderRadius:8,background:'rgba(255,209,102,.1)',border:'1px solid rgba(255,209,102,.2)',color:'#ffd166',fontWeight:700,flexShrink:0 }}>⚡ {warnCount}</span>}
      <div style={{ flex:1 }} />
      {presence.slice(0,3).map(p => {
        const c = uColor(p.user_id);
        return <div key={p.user_id} title={p.name} style={{ display:'flex',alignItems:'center',gap:3,padding:'1px 5px',borderRadius:8,background:`${c}12`,border:`1px solid ${c}20`,color:c,fontSize:10,flexShrink:0 }}>
          <div style={{ width:4,height:4,borderRadius:'50%',background:c }} />{p.name?.split(' ')[0]}
        </div>;
      })}
      {[
        {label:'▶ Run',   tip:'Run code (Ctrl+Enter)',     c:'#2cf59e', bg:'rgba(44,245,158,.1)',   fn:onRun},
        {label:'Format',  tip:'Format (Ctrl+Shift+F)',     c:'#38e2ff', bg:'rgba(56,226,255,.08)',  fn:onFormat},
        {label:'💾 Save', tip:'Save file (Ctrl+S)',        c:'#a259ff', bg:'rgba(162,89,255,.08)', fn:onSave},
        {label:'📷',      tip:'Save snapshot',             c:'#ffd166', bg:'rgba(255,209,102,.07)',fn:onSnapshot},
        {label:'⬇ File',  tip:'Download this file',       c:'#2cf59e', bg:'rgba(44,245,158,.06)', fn:onDownloadFile},
        {label:'⬇ All',   tip:'Download all files',       c:'#38e2ff', bg:'rgba(56,226,255,.06)', fn:onDownloadAll},
      ].map(b => (
        <Tooltip key={b.label} label={b.tip}>
          <button onClick={b.fn}
            style={{ padding:'3px 9px',borderRadius:4,fontSize:11,background:b.bg,border:`1px solid ${b.c}25`,color:b.c,fontWeight:600,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.filter='brightness(1.4)'}
            onMouseLeave={e => e.currentTarget.style.filter='none'}>
            {b.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/* TopBar */
function TopBar({ workspace,activeFile,collab,errCount,warnCount,showTerm,onToggleTerm,showPreview,isPreviewable,onTogglePreview,onRun,onSave,onFormat,onSnapshot,onLogout,onBack,onCopyLink,onInvite }) {
  const [showShare,setShowShare]=useState(false);
  const [email,setEmail]=useState('');
  const [role,setRole]=useState('editor');
  const [sending,setSending]=useState(false);
  const { theme, setTheme, themes } = useTheme();
  const ref=useRef(null);
  useEffect(()=>{
    const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setShowShare(false); };
    document.addEventListener('mousedown',h);
    return ()=>document.removeEventListener('mousedown',h);
  },[]);
  const latC = !collab.latency?'#4e5a8a':collab.latency<80?'#2cf59e':collab.latency<200?'#ffd166':'#ff4d6d';
  const doInvite=async()=>{
    if(!email.trim()||sending) return;
    setSending(true);
    try { await onInvite(email.trim(),role); setEmail(''); setShowShare(false); }
    finally { setSending(false); }
  };
  return (
    <header style={{ height:36,display:'flex',alignItems:'center',padding:'0 8px',gap:6,background:'#13162b',borderBottom:'1px solid #2e3561',flexShrink:0,zIndex:200,overflowX:'auto',boxShadow:'0 1px 3px rgba(0,0,0,.12)' }}>
      <Tooltip label="Back to dashboard">
        <button onClick={onBack}
          style={{ background:'none', border:'1px solid #2e3561', color:'#cdd5f5', cursor:'pointer', fontSize:13, padding:'4px 10px', borderRadius:6, lineHeight:1, display:'flex', alignItems:'center', gap:4, fontWeight:600 }}
          onMouseEnter={e=>{ e.currentTarget.style.borderColor='#38e2ff'; e.currentTarget.style.color='#38e2ff'; }}
          onMouseLeave={e=>{ e.currentTarget.style.borderColor='#2e3561'; e.currentTarget.style.color='#cdd5f5'; }}>
          ← Back
        </button>
      </Tooltip>
      <div style={{ width:22,height:22,borderRadius:5,background:'linear-gradient(135deg,#38e2ff,#a259ff)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:900,color:'#000',fontFamily:'var(--font-mono)',flexShrink:0 }}>CC</div>
      <span style={{ fontSize:12,color:'#4e5a8a',maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:0 }}>{workspace?.name}</span>
      {activeFile&&<><span style={{ color:'#2e3561',fontSize:11 }}>/</span><span style={{ fontSize:11,fontFamily:'var(--font-mono)',color:'#cdd5f5',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flexShrink:0 }}>{activeFile.name}</span></>}
      <div style={{ flex:1 }} />
      <div style={{ display:'flex',alignItems:'center',gap:3,padding:'2px 6px',borderRadius:10,background:'#13162b',border:'1px solid #2e3561',flexShrink:0 }} className="hide-xs">
        <div style={{ width:4,height:4,borderRadius:'50%',background:latC }} />
        <span style={{ fontSize:10,fontFamily:'var(--font-mono)',color:latC }}>{collab.latency!=null?`${collab.latency}ms`:collab.connected?'…':'off'}</span>
      </div>
      {isPreviewable&&<Tooltip label={showPreview?'Close preview':'Open live preview'}><button onClick={onTogglePreview} style={{ padding:'2px 8px',borderRadius:4,background:showPreview?'rgba(44,245,158,.1)':'#181c35',border:`1px solid ${showPreview?'rgba(44,245,158,.3)':'#2e3561'}`,color:showPreview?'#2cf59e':'#4e5a8a',fontSize:11,fontWeight:600,cursor:'pointer',flexShrink:0 }}>{showPreview?'◉ Preview':'◎ Preview'}</button></Tooltip>}
      <Tooltip label={showTerm?'Hide terminal':'Show terminal'}><button onClick={onToggleTerm} style={{ padding:'2px 8px',borderRadius:4,background:showTerm?'rgba(44,245,158,.08)':'#181c35',border:`1px solid ${showTerm?'rgba(44,245,158,.25)':'#2e3561'}`,color:showTerm?'#2cf59e':'#4e5a8a',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font-mono)',flexShrink:0 }}>{showTerm?'▼ Term':'▲ Term'}</button></Tooltip>
      <Tooltip label={`Theme: ${themes[theme]?.name} — click to cycle`}>
        <button onClick={()=>setTheme(t=>t==='dark'?'light':t==='light'?'system':'dark')}
          style={{padding:'2px 8px',borderRadius:4,background:'#1e2340',border:'1px solid #2e3561',color:'#cdd5f5',fontSize:14,cursor:'pointer',flexShrink:0}}>
          {themes[theme]?.icon||'🎨'}
        </button>
      </Tooltip>
      <div ref={ref} style={{ position:'relative',flexShrink:0 }}>
        <Tooltip label="Invite collaborators"><button onClick={()=>setShowShare(p=>!p)} style={{ padding:'2px 10px',borderRadius:4,background:'rgba(162,89,255,.1)',border:'1px solid rgba(162,89,255,.25)',color:'#cdd5f5',fontSize:11,fontWeight:600,cursor:'pointer' }}>Share</button></Tooltip>
        {showShare&&(
          <div style={{ position:'fixed',top:44,right:8,width:'min(300px,calc(100vw-16px))',background:'#13162b',border:'1px solid #3a4278',borderRadius:12,padding:16,boxShadow:'0 20px 60px rgba(0,0,0,.9)',zIndex:9999 }}>

            {/* Header */}
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
              <span style={{ fontSize:13,fontWeight:700,color:'#ffffff' }}>Invite to Workspace</span>
              <button onClick={()=>setShowShare(false)} style={{ background:'none',border:'none',color:'#4e5a8a',cursor:'pointer',fontSize:16,lineHeight:1 }}>✕</button>
            </div>

            {/* ── INVITE TOKEN ── */}
            <div style={{ marginBottom:14,padding:12,background:'#181c35',border:'1px solid rgba(56,226,255,.2)',borderRadius:8 }}>
              <p style={{ fontSize:10,fontWeight:700,color:'#38e2ff',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:6 }}>📎 Invite Token</p>
              <p style={{ fontSize:11,color:'#8b96c8',marginBottom:8,lineHeight:1.5 }}>Share this token with anyone to let them join. They paste it in "Join Workspace".</p>
              <div style={{ display:'flex',gap:6,alignItems:'center' }}>
                <code style={{ flex:1,fontSize:10,fontFamily:'var(--mono)',color:'#38e2ff',background:'#1e2340',padding:'5px 8px',borderRadius:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block' }}>{workspace?.invite_token||'...'}</code>
                <Tooltip label="Copy token">
                  <button onClick={()=>{ navigator.clipboard.writeText(workspace?.invite_token||'').then(()=>push('Token copied!','success')); }}
                    style={{ padding:'5px 8px',borderRadius:5,background:'rgba(56,226,255,.1)',border:'1px solid rgba(56,226,255,.3)',color:'#38e2ff',fontSize:11,cursor:'pointer',flexShrink:0,fontWeight:700 }}>Copy</button>
                </Tooltip>
              </div>
            </div>

            {/* ── INVITE LINK ── */}
            <div style={{ marginBottom:14,padding:12,background:'#181c35',border:'1px solid rgba(162,89,255,.2)',borderRadius:8 }}>
              <p style={{ fontSize:10,fontWeight:700,color:'#a259ff',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:6 }}>🔗 Invite Link</p>
              <p style={{ fontSize:11,color:'#8b96c8',marginBottom:8,lineHeight:1.5 }}>One-click link — opens the workspace directly after login.</p>
              <button onClick={()=>{ onCopyLink(); setShowShare(false); }}
                style={{ width:'100%',padding:'8px',background:'rgba(162,89,255,.12)',border:'1px solid rgba(162,89,255,.3)',borderRadius:6,color:'#a259ff',fontSize:12,fontWeight:700,cursor:'pointer' }}>
                📋 Copy Invite Link
              </button>
            </div>

            {/* ── INVITE BY EMAIL ── */}
            <div style={{ padding:12,background:'#181c35',border:'1px solid #2e3561',borderRadius:8 }}>
              <p style={{ fontSize:10,fontWeight:700,color:'#8b96c8',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:8 }}>✉️ Invite by Email</p>
              <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doInvite()} placeholder="colleague@example.com" autoFocus
                style={{ width:'100%',padding:'7px 9px',background:'#1e2340',border:'1px solid #2e3561',borderRadius:5,color:'#ffffff',fontSize:12,outline:'none',marginBottom:8,boxSizing:'border-box' }}
                onFocus={e=>e.target.style.borderColor='#38e2ff'} onBlur={e=>e.target.style.borderColor='#2e3561'}/>
              <div style={{ display:'flex',gap:5,marginBottom:8 }}>
                {[
                  {r:'editor', label:'✏️ Editor', desc:'Can read & write'},
                  {r:'viewer', label:'👁 Viewer', desc:'Read only'},
                ].map(({r,label,desc})=>(
                  <button key={r} onClick={()=>setRole(r)} style={{ flex:1,padding:'6px 4px',borderRadius:6,background:role===r?'rgba(162,89,255,.2)':'#1e2340',border:`1px solid ${role===r?'#a259ff':'#2e3561'}`,color:role===r?'#a259ff':'#8b96c8',fontSize:11,fontWeight:600,cursor:'pointer',textAlign:'center' }}>
                    <div>{label}</div>
                    <div style={{ fontSize:9,color:role===r?'#a259ff':'#4e5a8a',marginTop:1 }}>{desc}</div>
                  </button>
                ))}
              </div>
              <button onClick={doInvite} disabled={sending||!email.trim()} style={{ width:'100%',padding:'8px',background:'linear-gradient(135deg,#38e2ff,#a259ff)',border:'none',borderRadius:6,color:'#000',fontSize:12,fontWeight:700,cursor:'pointer',opacity:(sending||!email.trim())?0.5:1 }}>{sending?'Sending…':'Send Email Invite'}</button>
            </div>
          </div>
        )}
      </div>
      <Tooltip label="Sign out"><button onClick={onLogout} style={gb()} 
        onMouseEnter={e=>e.currentTarget.style.color='#ff4d6d'}
        onMouseLeave={e=>e.currentTarget.style.color='#4e5a8a'}>⏏</button></Tooltip>
    </header>
  );
}

/* FileSidebar */
function FileSidebar({ files,activeFile,onSelect,onNew,onDelete,onRename,mobileVisible,onUpload,uploadRef,uploadFolderRef }) {
  const [showForm,setShowForm]=useState(false);
  const [newName,setNewName]=useState('');
  const [newLang,setNewLang]=useState('python');
  const [search,setSearch]=useState('');
  const [renId,setRenId]=useState(null);
  const [renVal,setRenVal]=useState('');
  const inputRef=useRef(null);
  useEffect(()=>{ if(showForm) inputRef.current?.focus(); },[showForm]);
  const visible=files.filter(f=>!search||f.name.toLowerCase().includes(search.toLowerCase()));
  const create=()=>{
    if(!newName.trim()) return;
    const l=detectLanguage(newName)!=='text'?detectLanguage(newName):newLang;
    onNew(newName.trim(),l); setNewName(''); setShowForm(false);
  };
  return (
    <div className={`sidebar${mobileVisible?' show':''}`}
      style={{ width:200,background:'#181c35',borderRight:'2px solid #2e3561',display:'flex',flexDirection:'column',overflow:'hidden',flexShrink:0 }}>
      <div style={{ height:34,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 8px',borderBottom:'1px solid #181c35',flexShrink:0 }}>
        <span style={{ fontSize:9,fontWeight:700,letterSpacing:'1px',color:'#4e5a8a',textTransform:'uppercase' }}>Explorer</span>
        <div style={{ display:'flex',alignItems:'center',gap:2 }}>
          <Tooltip label="Upload file(s)" placement="bottom">
            <button onClick={()=>uploadRef?.current?.click()} title="Upload files"
              style={{background:'none',border:'none',color:'#4e5a8a',cursor:'pointer',padding:'3px 5px',borderRadius:4,fontSize:14,lineHeight:1,display:'flex',alignItems:'center'}}
              onMouseEnter={e=>e.currentTarget.style.color='var(--cyan)'}
              onMouseLeave={e=>e.currentTarget.style.color='#4e5a8a'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </button>
          </Tooltip>
          <Tooltip label="Upload folder" placement="bottom">
            <button onClick={()=>uploadFolderRef?.current?.click()} title="Upload folder"
              style={{background:'none',border:'none',color:'#4e5a8a',cursor:'pointer',padding:'3px 5px',borderRadius:4,fontSize:14,lineHeight:1,display:'flex',alignItems:'center'}}
              onMouseEnter={e=>e.currentTarget.style.color='var(--cyan)'}
              onMouseLeave={e=>e.currentTarget.style.color='#4e5a8a'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><polyline points="12 11 12 17"/><polyline points="9 14 12 11 15 14"/></svg>
            </button>
          </Tooltip>
          <Tooltip label="New file" placement="bottom">
            <button onClick={()=>setShowForm(p=>!p)}
              style={{background:'none',border:'none',color:'#4e5a8a',cursor:'pointer',padding:'3px 5px',borderRadius:4,fontSize:18,lineHeight:1,display:'flex',alignItems:'center'}}
              onMouseEnter={e=>e.currentTarget.style.color='var(--cyan)'}
              onMouseLeave={e=>e.currentTarget.style.color='#4e5a8a'}>+</button>
          </Tooltip>
        </div>
      </div>
      {/* Hidden inputs for upload */}
      <input ref={uploadRef} type="file" multiple onChange={onUpload} style={{display:'none'}} />
      <input ref={uploadFolderRef} type="file" multiple onChange={onUpload} style={{display:'none'}} webkitdirectory="" />
      <div style={{ padding:'4px 8px',borderBottom:'1px solid #2e3561',flexShrink:0 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter…"
          style={{ width:'100%',padding:'4px 7px',background:'#181c35',border:'1px solid #2e3561',borderRadius:4,color:'#cdd5f5',fontSize:11,fontFamily:'var(--font-mono)',outline:'none',boxSizing:'border-box' }}
          onFocus={e=>e.target.style.borderColor='#38e2ff'} onBlur={e=>e.target.style.borderColor='#2e3561'}/>
      </div>
      {showForm&&(
        <div style={{ padding:8,borderBottom:'1px solid #2e3561',animation:'slide-in-up .12s ease',flexShrink:0 }}>
          <input ref={inputRef} value={newName} onChange={e=>setNewName(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') create(); if(e.key==='Escape') setShowForm(false); }}
            placeholder="filename.py"
            style={{ width:'100%',padding:'4px 7px',background:'#181c35',border:'1px solid #38e2ff',borderRadius:4,color:'#ffffff',fontSize:11,outline:'none',marginBottom:5,boxSizing:'border-box' }}/>
          <select value={newLang} onChange={e=>setNewLang(e.target.value)}
            style={{ width:'100%',padding:'3px 5px',background:'#181c35',border:'1px solid #2e3561',borderRadius:4,color:'#cdd5f5',fontSize:11,outline:'none',marginBottom:6 }}>
            {Object.entries(LANG_META).map(([l,m])=><option key={l} value={l}>{m.label}</option>)}
          </select>
          <div style={{ display:'flex',gap:4 }}>
            <button onClick={create} style={{ flex:1,padding:'5px',background:'#38e2ff',border:'none',borderRadius:4,color:'#000',fontSize:10,fontWeight:700,cursor:'pointer' }}>Create</button>
            <button onClick={()=>setShowForm(false)} style={{ flex:1,padding:'5px',background:'#181c35',border:'1px solid #2e3561',borderRadius:4,color:'#8b96c8',fontSize:10,cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ flex:1,overflowY:'auto',padding:'2px 0' }}>
        {visible.length===0&&<div style={{ padding:'14px 10px',textAlign:'center',fontSize:11,color:'#4e5a8a' }}>{search?'No matches':'No files yet'}</div>}
        {visible.map(f=>{
          const active=activeFile?.id===f.id;
          const meta=LANG_META[f.language]||LANG_META.text;
          return(
            <div key={f.id} className="frow" onClick={()=>renId!==f.id&&onSelect(f)}
              style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 6px 4px 10px',background:active?'rgba(56,226,255,.07)':'transparent',borderLeft:`2px solid ${active?'#38e2ff':'transparent'}`,cursor:'pointer',minHeight:26,userSelect:'none' }}>
              <div style={{ width:6,height:6,borderRadius:'50%',background:meta.color,flexShrink:0,opacity:.8 }} />
              {renId===f.id?(
                <input value={renVal} onChange={e=>setRenVal(e.target.value)} autoFocus onClick={e=>e.stopPropagation()}
                  onBlur={()=>{ if(renVal.trim()&&renVal!==f.name) onRename(f,renVal.trim()); setRenId(null); }}
                  onKeyDown={e=>{ if(e.key==='Enter'){ if(renVal.trim()&&renVal!==f.name) onRename(f,renVal.trim()); setRenId(null); } if(e.key==='Escape') setRenId(null); }}
                  style={{ flex:1,background:'#252b4a',border:'1px solid #38e2ff',borderRadius:3,color:'#ffffff',fontSize:11,padding:'1px 4px',outline:'none' }}/>
              ):(
                <span style={{ flex:1,fontSize:11,fontFamily:'var(--font-mono)',color:active?'#ffffff':'#8b96c8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{f.name}</span>
              )}
              <div className="fbtns" style={{ display:'flex',gap:1,flexShrink:0 }}>
                <Tooltip label="Rename file" placement="top"><button onClick={e=>{ e.stopPropagation(); setRenId(f.id); setRenVal(f.name); }} style={ib()}
                  onMouseEnter={e=>{ e.stopPropagation(); e.currentTarget.style.color='#38e2ff'; }}
                  onMouseLeave={e=>{ e.stopPropagation(); e.currentTarget.style.color='#4e5a8a'; }}>✎</button></Tooltip>
                <Tooltip label="Delete file" placement="top"><button onClick={e=>{ e.stopPropagation(); onDelete(f); }} style={ib()}
                  onMouseEnter={e=>{ e.stopPropagation(); e.currentTarget.style.color='#ff4d6d'; }}
                  onMouseLeave={e=>{ e.stopPropagation(); e.currentTarget.style.color='#4e5a8a'; }}>✕</button></Tooltip>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Terminal */
function TermPanel({ height,output,running,stdinVal,onStdinChange,onStdinSubmit,onRun,onKill,onClear,onClose,language,endRef }) {
  const lines = useMemo(()=>(output||'').split('\n').map((ln,i)=>{
    const t=ln.replace(/\x1b\[[0-9;]*m/g,'');
    let c='#cdd5f5';
    if(/Traceback|Error:|Exception|FAILED/i.test(t)) c='#ff4d6d';
    else if(/warning/i.test(t)) c='#ffd166';
    else if(/code 0/i.test(t)) c='#2cf59e';
    else if(/▶ Running/i.test(t)) c='#4e5a8a';
    return <div key={i} style={{ color:c,lineHeight:1.55,minHeight:'1em',fontFamily:'var(--font-mono)',fontSize:12,whiteSpace:'pre-wrap',wordBreak:'break-all' }}>{t||'\u00a0'}</div>;
  }),[output]);
  return (
    <div style={{ height,background:'#181c35',display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden',borderTop:'2px solid #2e3561' }}>
      <div style={{ height:30,display:'flex',alignItems:'center',padding:'0 10px',gap:6,background:'#0d0f1a',borderBottom:'1px solid #2e3561',flexShrink:0 }}>
        <div style={{ display:'flex',gap:4 }}>{['#ff5f56','#ffbd2e','#27c93f'].map(c=><div key={c} style={{ width:8,height:8,borderRadius:'50%',background:c }} />)}</div>
        <span style={{ fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700,color:'#2cf59e' }}>Terminal</span>
        <span style={{ fontSize:10,color:'#4e5a8a',fontFamily:'var(--font-mono)' }}>{language}</span>
        {running&&<><div style={{ width:5,height:5,borderRadius:'50%',background:'#2cf59e',animation:'pulse-dot 1s infinite' }} /><span style={{ fontSize:10,color:'#2cf59e',fontWeight:600 }}>Running…</span></>}
        <div style={{ flex:1 }} />
        <Tooltip label="Run code (Ctrl+Enter)"><button onClick={onRun}   style={tbn('#2cf59e','rgba(44,245,158,.1)')}>▶ Run</button></Tooltip>
        {running&&<Tooltip label="Stop running process"><button onClick={onKill} style={tbn('#ff4d6d','rgba(255,77,109,.1)')}>■ Kill</button></Tooltip>}
        <Tooltip label="Clear terminal output"><button onClick={onClear} style={tbn('#4e5a8a','#181c35')}>Clear</button></Tooltip>
        <Tooltip label="Hide terminal"><button onClick={onClose} style={{ background:'none',border:'none',color:'#4e5a8a',cursor:'pointer',fontSize:14,padding:'0 3px',lineHeight:1 }}
          onMouseEnter={e=>e.currentTarget.style.color='#ff4d6d'}
          onMouseLeave={e=>e.currentTarget.style.color='#4e5a8a'}>✕</button></Tooltip>
      </div>
      <div style={{ flex:1,overflowY:'auto',padding:'6px 12px' }}>
        {lines}
        {running&&<span style={{ display:'inline-block',width:7,height:12,background:'#2cf59e',animation:'pulse-dot .7s infinite',verticalAlign:'middle' }} />}
        <div ref={endRef} />
      </div>
      <div style={{ height:30,borderTop:'1px solid #141726',display:'flex',alignItems:'center',padding:'0 10px',gap:5,flexShrink:0,background:'#0d0f1a' }}>
        <span style={{ fontFamily:'var(--font-mono)',fontSize:13,color:'#2cf59e' }}>›</span>
        <input value={stdinVal} onChange={e=>onStdinChange(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onStdinSubmit()}
          placeholder={running?'stdin — press Enter…':'Press ▶ Run first…'} disabled={!running}
          style={{ flex:1,background:'none',border:'none',outline:'none',color:'#cdd5f5',fontFamily:'var(--font-mono)',fontSize:12,opacity:running?1:.35 }}/>
      </div>
    </div>
  );
}

/* Right Panel */
function RightPanel({ tab,onTabChange,chatMessages,onSendChat,versions,onRestore,presence,workspace,user,onRemoveMember }) {
  return(
    <div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column' }}>
      <div style={{ display:'flex',borderBottom:'1px solid #2e3561',flexShrink:0 }}>
        {[['chat','💬','Team chat'],['history','🕒','Version history'],['users','👥','Online members']].map(([id,icon,tip])=>(
          <Tooltip key={id} label={tip} placement="bottom">
            <button onClick={()=>onTabChange(id)}
              style={{ flex:1,padding:'7px',background:'none',border:'none',borderBottom:`2px solid ${tab===id?'#a259ff':'transparent'}`,color:tab===id?'#a259ff':'#4e5a8a',fontSize:14,cursor:'pointer' }}>
              {icon}
            </button>
          </Tooltip>
        ))}
      </div>
      <div style={{ flex:1,overflow:'hidden',display:'flex',flexDirection:'column',minHeight:0 }}>
        {tab==='chat'    && <ChatPanel messages={chatMessages} onSend={onSendChat} uid={user?.id} />}
        {tab==='history' && <HistoryPanel versions={versions} onRestore={onRestore} />}
        {tab==='users'   && <UsersPanel presence={presence} workspace={workspace} user={user} onRemove={onRemoveMember} />}
      </div>
    </div>
  );
}

function ChatPanel({ messages,onSend,uid }) {
  const [input,setInput]=useState('');
  const endRef=useRef(null);
  useEffect(()=>endRef.current?.scrollIntoView({behavior:'smooth'}),[messages]);
  const send=()=>{ if(!input.trim()) return; onSend(input.trim()); setInput(''); };
  return(
    <div style={{ display:'flex',flexDirection:'column',height:'100%',minHeight:0 }}>
      <div style={{ flex:1,overflowY:'auto',padding:10,display:'flex',flexDirection:'column',gap:8,minHeight:0 }}>
        {messages.length===0&&<div style={{ color:'#4e5a8a',fontSize:11,textAlign:'center',paddingTop:16 }}>No messages yet</div>}
        {messages.map((m,i)=>{
          const isMe=m.is_me||m.user_id===uid;
          const c=m.user_color||uColor(m.user_id);
          return(
            <div key={m.id||i}>
              <div style={{ display:'flex',alignItems:'center',gap:5,marginBottom:2 }}>
                <div style={{ width:16,height:16,borderRadius:'50%',background:`${c}20`,border:`1.5px solid ${c}45`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,fontWeight:700,color:c }}>{(m.user_initials||m.user_name||'?').slice(0,2).toUpperCase()}</div>
                <span style={{ fontSize:11,fontWeight:700,color:c }}>{isMe?'You':m.user_name}</span>
                <span style={{ fontSize:9,color:'#4e5a8a',marginLeft:'auto' }}>{m.created_at?new Date(m.created_at).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}):''}</span>
              </div>
              <div style={{ padding:'5px 8px',marginLeft:21,borderRadius:isMe?'6px 2px 6px 6px':'2px 6px 6px 6px',background:isMe?`${c}10`:'#181c35',border:`1px solid ${isMe?c+'20':'#2e3561'}`,fontSize:12,lineHeight:1.5,wordBreak:'break-word',color:'#cdd5f5' }}>{m.message}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div style={{ padding:8,borderTop:'1px solid #141726',display:'flex',gap:5,flexShrink:0 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()} placeholder="Message…"
          style={{ flex:1,background:'#181c35',border:'1px solid #2e3561',borderRadius:5,padding:'6px 9px',color:'#cdd5f5',fontSize:12,outline:'none' }}
          onFocus={e=>e.target.style.borderColor='#38e2ff'} onBlur={e=>e.target.style.borderColor='#2e3561'}/>
        <Tooltip label="Send message (Enter)"><button onClick={send} style={{ width:30,height:30,borderRadius:5,background:'linear-gradient(135deg,#38e2ff,#a259ff)',border:'none',color:'#000',fontSize:13,cursor:'pointer',fontWeight:800,flexShrink:0 }}>↑</button></Tooltip>
      </div>
    </div>
  );
}

function HistoryPanel({ versions,onRestore }) {
  const [busy,setBusy]=useState(null);
  return(
    <div style={{ display:'flex',flexDirection:'column',height:'100%',minHeight:0 }}>
      <div style={{ padding:'7px 12px',borderBottom:'1px solid #2e3561',flexShrink:0 }}>
        <span style={{ fontSize:11,fontWeight:700,color:'#8b96c8' }}>Version History ({versions.length})</span>
      </div>
      <div style={{ flex:1,overflowY:'auto',padding:8,minHeight:0 }}>
        {versions.length===0&&<div style={{ fontSize:11,color:'#4e5a8a',textAlign:'center',paddingTop:14 }}>No snapshots yet</div>}
        {versions.map(v=>(
          <div key={v.id} style={{ marginBottom:6,padding:'7px 9px',borderRadius:5,background:'#181c35',border:'1px solid #2e3561' }}>
            <div style={{ fontSize:11,fontWeight:600,color:'#cdd5f5',marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{v.label}</div>
            <div style={{ fontSize:10,color:'#4e5a8a',marginBottom:6 }}>{v.created_by_name} · {new Date(v.created_at).toLocaleString()}</div>
            <button onClick={async()=>{ setBusy(v.id); try{await onRestore(v);}finally{setBusy(null);} }} disabled={busy===v.id}
              style={{ padding:'2px 8px',borderRadius:3,fontSize:10,cursor:'pointer',background:'rgba(44,245,158,.08)',color:'#2cf59e',border:'1px solid rgba(44,245,158,.2)',fontWeight:600 }}>
              {busy===v.id?'…':'Restore'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersPanel({ presence,workspace,user,onRemove }) {
  return(
    <div style={{ flex:1,overflowY:'auto',padding:8 }}>
      {presence.map(p=>{
        const c=uColor(p.user_id);
        return(
          <div key={p.user_id} style={{ padding:'7px 9px',borderRadius:5,marginBottom:5,background:'#181c35',border:'1px solid #2e3561',display:'flex',alignItems:'center',gap:7 }}>
            <div style={{ position:'relative' }}>
              <div style={{ width:26,height:26,borderRadius:'50%',background:`${c}25`,border:`2px solid ${c}40`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:c }}>{(p.name||'?').slice(0,2).toUpperCase()}</div>
              <div style={{ position:'absolute',bottom:0,right:0,width:6,height:6,borderRadius:'50%',background:'#2cf59e',border:'1.5px solid #141726' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11,fontWeight:600,color:'#cdd5f5' }}>{p.name}{p.user_id===user?.id?' (you)':''}</div>
              <div style={{ fontSize:10,color:c }}>{p.role||'editor'} · L{p.cursor?.line||1}</div>
            </div>
          </div>
        );
      })}
      {presence.length===0&&<div style={{ fontSize:11,color:'#4e5a8a',textAlign:'center',paddingTop:14 }}>Only you here</div>}
    </div>
  );
}

function MobileNav({ tab,onTab }) {
  return(
    <nav className="mobnav" style={{ position:'fixed',bottom:0,left:0,right:0,height:46,background:'#0d0f1a',borderTop:'1px solid #2e3561',display:'flex',zIndex:150 }}>
      {[['files','📁','File Explorer'],['editor','✏️','Code Editor'],['right','💬','Chat & History']].map(([id,icon,label])=>(
        <Tooltip key={id} label={label} placement="top">
          <button onClick={()=>onTab(id)}
            style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'none',border:'none',cursor:'pointer',gap:1,borderTop:`2px solid ${tab===id?'#38e2ff':'transparent'}`,color:tab===id?'#38e2ff':'#4e5a8a' }}>
            <span style={{ fontSize:16 }}>{icon}</span>
            <span style={{ fontSize:9,fontWeight:600 }}>{label.split(' ')[0]}</span>
          </button>
        </Tooltip>
      ))}
    </nav>
  );
}

function Screen({text}){ return <div style={{ height:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0f1a',color:'#4e5a8a',fontSize:13 }}>{text}</div>; }
function gb(){ return { background:'none',border:'1px solid transparent',color:'#4e5a8a',cursor:'pointer',fontSize:14,padding:'4px 6px',borderRadius:4,lineHeight:1 }; }
function ib(){ return { background:'none',border:'none',color:'#4e5a8a',cursor:'pointer',fontSize:11,padding:'2px 3px',lineHeight:1,borderRadius:3 }; }
function tbn(color,bg){ return { padding:'2px 8px',borderRadius:4,fontSize:11,background:bg,border:`1px solid ${color}28`,color,fontWeight:700,cursor:'pointer',flexShrink:0 }; }

const CSS=`
  @media(min-width:769px){
    .mobnav{display:none!important;}
    .sidebar{display:flex!important;}
    .maincol{display:flex!important;}
    .rightpanel{display:flex!important;}
  }
  @media(max-width:768px){
    .sidebar{position:fixed!important;top:36px;left:0;bottom:46px;width:100%!important;z-index:100;display:none!important;}
    .sidebar.show{display:flex!important;flex-direction:column;}
    .maincol.hide{display:none!important;}
    .maincol.show{display:flex!important;flex:1;}
    .rightpanel.hide{display:none!important;}
    .rightpanel.show{display:flex!important;flex:1;width:100%!important;}
    .hide-xs{display:none!important;}
    body{padding-bottom:46px;}
  }
  .fbtns{opacity:0!important;transition:opacity .1s;}
  .frow:hover .fbtns{opacity:1!important;}
`;
