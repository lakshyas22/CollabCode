import { useState } from 'react';

const TYPES = {
  success: { bar: 'var(--accent-green)',  label: 'Done'    },
  error:   { bar: 'var(--accent-red)',    label: 'Error'   },
  info:    { bar: 'var(--accent-cyan)',   label: 'Info'    },
  warning: { bar: 'var(--accent-yellow)', label: 'Warning' },
};

export default function Notification({ notifications, onDismiss }) {
  return (
    <div style={{ position:'fixed', top:58, right:14, zIndex:9999, display:'flex', flexDirection:'column', gap:7, pointerEvents:'none' }}>
      {notifications.map(n => {
        const cfg = TYPES[n.type] || TYPES.success;
        return (
          <div key={n.id} style={{
            padding:'10px 14px', borderRadius:8, background:'#161b28',
            border:`1px solid ${cfg.bar}28`, boxShadow:`0 8px 28px rgba(0,0,0,0.5)`,
            display:'flex', alignItems:'center', gap:10,
            animation:'notification-in .22s cubic-bezier(.34,1.56,.64,1)',
            maxWidth:310, minWidth:220, pointerEvents:'all',
          }}>
            <div style={{ width:3, height:28, borderRadius:2, background:cfg.bar, flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, fontWeight:700, color:cfg.bar, letterSpacing:'.5px', textTransform:'uppercase', marginBottom:2 }}>{cfg.label}</div>
              <div style={{ fontSize:12, color:'#e8ecf5', lineHeight:1.4 }}>{n.msg}</div>
            </div>
            <button onClick={() => onDismiss(n.id)}
              title="Dismiss"
              style={{ background:'none', border:'none', color:'#4e5878', fontSize:18, cursor:'pointer', flexShrink:0, lineHeight:1 }}
              onMouseEnter={e=>e.currentTarget.style.color='#e8ecf5'}
              onMouseLeave={e=>e.currentTarget.style.color='#4e5878'}>×</button>
          </div>
        );
      })}
    </div>
  );
}
