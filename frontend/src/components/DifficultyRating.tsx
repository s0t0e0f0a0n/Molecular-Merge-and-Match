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
};

export function DifficultyRating({ resetKey, exerciseId }: DifficultyRatingProps) {
  const [selectedRating, setSelectedRating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedRating(null);
  }, [resetKey]);

  const handleRating = async (rating: (typeof ratings)[number]) => {
    if (exerciseId === null || saving) return;
    setSaving(true);
    try {
      await rateExerciseDifficulty(exerciseId, rating.value === 'easy' ? 'E' : rating.value === 'medium' ? 'M' : 'D');
      setSelectedRating(rating.value);
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
