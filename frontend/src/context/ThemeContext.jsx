import { createContext, useContext, useState, useEffect } from 'react';

const Ctx = createContext(null);

export const THEMES = {
  dark: {
    name: 'Dark', icon: '🌙',
    vars: {
      '--bg0':'#0d0f1a', '--bg1':'#13162b', '--bg2':'#181c35', '--bg3':'#1e2340', '--bg4':'#252b4a',
      '--b0':'#2e3561', '--b1':'#3a4278',
      '--t0':'#ffffff', '--t1':'#cdd5f5', '--t2':'#8b96c8', '--t3':'#4e5a8a',
      '--cyan':'#38e2ff', '--violet':'#a259ff', '--green':'#2cf59e',
      '--orange':'#ff8c42', '--red':'#ff4d6d', '--yellow':'#ffd166',
      '--ed-bg':'#0b0d1a', '--ed-text':'#e2e8ff', '--ed-caret':'#38e2ff',
    },
  },
  light: {
    name: 'Light', icon: '☀️',
    vars: {
      '--bg0':'#f0f2f8', '--bg1':'#ffffff', '--bg2':'#e4e8f4', '--bg3':'#d8ddf0', '--bg4':'#c8cfe8',
      '--b0':'#b0b8d8', '--b1':'#9098c8',
      '--t0':'#0a0b1e', '--t1':'#1a1f3c', '--t2':'#444a70', '--t3':'#7880a8',
      '--cyan':'#0055cc', '--violet':'#6d28d9', '--green':'#0a6e40',
      '--orange':'#b03a00', '--red':'#b91c1c', '--yellow':'#7a5400',
      '--ed-bg':'#f8f9ff', '--ed-text':'#0a0b1e', '--ed-caret':'#6d28d9',
    },
  },
  system: {
    name: 'System', icon: '💻',
    vars: null,
  },
};

function applyTheme(key) {
  let resolved = key;
  if (key === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  const vars = THEMES[resolved] && THEMES[resolved].vars;
  if (!vars) return;
  const root = document.documentElement;
  Object.entries(vars).forEach(function(entry) {
    root.style.setProperty(entry[0], entry[1]);
  });
  root.style.setProperty('--bg-0', vars['--bg0']);
  root.style.setProperty('--bg-1', vars['--bg1']);
  root.style.setProperty('--bg-2', vars['--bg2']);
  root.style.setProperty('--bg-3', vars['--bg3']);
  root.style.setProperty('--bg-4', vars['--bg4']);
  root.style.setProperty('--border', vars['--b0']);
  root.style.setProperty('--text-0', vars['--t0']);
  root.style.setProperty('--text-1', vars['--t1']);
  root.style.setProperty('--text-2', vars['--t2']);
  root.style.setProperty('--text-3', vars['--t3']);
  root.style.setProperty('--accent-cyan', vars['--cyan']);
  root.style.setProperty('--accent-violet', vars['--violet']);
  root.style.setProperty('--accent-green', vars['--green']);
  root.style.setProperty('--accent-red', vars['--red']);
  root.style.setProperty('--accent-yellow', vars['--yellow']);
  root.style.setProperty('--font-mono', "'JetBrains Mono','Fira Code',monospace");
  root.style.setProperty('--font-sans', "'Syne',system-ui,sans-serif");
  root.setAttribute('data-theme', resolved);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(function() {
    return localStorage.getItem('cc_theme') || 'dark';
  });

  useEffect(function() {
    applyTheme(theme);
    localStorage.setItem('cc_theme', theme);
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var handler = function() { if (theme === 'system') applyTheme('system'); };
    mq.addEventListener('change', handler);
    return function() { mq.removeEventListener('change', handler); };
  }, [theme]);

  return (
    <Ctx.Provider value={{ theme: theme, setTheme: setTheme, themes: THEMES }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() { return useContext(Ctx); }
