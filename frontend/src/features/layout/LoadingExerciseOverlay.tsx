import { useEffect, useState } from 'react';

type LoadingExerciseOverlayProps = {
  loading: boolean;
};

export function LoadingExerciseOverlay({
  loading,
}: LoadingExerciseOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeoutId: number;

    if (loading) {
      timeoutId = window.setTimeout(() => {
        setVisible(true);
      }, 250); 
    } else {
      setVisible(false);
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [loading]);

  if (!visible) return null;

  return (
    <div
      data-testid="loading-exercise-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(255, 255, 255, 0.85)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        fontWeight: 600,
        color: '#333',
        backdropFilter: 'blur(2px)',
      }}
    >
      Loading exercise...
    </div>
  );
}