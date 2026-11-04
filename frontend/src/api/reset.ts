import { deleteExercise } from './exercises';

export type ResetLevel = 'logbook' | 'workspace' | 'completion' | 'progression' | 'exercise';

export async function resetExercises(exerciseIds: number[], level: ResetLevel): Promise<void> {
  if (level === 'exercise') {
    let failed = false;
    for (const exerciseId of exerciseIds) {
      try {
        await deleteExercise(exerciseId);
      } catch {
        failed = true;
      }
    }
    if (failed) {
      throw new Error('Failed to delete one or more exercises');
    }
    return;
  }

  const response = await fetch('/api/v1/exercises/reset-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercise_ids: exerciseIds, level }),
  });
  if (!response.ok) {
    throw new Error(`Failed to reset exercises (${response.status})`);
  }
}

// Reopens exercises whose due date has passed, as when enabling spaced repetition; due dates are kept.
export async function resetDueExercises(): Promise<number[]> {
  const response = await fetch('/api/v1/exercises/reset-due', { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to reset exercises (${response.status})`);
  }
  const body = await response.json() as { exercise_ids: number[] };
  return body.exercise_ids;
}
