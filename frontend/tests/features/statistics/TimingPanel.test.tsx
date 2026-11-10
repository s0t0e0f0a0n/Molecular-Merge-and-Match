import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseStatistics } from '../../../src/api/exercises';
import { ExerciseTimerDisplay, PauseExerciseButton, StopExerciseButton } from '../../../src/features/statistics/TimingPanel';

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

  it('renders a centered square stop icon with the same button styling as pause', () => {
    render(
      <>
        <PauseExerciseButton onPause={() => {}} disabled={false} title="Pause exercise" />
        <StopExerciseButton onStop={() => {}} disabled={false} title="Stop exercise" />
      </>,
    );
    const pause = screen.getByTestId('pause-exercise-button');
    const stop = screen.getByTestId('stop-exercise-button');
    expect(stop.getAttribute('style')).toBe(pause.getAttribute('style'));
    const square = stop.querySelector('svg rect');
    expect(square).toHaveAttribute('x', '3');
    expect(square).toHaveAttribute('y', '3');
    expect(square).toHaveAttribute('width', '8');
    expect(square).toHaveAttribute('height', '8');
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
