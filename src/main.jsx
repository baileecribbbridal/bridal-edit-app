import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

class AppErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error){
    return { hasError: true, error };
  }
  componentDidCatch(error, info){
    console.error("APP RENDER ERROR:", error);
    console.error("COMPONENT STACK:", info && info.componentStack);
  }
  render(){
    if(this.state.hasError){
      return (
        <div style={{minHeight:"100vh",background:"#fff",color:"#111",fontFamily:"Georgia, serif",display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem",textAlign:"center"}}>
          <div style={{maxWidth:420}}>
            <p style={{fontFamily:"Arial, sans-serif",fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:"#888",margin:"0 0 0.5rem"}}>The Bridal Edit</p>
            <h1 style={{fontSize:22,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 1rem"}}>SOMETHING WENT WRONG</h1>
            <p style={{fontStyle:"italic",color:"#666",lineHeight:1.6,margin:"0 0 1.5rem"}}>We hit a snag loading your bridal hub. Tap below to try again.</p>
            <button onClick={()=>window.location.reload()} style={{background:"#111",color:"#fff",border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.16em",fontFamily:"Arial, sans-serif",textTransform:"uppercase",cursor:"pointer"}}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

if(typeof window !== "undefined"){
  window.addEventListener("error", (event)=>{
    console.error("WINDOW ERROR:", event?.error || event?.message, event?.filename, event?.lineno);
  });
  window.addEventListener("unhandledrejection", (event)=>{
    console.error("UNHANDLED PROMISE REJECTION:", event?.reason);
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
