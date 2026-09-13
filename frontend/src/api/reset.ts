import { deleteExercise } from './exercises';

export type ResetLevel = 'logbook' | 'workspace' | 'completion' | 'progression' | 'remove';

export async function resetExercises(exerciseIds: number[], level: ResetLevel): Promise<void> {
  if (level === 'remove') {
    await Promise.all(exerciseIds.map((exerciseId) => deleteExercise(exerciseId)));
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