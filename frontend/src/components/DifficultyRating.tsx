import { useEffect, useState } from 'react';
import { rateExerciseDifficulty } from '../api/exercises';

const ratings = [
  { value: 'easy', label: 'Easy', border: '#4CAF50', background: '#E8F5E9', color: '#2E7D32' },
  { value: 'medium', label: 'Medium', border: '#2196F3', background: '#E3F2FD', color: '#1565C0' },
  { value: 'hard', label: 'Hard', border: '#FF5722', background: '#FFF3E0', color: '#E65100' },
] as const;

type DifficultyRatingProps = {
  resetKey: string;
  exerciseId: number | null;
  confidence?: number;
  iterateDifficulty: boolean;
  onRated?: () => void;
};

export function DifficultyRating({ resetKey, exerciseId, confidence = 3, iterateDifficulty, onRated }: DifficultyRatingProps) {
  const [selectedRating, setSelectedRating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedRating(null);
  }, [resetKey]);

  const handleRating = async (rating: (typeof ratings)[number]) => {
    if (exerciseId === null || saving) return;
    setSaving(true);
    try {
      await rateExerciseDifficulty(
        exerciseId,
        rating.value === 'easy' ? 'E' : rating.value === 'medium' ? 'M' : 'D',
        confidence,
        iterateDifficulty,
      );
      setSelectedRating(rating.value);
      onRated?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Rate this exercise according to its difficulty"
      style={{ display: 'flex', gap: 4, marginTop: 4 }}
    >
      {ratings.map((rating) => (
        <button
          key={rating.value}
          type="button"
          aria-label={rating.label}
          aria-pressed={selectedRating === rating.value}
          onClick={() => void handleRating(rating)}
          disabled={saving}
          style={{
            padding: '2px 8px',
            borderRadius: 6,
            border: `1px solid ${rating.border}`,
            background: rating.background,
            color: rating.color,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            opacity: selectedRating === null || selectedRating === rating.value ? 1 : 0.55,
          }}
        >
          {rating.label}
        </button>
      ))}
    </div>
  );
}

type ValidationOverlayProps = {
  exerciseId: number | null;
  resetKey: string;
  confidence?: number;
  iterateDifficulty: boolean;
  onRated: () => void;
};

export function ValidationOverlay({
  exerciseId,
  resetKey,
  confidence = 3,
  iterateDifficulty,
  onRated,
}: ValidationOverlayProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="validation-overlay-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.86)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        style={{
          minWidth: 280,
          padding: 24,
          border: '1px solid #d8d8d8',
          borderRadius: 12,
          background: 'white',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.14)',
          textAlign: 'center',
        }}
      >
        <div
          id="validation-overlay-title"
          style={{ color: '#0f5f0f', fontSize: 18, fontWeight: 700 }}
        >
          Your answer is correct.
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: '#555' }}>
          Rate the difficulty to continue.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <DifficultyRating
            exerciseId={exerciseId}
            resetKey={resetKey}
            confidence={confidence}
            iterateDifficulty={iterateDifficulty}
            onRated={onRated}
          />
        </div>
      </div>
    </div>
  );
}
