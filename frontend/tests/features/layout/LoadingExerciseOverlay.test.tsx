import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { LoadingExerciseOverlay } from '../../../src/features/layout/LoadingExerciseOverlay';

describe('LoadingExerciseOverlay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show when loading is false', () => {
    render(<LoadingExerciseOverlay loading={false} />);

    expect(screen.queryByTestId('loading-exercise-overlay')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading exercise...')).not.toBeInTheDocument();
  });

  it('does not show immediately when loading becomes true', () => {
    vi.useFakeTimers();

    render(<LoadingExerciseOverlay loading={true} />);

    expect(screen.queryByTestId('loading-exercise-overlay')).not.toBeInTheDocument();
  });

  it('shows after the delay when loading stays true', () => {
    vi.useFakeTimers();

    render(<LoadingExerciseOverlay loading={true} />);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByTestId('loading-exercise-overlay')).toBeInTheDocument();
    expect(screen.getByText('Loading exercise...')).toBeInTheDocument();
  });

  it('does not show if loading finishes before the delay', () => {
    vi.useFakeTimers();

    const { rerender } = render(<LoadingExerciseOverlay loading={true} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender(<LoadingExerciseOverlay loading={false} />);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.queryByTestId('loading-exercise-overlay')).not.toBeInTheDocument();
  });

  it('hides again when loading becomes false', () => {
    vi.useFakeTimers();

    const { rerender } = render(<LoadingExerciseOverlay loading={true} />);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByTestId('loading-exercise-overlay')).toBeInTheDocument();

    rerender(<LoadingExerciseOverlay loading={false} />);

    expect(screen.queryByTestId('loading-exercise-overlay')).not.toBeInTheDocument();
  });
});