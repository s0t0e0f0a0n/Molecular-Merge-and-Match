import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteExercise } from '../../src/api/exercises';
import { resetExercises } from '../../src/api/reset';

vi.mock('../../src/api/exercises', () => ({
  deleteExercise: vi.fn(),
}));

describe('resetExercises', () => {
  afterEach(() => vi.clearAllMocks());

  it('starts all exercise deletions concurrently and reports any failure', async () => {
    let resolveFirst!: () => void;
    let rejectSecond!: (error: Error) => void;
    vi.mocked(deleteExercise)
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSecond = reject; }));

    const operation = resetExercises([1, 2], 'exercise');
    let settled = false;
    void operation.finally(() => { settled = true; }).catch(() => {});

    expect(vi.mocked(deleteExercise).mock.calls.map(([id]) => id)).toEqual([1, 2]);

    resolveFirst();
    await Promise.resolve();
    expect(settled).toBe(false);

    rejectSecond(new Error('delete failed'));
    await expect(operation).rejects.toThrow('Failed to delete one or more exercises');
  });
});
