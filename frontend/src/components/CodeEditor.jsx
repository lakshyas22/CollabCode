import { useEffect, useRef, useCallback, useState, useMemo } from 'react';

/**
 * CodeEditor — textarea + highlight overlay
 * Uses CSS variables (--ed-bg, --ed-text, --ed-caret) so theme switching works.
 */

const FONT    = "'JetBrains Mono', 'Fira Code', monospace";
const FSIZE   = 13;
const LHEIGHT = 20;   // fixed px — never em (em causes sub-pixel drift)
const PAD_TOP  = 8;
const PAD_LEFT = 14;

export default function CodeEditor({
  content = '', onChange, language = 'text', errorMap = {},
  onSave, onRun, onFormat, onCursorMove, readOnly = false,
  remoteContent = null,  // { text, version } — forces instant update from remote
}) {
  const taRef  = useRef(null);
  const hlRef  = useRef(null);
  const lnRef  = useRef(null);
  const [lines,  setLines]  = useState(1);
  const [curLn,  setCurLn]  = useState(1);

  const sync = useCallback(() => {
    const ta = taRef.current, hl = hlRef.current, ln = lnRef.current;
    if (!ta || !hl || !ln) return;
    hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft;
    ln.scrollTop = ta.scrollTop;
  }, []);

  const hlHTML = useMemo(() => {
    const rows = (content || '').split('\n');
    setLines(rows.length);
    return rows.map((raw, i) => {
      const n   = i + 1;
      const err = errorMap[n];
      const bg  = err ? (err.type === 'error' ? 'rgba(255,77,109,.13)' : 'rgba(255,209,102,.09)') : 'transparent';
      const shadow = err ? (err.type === 'error' ? 'inset 3px 0 0 #ff4d6d' : 'inset 3px 0 0 #ffd166') : 'none';
      const esc = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const hl  = language === 'text' ? esc : syntaxHL(esc, language);
      return `<div style="height:${LHEIGHT}px;line-height:${LHEIGHT}px;background:${bg};box-shadow:${shadow};white-space:pre">${hl || '\u00a0'}</div>`;
    }).join('');
  }, [content, errorMap, language]);

  const updateCursor = useCallback(() => {
    const ta = taRef.current; if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const ln  = (before.match(/\n/g) || []).length + 1;
    const col = ta.selectionStart - before.lastIndexOf('\n');
    setCurLn(ln); onCursorMove?.({ line: ln, col });
  }, [onCursorMove]);

  // Sync LOCAL content changes (user typing locally → no cursor jump needed)
  useEffect(() => {
    const ta = taRef.current;
    if (!ta || ta.value === content) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = content;
    ta.setSelectionRange(Math.min(s, content.length), Math.min(e, content.length));
    sync();
  }, [content, sync]);

  // Sync REMOTE content changes (another user typed → force update immediately)
  useEffect(() => {
    if (!remoteContent) return;
    const ta = taRef.current;
    if (!ta) return;
    // Save cursor position before overwrite
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = remoteContent.text;
    // Try to restore cursor, clamped to new length
    try {
      ta.setSelectionRange(
        Math.min(s, remoteContent.text.length),
        Math.min(e, remoteContent.text.length)
      );
    } catch(_) {}
    sync();
  }, [remoteContent, sync]);

  const onKey = useCallback(ev => {
    if (readOnly) { ev.preventDefault(); return; }
    const ta = taRef.current; if (!ta) return;
    const { key, ctrlKey, metaKey, shiftKey, altKey } = ev;
    const mod = ctrlKey || metaKey;
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;

    if (mod && !shiftKey && key === 's') { ev.preventDefault(); onSave?.(); return; }
    if (mod && key === 'Enter')          { ev.preventDefault(); onRun?.();  return; }
    if (mod && shiftKey && key === 'F')  { ev.preventDefault(); onFormat?.(); return; }

    if (key === 'Tab') {
      ev.preventDefault();
      if (!shiftKey && s === e) {
        const nv = v.slice(0,s)+'    '+v.slice(e); ta.value=nv; ta.setSelectionRange(s+4,s+4);
      } else {
        const ls=v.lastIndexOf('\n',s-1)+1, le=v.indexOf('\n',e-1);
        const blk=v.slice(ls,le===-1?undefined:le);
        const out=shiftKey?blk.replace(/^ {1,4}/gm,''):blk.replace(/^/gm,'    ');
        const d=out.length-blk.length;
        ta.value=v.slice(0,ls)+out+(le===-1?'':v.slice(le));
        ta.setSelectionRange(Math.max(ls,s+(shiftKey?-Math.min(4,blk.split('\n')[0].match(/^ */)[0].length):4)),e+d);
      }
      onChange?.(ta.value); return;
    }

    if (mod && key==='/') {
      ev.preventDefault();
      const cc=COMMENT[language.toLowerCase()]||'//';
      const ls=v.lastIndexOf('\n',s-1)+1, le=v.indexOf('\n',e);
      const blk=v.slice(ls,le===-1?undefined:le), lns=blk.split('\n');
      const all=lns.every(l=>l.trimStart().startsWith(cc));
      const out=all?lns.map(l=>l.replace(new RegExp('^(\\s*)'+escRx(cc)+' ?'),'$1')).join('\n'):lns.map(l=>l.replace(/^(\s*)/,'$1'+cc+' ')).join('\n');
      ta.value=v.slice(0,ls)+out+(le===-1?'':v.slice(le));
      ta.setSelectionRange(s+(all?-(cc.length+1):cc.length+1),e+(out.length-blk.length));
      onChange?.(ta.value); return;
    }

    if (altKey && key==='ArrowUp') {
      ev.preventDefault();
      const ls=v.lastIndexOf('\n',s-1)+1; if(ls===0) return;
      const le=v.indexOf('\n',s); const tl=v.slice(ls,le===-1?undefined:le);
      const ps=v.lastIndexOf('\n',ls-2)+1; const pl=v.slice(ps,ls-1);
      ta.value=v.slice(0,ps)+tl+'\n'+pl+(le===-1?'':v.slice(le));
      const ns=ps+(s-ls); ta.setSelectionRange(ns,ns+e-s);
      onChange?.(ta.value); return;
    }
    if (altKey && key==='ArrowDown') {
      ev.preventDefault();
      const ls=v.lastIndexOf('\n',s-1)+1; const le=v.indexOf('\n',s); if(le===-1) return;
      const tl=v.slice(ls,le); const ne=v.indexOf('\n',le+1); const nl=v.slice(le+1,ne===-1?undefined:ne);
      ta.value=v.slice(0,ls)+nl+'\n'+tl+(ne===-1?'':v.slice(ne));
      const ns=ls+nl.length+1+(s-ls); ta.setSelectionRange(ns,ns+e-s);
      onChange?.(ta.value); return;
    }
    if (mod&&shiftKey&&key==='K') {
      ev.preventDefault();
      const ls=v.lastIndexOf('\n',s-1)+1; const le=v.indexOf('\n',s);
      ta.value=le===-1?v.slice(0,ls>0?ls-1:0):v.slice(0,ls)+v.slice(le+1);
      ta.setSelectionRange(ls,ls); onChange?.(ta.value); return;
    }
    if (mod&&shiftKey&&key==='D') {
      ev.preventDefault();
      const ls=v.lastIndexOf('\n',s-1)+1; const le=v.indexOf('\n',s);
      const ln=v.slice(ls,le===-1?undefined:le);
      ta.value=le===-1?v+'\n'+ln:v.slice(0,le)+'\n'+ln+v.slice(le);
      ta.setSelectionRange(s,e); onChange?.(ta.value); return;
    }
    const PAIRS={'(':')','[':']','{':'}','"':'"',"'":"'",'`':'`'};
    if (PAIRS[key]&&s===e) {
      ev.preventDefault();
      ta.value=v.slice(0,s)+key+PAIRS[key]+v.slice(e);
      ta.setSelectionRange(s+1,s+1); onChange?.(ta.value); return;
    }
    if (key==='Enter') {
      const ls=v.lastIndexOf('\n',s-1)+1;
      const ind=v.slice(ls,s).match(/^(\s*)/)[1];
      if ('{(['.includes(v[s-1])&&'})]'.includes(v[s])) {
        ev.preventDefault();
        const ins='\n'+ind+'    \n'+ind; ta.value=v.slice(0,s)+ins+v.slice(e);
        const cur=s+ind.length+5; ta.setSelectionRange(cur,cur);
        onChange?.(ta.value); return;
      }
      if (ind) {
        ev.preventDefault();
        const ins='\n'+ind; ta.value=v.slice(0,s)+ins+v.slice(e);
        ta.setSelectionRange(s+ins.length,s+ins.length);
        onChange?.(ta.value); return;
      }
    }
  }, [language, onChange, onSave, onRun, onFormat, readOnly]);

  const onInput = useCallback(ev => {
    onChange?.(ev.target.value); sync(); updateCursor();
  }, [onChange, sync, updateCursor]);

  const lineNums = useMemo(() => Array.from({length:lines},(_,i)=>i+1), [lines]);

  return (
    <div style={{flex:1, display:'flex', overflow:'hidden', background:'var(--ed-bg,#0a0b0f)', position:'relative'}}>

      {/* Line numbers — uses CSS var so theme changes apply */}
      <div ref={lnRef} style={{
        width:52, flexShrink:0,
        background:'var(--ed-bg,#0a0b0f)',
        borderRight:'1px solid var(--b0,#181d2e)',
        overflowY:'hidden', overflowX:'hidden',
        fontFamily:FONT, fontSize:FSIZE,
        paddingTop:PAD_TOP,
        userSelect:'none', textAlign:'right',
        transition:'background .2s, border-color .2s',
      }}>
        {lineNums.map(n=>(
          <div key={n} style={{
            height:LHEIGHT, lineHeight:`${LHEIGHT}px`,
            paddingRight:8, paddingLeft:4,
            color: n===curLn ? 'var(--cyan,#38e2ff)'
                 : errorMap[n] ? (errorMap[n].type==='error'?'#ff4d6d':'#ffd166')
                 : 'var(--t3,#3a4460)',
            background: n===curLn ? 'rgba(56,226,255,0.05)' : 'transparent',
          }}>{n}</div>
        ))}
      </div>

      {/* Overlay + Textarea stack */}
      <div style={{flex:1, position:'relative', overflow:'hidden'}}>

        {/* Highlight overlay — same layout as textarea */}
        <div ref={hlRef} aria-hidden="true"
          dangerouslySetInnerHTML={{__html:hlHTML}}
          style={{
            position:'absolute', top:0, left:0, right:0, bottom:0,
            fontFamily:FONT, fontSize:FSIZE, lineHeight:`${LHEIGHT}px`,
            paddingTop:PAD_TOP, paddingLeft:PAD_LEFT, paddingRight:PAD_LEFT, paddingBottom:PAD_TOP,
            overflowY:'scroll', overflowX:'scroll',
            whiteSpace:'pre', wordBreak:'normal',
            pointerEvents:'none', userSelect:'none',
            color:'var(--ed-text,#c8cde3)',
            background:'transparent',
            scrollbarWidth:'none',
            boxSizing:'border-box',
            tabSize:4,
            transition:'color .2s',
          }}
        />

        {/* Textarea — transparent text, visible caret + selection */}
        <textarea ref={taRef}
          defaultValue={content}
          readOnly={readOnly}
          onInput={onInput}
          onKeyDown={onKey}
          onScroll={sync}
          onClick={updateCursor}
          onKeyUp={updateCursor}
          onSelect={updateCursor}
          onFocus={updateCursor}
          spellCheck={false} autoCapitalize="none" autoCorrect="off" autoComplete="off"
          style={{
            position:'absolute', top:0, left:0, right:0, bottom:0,
            width:'100%', height:'100%',
            fontFamily:FONT, fontSize:FSIZE, lineHeight:`${LHEIGHT}px`,
            paddingTop:PAD_TOP, paddingLeft:PAD_LEFT, paddingRight:PAD_LEFT, paddingBottom:PAD_TOP,
            background:'transparent',
            color:'transparent',
            caretColor: readOnly ? 'transparent' : 'var(--ed-caret,#38e2ff)',
            border:'none', outline:'none', resize:'none',
            overflowY:'scroll', overflowX:'scroll',
            whiteSpace:'pre', wordBreak:'normal',
            tabSize:4, boxSizing:'border-box',
            WebkitTextFillColor:'transparent',
            cursor: readOnly ? 'default' : 'text',
          }}
        />

        {readOnly && (
          <div style={{
            position:'absolute', top:6, right:10,
            fontSize:10, color:'var(--t2,#4e5878)',
            fontFamily:FONT, background:'var(--ed-bg,#0a0b0f)',
            padding:'1px 6px', borderRadius:4, border:'1px solid var(--b0,#1a1f30)',
            pointerEvents:'none', zIndex:2,
          }}>READ ONLY</div>
        )}
        {!content && !readOnly && (
          <div style={{
            position:'absolute', top:PAD_TOP, left:52+PAD_LEFT,
            fontSize:FSIZE, fontFamily:FONT, lineHeight:`${LHEIGHT}px`,
            color:'var(--t3,#2a3050)', pointerEvents:'none', userSelect:'none', zIndex:1,
          }}>Start typing…</div>
        )}

        <style>{`
          textarea::-webkit-scrollbar { width:8px; height:8px; }
          textarea::-webkit-scrollbar-track { background:var(--ed-bg,#0a0b0f); }
          textarea::-webkit-scrollbar-thumb { background:var(--b0,#1a1f30); border-radius:4px; }
          textarea::-webkit-scrollbar-thumb:hover { background:var(--b1,#252b3d); }
          textarea::selection { background: rgba(56,226,255,0.28) !important; }
          div[aria-hidden="true"]::-webkit-scrollbar { display:none; }
        `}</style>
      </div>
    </div>
  );
}

const COMMENT = {
  python:'#',ruby:'#',bash:'#',shell:'#',yaml:'#',toml:'#',r:'#',
  javascript:'//',typescript:'//',jsx:'//',tsx:'//',
  java:'//',cpp:'//',c:'//',csharp:'//',go:'//',rust:'//',kotlin:'//',swift:'//',
  sql:'--',lua:'--',haskell:'--',
  html:'<!--',xml:'<!--',css:'/*',scss:'/*',
};
function escRx(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function syntaxHL(esc, lang) {
  const l = lang.toLowerCase();
  if (['python','ruby','bash','shell','yaml','r','toml'].includes(l) && /^(\s*)(#.*)$/.test(esc))
    return esc.replace(/^(\s*)(#.*$)/,'$1<span class="hl-comment">$2</span>');
  if (['javascript','typescript','jsx','tsx','java','cpp','c','csharp','go','rust','kotlin','swift','dart'].includes(l) && /^(\s*)(\/\/.*)$/.test(esc))
    return esc.replace(/^(\s*)(\/\/.*$)/,'$1<span class="hl-comment">$2</span>');
  if (l==='html'||l==='xml')
    return esc.replace(/(&lt;\/?)([\w-]+)/g,'$1<span class="hl-keyword">$2</span>');
  if (l==='css'||l==='scss')
    return esc.replace(/([\w-]+)(\s*:)(?!\s*:)/g,'<span class="hl-key">$1</span>$2')
               .replace(/(#[\da-fA-F]{3,8})/g,'<span class="hl-string">$1</span>');
  if (l==='json')
    return esc.replace(/(\"(?:[^\"\\]|\\.)*\")(\s*:)/g,'<span class="hl-key">$1</span>$2')
               .replace(/:\s*(\"(?:[^\"\\]|\\.)*\")/g,': <span class="hl-string">$1</span>')
               .replace(/\b(true|false|null)\b/g,'<span class="hl-keyword">$1</span>')
               .replace(/:\s*(-?\d+(?:\.\d+)?)/g,': <span class="hl-number">$1</span>');
  const KW={
    python:['def','class','import','from','return','if','elif','else','for','while','try','except','finally','with','as','in','not','and','or','True','False','None','pass','break','continue','raise','yield','lambda','async','await'],
    javascript:['const','let','var','function','class','return','if','else','for','while','do','switch','case','break','continue','import','export','default','new','this','typeof','instanceof','try','catch','finally','throw','async','await','of','in','from','null','undefined','true','false'],
    typescript:['const','let','var','function','class','return','if','else','for','while','import','export','default','new','this','async','await','type','interface','enum','implements','readonly','abstract','as','null','undefined','true','false'],
    jsx:['const','let','var','function','class','return','if','else','for','while','import','export','default','new','this','async','await','from','null','true','false'],
    go:['func','var','const','type','struct','interface','import','package','return','if','else','for','range','switch','case','break','continue','go','chan','defer','map','make','new','nil','true','false'],
    rust:['fn','let','mut','const','struct','enum','trait','impl','use','pub','return','if','else','for','while','loop','match','async','await','true','false','Some','None','Ok','Err'],
    java:['public','private','protected','class','interface','return','if','else','for','while','new','this','try','catch','finally','static','void','int','String','boolean','true','false','null'],
    cpp:['int','void','class','struct','return','if','else','for','while','new','delete','this','namespace','using','const','static','true','false','nullptr','auto','template'],
  };
  const kws=KW[l]||KW['javascript'];
  let r=esc;
  r=r.replace(/((?:&quot;|&#39;|`)(?:[^&`]|&(?!quot;|#39;|amp;))*(?:&quot;|&#39;|`))/g,'<span class="hl-string">$1</span>');
  r=r.replace(/\b(\d+(?:\.\d+)?)\b/g,'<span class="hl-number">$1</span>');
  if(kws.length) r=r.replace(new RegExp('\\b('+kws.join('|')+')\\b','g'),'<span class="hl-keyword">$1</span>');
  r=r.replace(/@\w+/g,'<span class="hl-decorator">$&</span>');
  r=r.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g,(m,fn)=>kws.includes(fn)?m:`<span class="hl-function">${fn}</span>`);
  return r;
}
