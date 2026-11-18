import { describe, expect, it } from 'vitest';
import { getLatestUnfinishedExercise, getStartAtExerciseId } from '../../../src/features/exercises/startAt';
import type { ExerciseSummary } from '../../../src/api/exercises';

const exercises: ExerciseSummary[] = [
  {
    id: 9,
    name: 'Sucrose',
    exercise_set: 'Examples',
    tags: [],
  },
  {
    id: 15,
    name: 'Recently finished',
    exercise_set: 'Examples',
    tags: [],
    completed: true,
    started_at: '2026-01-01T10:00:00Z',
    completed_at: '2026-01-01T11:00:00Z',
  },
  {
    id: 16,
    name: 'Most recently finished',
    exercise_set: 'Examples',
    tags: [],
    completed: true,
    completed_at: '2026-02-01T11:00:00Z',
  },
  {
    id: 17,
    name: 'Incomplete',
    exercise_set: 'Examples',
    tags: [],
    completed: false,
    started_at: '2026-03-01T10:00:00Z',
  },
];

describe('getStartAtExerciseId', () => {
  it('selects the most recently completed exercise', () => {
    expect(getStartAtExerciseId(exercises, 'last_finished', 9)).toBe(16);
  });

  it('selects the most recently started incomplete exercise', () => {
    expect(getStartAtExerciseId(exercises, 'last_incomplete', 9)).toBe(17);
  });

  it('returns the latest unfinished exercise while excluding the stop target', () => {
    const stopTarget = {
      id: 18,
      name: 'Sucrose',
      exercise_set: 'Examples',
      tags: [],
      started_at: '2026-04-01T10:00:00Z',
    };

    expect(getLatestUnfinishedExercise([...exercises, stopTarget], stopTarget.id)?.id).toBe(17);
    expect(getLatestUnfinishedExercise([exercises[0]])).toBeUndefined();
  });

  it('selects the configured exercise or falls back to Sucrose', () => {
    expect(getStartAtExerciseId(exercises, 'custom', 17)).toBe(17);
    expect(getStartAtExerciseId(exercises, 'custom', 99)).toBe(9);
  });
});
