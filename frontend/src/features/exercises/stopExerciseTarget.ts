import type { ExerciseSummary } from '../../api/exercises';

export function getStopExerciseTarget(exercises: ExerciseSummary[]): ExerciseSummary | undefined {
  const examples = exercises.filter((exercise) => exercise.exercise_set?.trim().toLowerCase() === 'examples');
  const references = exercises.filter((exercise) => exercise.exercise_set?.trim().toLowerCase() === 'references');

  return [...examples, ...references].find((exercise) => exercise.name?.trim().toLowerCase() === 'sucrose')
    ?? examples[0]
    ?? references[0];
}
