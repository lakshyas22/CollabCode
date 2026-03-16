import { useState, useRef, useEffect } from 'react';

/**
 * Tooltip — wraps any element and shows a dark label on hover.
 * Usage:  <Tooltip label="Save file (Ctrl+S)"><button>…</button></Tooltip>
 * Or:     <Btn tooltip="Back to dashboard" onClick={…}>←</Btn>
 */
export default function Tooltip({ label, children, placement = 'top', delay = 400 }) {
  const [visible, setVisible] = useState(false);
  const [pos,     setPos]     = useState({ top: 0, left: 0 });
  const ref     = useRef(null);
  const timerRef= useRef(null);

  const show = () => {
    timerRef.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let top, left;
      if (placement === 'top') {
        top  = r.top + window.scrollY - 30;
        left = r.left + window.scrollX + r.width / 2;
      } else if (placement === 'bottom') {
        top  = r.bottom + window.scrollY + 6;
        left = r.left + window.scrollX + r.width / 2;
      } else if (placement === 'left') {
        top  = r.top + window.scrollY + r.height / 2;
        left = r.left + window.scrollX - 8;
      } else { // right
        top  = r.top + window.scrollY + r.height / 2;
        left = r.right + window.scrollX + 8;
      }
      setPos({ top, left });
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const transformMap = {
    top:    'translateX(-50%)',
    bottom: 'translateX(-50%)',
    left:   'translateX(-100%) translateY(-50%)',
    right:  'translateY(-50%)',
  };

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide}
      style={{ display:'contents' }}>
      {children}
      {visible && label && (
        <span style={{
          position: 'fixed',
          top:  pos.top,
          left: pos.left,
          transform: transformMap[placement],
          background: '#1c2030',
          color: '#e8ecf5',
          fontSize: 11,
          fontWeight: 600,
          padding: '4px 9px',
          borderRadius: 5,
          border: '1px solid #252b3d',
          boxShadow: '0 4px 16px rgba(0,0,0,.5)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 99999,
          fontFamily: "'Syne', system-ui, sans-serif",
          letterSpacing: '.2px',
          animation: 'fadein .1s ease',
        }}>
          {label}
          {/* Arrow */}
          {placement === 'top' && (
            <span style={{ position:'absolute', bottom:-5, left:'50%', transform:'translateX(-50%)',
              width:0, height:0, borderLeft:'5px solid transparent', borderRight:'5px solid transparent',
              borderTop:'5px solid #252b3d' }} />
          )}
          {placement === 'bottom' && (
            <span style={{ position:'absolute', top:-5, left:'50%', transform:'translateX(-50%)',
              width:0, height:0, borderLeft:'5px solid transparent', borderRight:'5px solid transparent',
              borderBottom:'5px solid #252b3d' }} />
          )}
        </span>
      )}
    </span>
  );
}
