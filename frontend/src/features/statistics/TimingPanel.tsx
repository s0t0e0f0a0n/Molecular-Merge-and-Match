import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  pauseExerciseTimer,
  resumeExerciseTimer,
  type ExerciseStatistics,
} from '../../api/exercises';

function parseStatisticsTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

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
  selectedExerciseStatistics: ExerciseStatistics | null;
  setSelectedExerciseStatistics: (statistics: ExerciseStatistics | null) => void;
};

type UseExerciseTimingStateResult = {
  exercisePaused: boolean;
  pausingExercise: boolean;
  resumingExercise: boolean;
  formattedDisplayedTimer: string;
  handlePauseExercise: () => Promise<void>;
  handleResumeExercise: () => Promise<void>;
  pauseButtonDisabled: boolean;
  pauseButtonTitle: string;
};

export function useExerciseTimingState({
  selectedExerciseId,
  isExerciseCompleted,
  selectedExerciseStatistics,
  setSelectedExerciseStatistics,
}: UseExerciseTimingStateOptions): UseExerciseTimingStateResult {
  const [exercisePaused, setExercisePaused] = useState(false);
  const [pausingExercise, setPausingExercise] = useState(false);
  const [resumingExercise, setResumingExercise] = useState(false);
  const [timerNow, setTimerNow] = useState(() => Date.now());

  useEffect(() => {
    setExercisePaused(false);
    setPausingExercise(false);
    setResumingExercise(false);
    setTimerNow(Date.now());
  }, [selectedExerciseId]);

  useEffect(() => {
    const startCountingMs = parseStatisticsTimestamp(selectedExerciseStatistics?.start_counting);
    const stopCountingMs = parseStatisticsTimestamp(selectedExerciseStatistics?.stop_counting);
    const completedAtMs = parseStatisticsTimestamp(selectedExerciseStatistics?.completed_at);

    if (startCountingMs === null || stopCountingMs !== null || completedAtMs !== null) {
      return;
    }

    setTimerNow(Date.now());

    const intervalId = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [
    selectedExerciseStatistics?.completed_at,
    selectedExerciseStatistics?.start_counting,
    selectedExerciseStatistics?.stop_counting,
  ]);

  const displayedTimerTotalSeconds = useMemo(() => {
    if (!selectedExerciseStatistics) {
      return 0;
    }

    const startCountingMs = parseStatisticsTimestamp(selectedExerciseStatistics.start_counting);
    const stopCountingMs = parseStatisticsTimestamp(selectedExerciseStatistics.stop_counting);
    const completedAtMs = parseStatisticsTimestamp(selectedExerciseStatistics.completed_at);
    let totalSeconds = selectedExerciseStatistics.timer_total ?? 0;

    if (startCountingMs !== null && stopCountingMs === null && completedAtMs === null) {
      totalSeconds += Math.max(0, Math.floor((timerNow - startCountingMs) / 1000));
    }

    return totalSeconds;
  }, [selectedExerciseStatistics, timerNow]);

  const formattedDisplayedTimer = useMemo(
    () => formatElapsedTime(displayedTimerTotalSeconds),
    [displayedTimerTotalSeconds],
  );

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
    formattedDisplayedTimer,
    handlePauseExercise,
    handleResumeExercise,
    pauseButtonDisabled,
    pauseButtonTitle,
  };
}

type ExerciseTimerDisplayProps = {
  formattedDisplayedTimer: string;
};

export function ExerciseTimerDisplay({ formattedDisplayedTimer }: ExerciseTimerDisplayProps) {
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

export function PauseExerciseButton({ onPause, disabled, title }: PauseExerciseButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onPause}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      title={title}
      data-testid="pause-exercise-button"
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
    </button>
  );
}

type TimingPanelProps = {
  formattedDisplayedTimer: string;
  onPause: () => void;
  pauseButtonDisabled: boolean;
  pauseButtonTitle: string;
};

export function TimingPanel({
  formattedDisplayedTimer,
  onPause,
  pauseButtonDisabled,
  pauseButtonTitle,
}: TimingPanelProps) {
  return (
    <>
      <ExerciseTimerDisplay formattedDisplayedTimer={formattedDisplayedTimer} />
      <PauseExerciseButton
        onPause={onPause}
        disabled={pauseButtonDisabled}
        title={pauseButtonTitle}
      />
    </>
  );
}
