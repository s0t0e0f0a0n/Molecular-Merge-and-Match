import { useEffect, useState } from 'react';

type LoadingExerciseOverlayProps = {
  loading: boolean;
};

type PausedExerciseOverlayProps = {
  paused: boolean;
  resuming?: boolean;
  onResume: () => void;
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

export function PausedExerciseOverlay({
  paused,
  resuming = false,
  onResume,
}: PausedExerciseOverlayProps) {
  if (!paused) return null;

  return (
    <button
      type="button"
      data-testid="paused-exercise-overlay"
      onClick={onResume}
      disabled={resuming}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(255, 255, 255, 0.82)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        cursor: resuming ? 'wait' : 'pointer',
        backdropFilter: 'blur(3px)',
        padding: 24,
      }}
      aria-label="Exercise paused overlay"
      title="Click anywhere to resume"
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          color: '#333',
        }}
      >
        <img
          src={`${import.meta.env.BASE_URL}coffee.svg`}
          alt="Paused exercise"
          style={{ width: 86, height: 86 }}
        />
        <span style={{ fontSize: 22, fontWeight: 700 }}>...exercise paused...</span>
        {resuming ? <span style={{ fontSize: 13, fontWeight: 500 }}>Resuming...</span> : null}
      </span>
    </button>
  );
}