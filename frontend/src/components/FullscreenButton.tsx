import { useState, useEffect } from 'react';

export const FullscreenButton = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const checkFullscreen = () => {
      if (document.fullscreenElement != null) {
        setIsFullscreen(true);
        return;
      }
      
      if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) {
        setIsFullscreen(true);
        return;
      }

      const dpr = window.devicePixelRatio || 1;

      const isCssFullscreen = 
        Math.abs(window.innerHeight - window.screen.height) <= 2;

      const isPhysicalFullscreen = 
        Math.abs(window.innerHeight * dpr - window.screen.height) <= 2;

      const isOuterFullscreen = 
        Math.abs(window.outerHeight - window.screen.height) <= 2 ||
        Math.abs(window.outerHeight * dpr - window.screen.height) <= 2;

      const isNoChrome = 
        window.outerHeight !== 0 && 
        window.outerHeight === window.innerHeight && 
        window.outerWidth === window.innerWidth;

      setIsFullscreen(
        isCssFullscreen || isPhysicalFullscreen || isOuterFullscreen || isNoChrome
      );
    };

    checkFullscreen();

    let timeouts: number[] = [];
    const handleResize = () => {
      checkFullscreen();
      // On macOS, the fullscreen transition is an animation.
      // The resize event may fire before the window reaches its final non-fullscreen state.
      timeouts.forEach(clearTimeout);
      timeouts = [100, 500, 1000].map(delay => window.setTimeout(checkFullscreen, delay));
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', checkFullscreen);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', checkFullscreen);
      timeouts.forEach(clearTimeout);
    };
  }, []);

  const handleToggle = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.toggleFullscreen();
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error("Fullscreen error:", err));
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px solid #ccc',
          background: 'white',
          color: '#111',
          cursor: 'pointer',
          fontSize: 13,
          whiteSpace: 'nowrap',
        }}
      >
        {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      </button>
    </div>
  );
};