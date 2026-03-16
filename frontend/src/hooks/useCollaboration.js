import { useState, useEffect, useRef, useCallback } from 'react';
import { createCollabWS } from '../utils/api.js';

export function useCollaboration(fileId, token) {
  const [connected,    setConnected]    = useState(false);
  const [content,      setContent]      = useState('');
  const [presence,     setPresence]     = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [latency,      setLatency]      = useState(null);
  const [initialized,  setInitialized]  = useState(false);
  const [canEdit,      setCanEdit]      = useState(true);
  const [myRole,       setMyRole]       = useState('editor');
  // Track remote edits separately so CodeEditor knows to force-update
  const [remoteContent, setRemoteContent] = useState(null);  // {text, version}
  const remoteVersionRef = useRef(0);

  const wsRef    = useRef(null);
  const pingRef  = useRef(null);
  const lastPing = useRef(null);

  useEffect(() => {
    if (!fileId || !token) return;
    setInitialized(false); setCanEdit(true);
    setRemoteContent(null); remoteVersionRef.current = 0;

    const ws = createCollabWS(fileId, token, {
      onConnect: () => {
        setConnected(true);
        pingRef.current = setInterval(() => {
          lastPing.current = Date.now();
          ws.send({ type: 'ping' });
        }, 5000);
      },
      onMessage: (d) => {
        if (d.type === 'init') {
          const v = ++remoteVersionRef.current;
          setContent(d.content || '');
          setRemoteContent({ text: d.content || '', version: v });
          setPresence(d.presence || []);
          setInitialized(true);
          setCanEdit(d.can_edit !== false);
          setMyRole(d.role || 'editor');
        }
        if (d.type === 'pong' && lastPing.current) {
          setLatency(Date.now() - lastPing.current);
        }
        // REMOTE edit — force-push to editor immediately
        if (d.type === 'edit') {
          const v = ++remoteVersionRef.current;
          setContent(d.content || '');
          setRemoteContent({ text: d.content || '', version: v });
        }
        if (d.type === 'cursor') {
          setPresence(prev => {
            const rest = prev.filter(p => p.user_id !== d.user_id);
            const ex   = prev.find(p => p.user_id === d.user_id);
            return [...rest, { ...(ex||{}), user_id: d.user_id, cursor: d.position, ...d.user_info }];
          });
        }
        if (d.type === 'user_joined' || d.type === 'user_left') {
          setPresence(d.presence || []);
        }
        if (d.type === 'chat') {
          setChatMessages(prev => [...prev, {
            id: d.id || Date.now(), user_name: d.user_name,
            user_initials: d.user_initials, user_color: d.user_color,
            user_id: d.user_id, message: d.message,
            created_at: d.created_at, is_me: d.is_me || false,
          }]);
        }
        if (d.type === 'error' && d.code === 'READ_ONLY') {
          setCanEdit(false);
        }
      },
      onDisconnect: () => { setConnected(false); clearInterval(pingRef.current); },
      onError:      () => { setConnected(false); clearInterval(pingRef.current); },
    });

    wsRef.current = ws;
    return () => { clearInterval(pingRef.current); ws.close(); };
  }, [fileId, token]);

  const sendEdit   = useCallback(c => { if (wsRef.current) wsRef.current.send({ type: 'edit', content: c }); }, []);
  const sendCursor = useCallback(p => { if (wsRef.current) wsRef.current.send({ type: 'cursor', position: p }); }, []);
  const sendChat   = useCallback(m => { if (wsRef.current) wsRef.current.send({ type: 'chat', message: m }); }, []);

  return {
    connected, content, setContent, remoteContent,
    presence, chatMessages, setChatMessages,
    latency, initialized, canEdit, myRole,
    sendEdit, sendCursor, sendChat,
  };
}
