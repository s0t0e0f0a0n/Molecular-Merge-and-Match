import type { ExerciseSummary } from '../../api/exercises';

function hasCompletionTimestamp(value: string | null | undefined): boolean {
  const timestamp = value?.trim();
  return Boolean(timestamp && timestamp !== '0');
}

export function getSpacedRepetitionQueue(
  exerciseSummaries: ExerciseSummary[],
  now = Date.now(),
): ExerciseSummary[] {
  const reviews: ExerciseSummary[] = [];
  const newExercises: ExerciseSummary[] = [];

  for (const exercise of exerciseSummaries) {
    if (
      (exercise.in_SR ?? 0) <= 0
      || exercise.completed === true
      || hasCompletionTimestamp(exercise.completed_at)
    ) continue;

    const dueTime = exercise.due_time?.trim();
    if (!dueTime) {
      newExercises.push(exercise);
      continue;
    }
    if (Number(dueTime) === 0) continue;
    const dueTimestamp = Date.parse(dueTime);
    if (Number.isFinite(dueTimestamp) && dueTimestamp < now) {
      reviews.push(exercise);
    }
  }

  reviews.sort((a, b) => {
    const dueTimeOrder = Date.parse(a.due_time ?? '') - Date.parse(b.due_time ?? '');
    return dueTimeOrder || a.id - b.id;
  });
  newExercises.sort((a, b) => (a.in_SR ?? 0) - (b.in_SR ?? 0) || a.id - b.id);

  const ordered: ExerciseSummary[] = [];
  let reviewIndex = 0;
  let newIndex = 0;
  while (reviewIndex < reviews.length && newIndex < newExercises.length) {
    ordered.push(...reviews.slice(reviewIndex, reviewIndex + 2));
    reviewIndex += 2;
    ordered.push(newExercises[newIndex]);
    newIndex += 1;
  }
  ordered.push(...reviews.slice(reviewIndex), ...newExercises.slice(newIndex));
  return ordered;
}
