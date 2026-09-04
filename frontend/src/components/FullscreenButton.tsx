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
		title="Toggle Fullscreen"
        onClick={handleToggle}
        style={{
          width: 28,
          height: 28,
          padding: 0,
          borderRadius: 6,
          border: '1px solid #ccc',
          background: 'white',
          color: '#111',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 0,
        }}
      >
	{/* inline SVG's */}
	{/*  there is a 2x2 block in the center without fill, as well as an edge of 3 px which is empty   */}
	{/*  hence diagonals run from 3,21 to 21,3 skipping at 10,14, resume at 14,10    */}
        {isFullscreen ? (
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
				style={{ display: 'block' }}
			>
				<path 
					d="M21 3 L14 10 M14 4 V10 H20 M3 21 L10 14 M4 14 H10 V20" 
					stroke="currentColor" 
					strokeWidth="2" 
					strokeLinecap="round" 
					strokeLinejoin="round" 
				/>
			</svg>
        ) : (
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
				style={{ display: 'block' }}
			>
				<path 
					d="M14 10 L21 3 M15 3 H21 V9 M10 14 L3 21 M9 21 H3 V15" 
					stroke="currentColor" 
					strokeWidth="2" 
					strokeLinecap="round" 
					strokeLinejoin="round" 
				/>
			</svg>
        )}
      </button>
    </div>
  );
};