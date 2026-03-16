const BASE    = import.meta.env.VITE_API_URL || '';
const WS_BASE = import.meta.env.VITE_WS_URL  || '';
const V1      = BASE + '/api/v1';

function tok() { return localStorage.getItem('cc_token'); }

function wsBase() {
  // In production use explicit WS URL, in dev derive from current host
  if (WS_BASE) return WS_BASE;
  if (typeof window === 'undefined') return 'ws://localhost:8000';
  const s = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return s + '//' + window.location.host;
}

async function req(method, path, body) {
  const h = { 'Content-Type': 'application/json' };
  const t = tok();
  if (t) h['Authorization'] = 'Bearer ' + t;
  const r = await fetch(V1 + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return null;
  const d = await r.json();
  if (!r.ok) {
    const det = d.detail;
    throw new Error(typeof det === 'string' ? det : (det && det.message) || 'Request failed');
  }
  return d;
}

export const api = {
  login:      (email, password)        => req('POST', '/auth/login',                      { email, password }),
  signup:     (name, email, password)  => req('POST', '/auth/signup',                     { name, email, password }),
  me:         ()                       => req('GET',  '/auth/me'),
  googleAuth: (credential)             => req('POST', '/auth/oauth/google',               { credential }),

  listWorkspaces:    ()                => req('GET',  '/workspace/my'),
  createWorkspace:   (name, skipDefault=false) => req('POST', '/workspace' + (skipDefault ? '?skip_default=true' : ''), { name }),
  getWorkspace:      (id)              => req('GET',  '/workspace/' + id),
  inviteToWorkspace: (id, email, role) => req('POST', '/workspace/' + id + '/invite',     { email, role }),
  joinByToken:       (token)           => req('POST', '/workspace/join/' + token),
  removeMember:      (wsId, uid)       => req('DELETE', '/workspace/' + wsId + '/members/' + uid),
  deleteWorkspace:   (id)              => req('DELETE', '/workspace/' + id),

  listFiles:      (wsId)               => req('GET',  '/file/workspace/' + wsId),
  createFile:     (wsId, name, lang)   => req('POST', '/file',                            { workspace_id: wsId, name, language: lang }),
  updateFile:     (id, content)        => req('PUT',  '/file/' + id,                      { content }),
  renameFile:     (id, name)           => req('PATCH', '/file/' + id + '/rename',         { name }),
  deleteFile:     (id)                 => req('DELETE', '/file/' + id),
  getVersions:    (id)                 => req('GET',  '/file/' + id + '/versions'),
  saveVersion:    (id, label)          => req('POST', '/file/' + id + '/versions',        { label }),
  restoreVersion: (fid, vid)           => req('POST', '/file/' + fid + '/versions/' + vid + '/restore'),

  getHistory:     (wsId)               => req('GET',  '/chat/' + wsId),
};

// Collab WebSocket — used by useCollaboration hook
export function createCollabWS(fileId, token, handlers) {
  const ws = new WebSocket(wsBase() + '/api/v1/ws/' + fileId + '?token=' + token);
  let ping;
  ws.onopen    = () => {
    handlers.onConnect && handlers.onConnect();
    ping = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); }, 25000);
  };
  ws.onmessage = e => { try { handlers.onMessage && handlers.onMessage(JSON.parse(e.data)); } catch (_) {} };
  ws.onclose   = e => { clearInterval(ping); handlers.onDisconnect && handlers.onDisconnect(e.code, e.reason); };
  ws.onerror   = e => { handlers.onError && handlers.onError(e); };
  return {
    send:  d  => ws.readyState === 1 && ws.send(JSON.stringify(d)),
    close: () => { clearInterval(ping); ws.close(); },
  };
}

// Terminal WebSocket — used by WorkspacePage
export function createTerminalWS(fileId, token, handlers) {
  const ws = new WebSocket(wsBase() + '/api/v1/ws/terminal/' + fileId + '?token=' + token);
  let ping;
  ws.onopen    = () => {
    ping = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); }, 20000);
  };
  ws.onmessage = e => { try { handlers.onMessage && handlers.onMessage(JSON.parse(e.data)); } catch (_) {} };
  ws.onclose   = e => { clearInterval(ping); handlers.onDisconnect && handlers.onDisconnect(e.code); };
  ws.onerror   = e => { handlers.onError && handlers.onError(e); };
  return {
    run:   (code, lang) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'run', code, language: lang })),
    stdin: (data)       => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'stdin', data })),
    kill:  ()           => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'kill' })),
    close: () => { clearInterval(ping); ws.close(); },
  };
}

// Aliases
export const collabWS = createCollabWS;
export const termWS   = createTerminalWS;
