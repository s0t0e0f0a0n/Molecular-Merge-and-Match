import type { ExerciseSummary } from '../../api/exercises';
import type { StartAtMode } from '../../api/settings';

function latestByTimestamp(
  exercises: ExerciseSummary[],
  getTimestamp: (exercise: ExerciseSummary) => string | null | undefined,
): ExerciseSummary | undefined {
  let latest: ExerciseSummary | undefined;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const exercise of exercises) {
    const rawTimestamp = getTimestamp(exercise);
    if (!rawTimestamp) continue;

    const timestamp = Date.parse(rawTimestamp);
    if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
      latest = exercise;
      latestTimestamp = timestamp;
    }
  }

  return latest;
}

export function getLatestUnfinishedExercise(
  exercises: ExerciseSummary[],
  excludeExerciseId?: number,
): ExerciseSummary | undefined {
  return latestByTimestamp(
    exercises.filter(
      (exercise) =>
        exercise.id !== excludeExerciseId &&
        !exercise.completed_at &&
        exercise.completed !== true,
    ),
    (exercise) => exercise.started_at,
  );
}

export function getStartAtExerciseId(
  exercises: ExerciseSummary[],
  mode: StartAtMode,
  customExerciseId: number,
): number | null {
  if (mode === 'last_finished') {
    const lastFinished = latestByTimestamp(
      exercises,
      (exercise) => exercise.completed_at,
    );
    if (lastFinished) return lastFinished.id;
  } else if (mode === 'last_incomplete') {
    const lastIncomplete = getLatestUnfinishedExercise(exercises);
    if (lastIncomplete) return lastIncomplete.id;
  } else {
    const selectedExercise = exercises.find((exercise) => exercise.id === customExerciseId);
    if (selectedExercise) return selectedExercise.id;
  }

  const sucrose = exercises.find((exercise) => exercise.name?.toLowerCase() === 'sucrose');
  return sucrose?.id ?? exercises[0]?.id ?? null;
}
