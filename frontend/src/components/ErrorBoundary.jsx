import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error: error.message || String(error) };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0d0f1a', color:'#fff', fontFamily:'monospace', padding:32, gap:16 }}>
          <div style={{ fontSize:32 }}>💥</div>
          <div style={{ fontSize:18, fontWeight:700, color:'#ff4d6d' }}>Something crashed</div>
          <div style={{ fontSize:13, color:'#8b96c8', maxWidth:600, textAlign:'center', background:'#181c35', padding:'16px 20px', borderRadius:10, border:'1px solid #2e3561', wordBreak:'break-all' }}>
            {this.state.error}
          </div>
          <button onClick={() => window.location.href = '/dashboard'}
            style={{ padding:'10px 24px', background:'linear-gradient(135deg,#38e2ff,#a259ff)', border:'none', borderRadius:8, color:'#000', fontWeight:700, cursor:'pointer', fontSize:14 }}>
            Back to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
