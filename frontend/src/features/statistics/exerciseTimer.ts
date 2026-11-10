import type { ExerciseStatistics } from '../../api/exercises';

export function parseStatisticsTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isExerciseTimerRunning(statistics: ExerciseStatistics | null): boolean {
  return statistics !== null
    && parseStatisticsTimestamp(statistics.start_counting) !== null
    && parseStatisticsTimestamp(statistics.stop_counting) === null
    && parseStatisticsTimestamp(statistics.completed_at) === null;
}
