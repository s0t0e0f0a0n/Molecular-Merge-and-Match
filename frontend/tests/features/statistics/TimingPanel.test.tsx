import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseStatistics } from '../../../src/api/exercises';
import { ExerciseTimerDisplay } from '../../../src/features/statistics/TimingPanel';

const runningStatistics: ExerciseStatistics = {
  exercise_id: '1',
  incorrect_count: 0,
  cheats_used: '',
  fragments_drawn: 0,
  merges_done: 0,
  matches_done: 0,
  start_counting: '2026-11-06T14:00:00.000Z',
  stop_counting: null,
  timer_total: 12,
  started_at: '2026-11-06T14:00:00.000Z',
  completed_at: null,
  difficulty: '',
  SR_status: '',
};

describe('ExerciseTimerDisplay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates the displayed time once per second without updating its parent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T14:00:00.000Z'));

    const parentRender = vi.fn();
    function Parent() {
      parentRender();
      return <ExerciseTimerDisplay selectedExerciseStatistics={runningStatistics} />;
    }

    render(<Parent />);
    expect(screen.getByTestId('exercise-timer-display')).toHaveTextContent('0:12');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('exercise-timer-display')).toHaveTextContent('0:13');
    expect(parentRender).toHaveBeenCalledTimes(1);
  });
});
