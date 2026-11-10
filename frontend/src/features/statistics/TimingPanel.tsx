import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  pauseExerciseTimer,
  resumeExerciseTimer,
  type ExerciseStatistics,
} from '../../api/exercises';
import { isExerciseTimerRunning, parseStatisticsTimestamp } from './exerciseTimer';

function formatElapsedTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type UseExerciseTimingStateOptions = {
  selectedExerciseId: number | null;
  isExerciseCompleted: boolean;
  setSelectedExerciseStatistics: (statistics: ExerciseStatistics | null) => void;
};

type UseExerciseTimingStateResult = {
  exercisePaused: boolean;
  pausingExercise: boolean;
  resumingExercise: boolean;
  handlePauseExercise: () => Promise<void>;
  handleResumeExercise: () => Promise<void>;
  pauseButtonDisabled: boolean;
  pauseButtonTitle: string;
};

export function useExerciseTimingState({
  selectedExerciseId,
  isExerciseCompleted,
  setSelectedExerciseStatistics,
}: UseExerciseTimingStateOptions): UseExerciseTimingStateResult {
  const [exercisePaused, setExercisePaused] = useState(false);
  const [pausingExercise, setPausingExercise] = useState(false);
  const [resumingExercise, setResumingExercise] = useState(false);

  useEffect(() => {
    setExercisePaused(false);
    setPausingExercise(false);
    setResumingExercise(false);
  }, [selectedExerciseId]);

  const handlePauseExercise = useCallback(async () => {
    if (selectedExerciseId === null) return;
    if (exercisePaused || pausingExercise || resumingExercise) return;

    if (isExerciseCompleted) {
      setExercisePaused(true);
      return;
    }

    setPausingExercise(true);
    try {
      const statistics = await pauseExerciseTimer(selectedExerciseId);
      setSelectedExerciseStatistics(statistics);
      setExercisePaused(true);
    } catch (error) {
      console.error('pause failed', error);
    } finally {
      setPausingExercise(false);
    }
  }, [
    exercisePaused,
    isExerciseCompleted,
    pausingExercise,
    resumingExercise,
    selectedExerciseId,
    setSelectedExerciseStatistics,
  ]);

  const handleResumeExercise = useCallback(async () => {
    if (selectedExerciseId === null) return;

    if (isExerciseCompleted) {
      setExercisePaused(false);
      return;
    }

    if (!exercisePaused || resumingExercise) return;

    setResumingExercise(true);
    try {
      const statistics = await resumeExerciseTimer(selectedExerciseId);
      setSelectedExerciseStatistics(statistics);
      window.dispatchEvent(new CustomEvent('exercise-statistics-updated', {
        detail: { exerciseId: selectedExerciseId },
      }));
      setExercisePaused(false);
    } catch (error) {
      console.error('resume failed', error);
    } finally {
      setResumingExercise(false);
    }
  }, [
    exercisePaused,
    isExerciseCompleted,
    resumingExercise,
    selectedExerciseId,
    setSelectedExerciseStatistics,
  ]);

  const pauseButtonDisabled =
    selectedExerciseId === null ||
    exercisePaused ||
    pausingExercise ||
    resumingExercise;

  const pauseButtonTitle = exercisePaused
    ? 'Exercise is paused'
    : isExerciseCompleted
      ? 'Pause view'
      : 'Pause exercise';

  return {
    exercisePaused,
    pausingExercise,
    resumingExercise,
    handlePauseExercise,
    handleResumeExercise,
    pauseButtonDisabled,
    pauseButtonTitle,
  };
}

type ExerciseTimerDisplayProps = {
  selectedExerciseStatistics: ExerciseStatistics | null;
};

export function ExerciseTimerDisplay({ selectedExerciseStatistics }: ExerciseTimerDisplayProps) {
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const timerRunning = isExerciseTimerRunning(selectedExerciseStatistics);

  useEffect(() => {
    setTimerNow(Date.now());
    if (!timerRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [
    timerRunning,
    selectedExerciseStatistics?.completed_at,
    selectedExerciseStatistics?.start_counting,
    selectedExerciseStatistics?.stop_counting,
  ]);

  const formattedDisplayedTimer = useMemo(() => {
    if (!selectedExerciseStatistics) {
      return formatElapsedTime(0);
    }

    const startCountingMs = parseStatisticsTimestamp(selectedExerciseStatistics.start_counting);
    const stopCountingMs = parseStatisticsTimestamp(selectedExerciseStatistics.stop_counting);
    const completedAtMs = parseStatisticsTimestamp(selectedExerciseStatistics.completed_at);
    let totalSeconds = selectedExerciseStatistics.timer_total ?? 0;

    if (startCountingMs !== null && stopCountingMs === null && completedAtMs === null) {
      totalSeconds += Math.max(0, Math.floor((timerNow - startCountingMs) / 1000));
    }

    return formatElapsedTime(totalSeconds);
  }, [selectedExerciseStatistics, timerNow]);

  return (
    <span
      data-testid="exercise-timer-display"
      title="Total time spent on this exercise"
      style={{
        minWidth: 44,
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 14,
        color: '#222',
      }}
    >
      {formattedDisplayedTimer}
    </span>
  );
}

type PauseExerciseButtonProps = {
  onPause: () => void;
  disabled: boolean;
  title: string;
};

type TimerControlButtonProps = {
  onClick: () => void;
  disabled: boolean;
  title: string;
  testId: string;
  children: ReactNode;
};

function TimerControlButton({ onClick, disabled, title, testId, children }: TimerControlButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      title={title}
      data-testid={testId}
      style={{
        width: 28,
        height: 28,
        padding: 0,
        borderRadius: 6,
        border: '1px solid #ccc',
        background: hovered ? '#ff6b6b' : 'white',
        color: hovered ? '#fff' : '#111',
        cursor: 'pointer',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

export function PauseExerciseButton({ onPause, disabled, title }: PauseExerciseButtonProps) {
  return (
    <TimerControlButton onClick={onPause} disabled={disabled} title={title} testId="pause-exercise-button">
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="currentColor"
      >
        <rect x="3" y="2" width="3" height="10" rx="1" />
        <rect x="8" y="2" width="3" height="10" rx="1" />
      </svg>
    </TimerControlButton>
  );
}

type StopExerciseButtonProps = {
  onStop: () => void;
  disabled: boolean;
  title: string;
};

export function StopExerciseButton({ onStop, disabled, title }: StopExerciseButtonProps) {
  return (
    <TimerControlButton onClick={onStop} disabled={disabled} title={title} testId="stop-exercise-button">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <rect x="3" y="3" width="8" height="8" rx="1" />
      </svg>
    </TimerControlButton>
  );
}

type TimingPanelProps = {
  selectedExerciseStatistics: ExerciseStatistics | null;
  onPause: () => void;
  pauseButtonDisabled: boolean;
  pauseButtonTitle: string;
};

export function TimingPanel({
  selectedExerciseStatistics,
  onPause,
  pauseButtonDisabled,
  pauseButtonTitle,
}: TimingPanelProps) {
  return (
    <>
      <ExerciseTimerDisplay selectedExerciseStatistics={selectedExerciseStatistics} />
      <PauseExerciseButton
        onPause={onPause}
        disabled={pauseButtonDisabled}
        title={pauseButtonTitle}
      />
    </>
  );
}
