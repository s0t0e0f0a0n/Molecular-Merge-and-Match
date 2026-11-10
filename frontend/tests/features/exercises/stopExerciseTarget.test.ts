import { describe, expect, it } from 'vitest';
import type { ExerciseSummary } from '../../../src/api/exercises';
import { getStopExerciseTarget } from '../../../src/features/exercises/stopExerciseTarget';

const exercise = (id: number, name: string, exercise_set: string): ExerciseSummary => ({
  id, name, exercise_set, tags: [],
});

describe('getStopExerciseTarget', () => {
  it('prefers Sucrose in the example or reference sets regardless of ID and case', () => {
    const sucrose = exercise(42, ' Sucrose ', ' Examples ');
    expect(getStopExerciseTarget([
      exercise(1, 'Sucrose', 'Other'),
      exercise(2, 'Water', 'References'),
      exercise(3, 'Example', 'Examples'),
      sucrose,
    ])).toBe(sucrose);
  });

  it('falls back to an example, then a reference, and reports when neither exists', () => {
    const example = exercise(2, 'Example', 'EXAMPLES');
    const reference = exercise(3, 'Reference', 'references');
    expect(getStopExerciseTarget([reference, example])).toBe(example);
    expect(getStopExerciseTarget([reference])).toBe(reference);
    expect(getStopExerciseTarget([exercise(1, 'Other', 'Other')])).toBeUndefined();
  });
});
