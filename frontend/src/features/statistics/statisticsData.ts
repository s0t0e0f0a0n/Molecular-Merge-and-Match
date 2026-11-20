import type { ExerciseSummary, StatisticsBehaviorEvent, StatisticsReviewDay } from '../../api/exercises';
import type { ApiLogbookState } from '../../api/logbook';
import { REVERSAL_ENTRY_KINDS, type ExerciseSession } from './metaCognitive';

export const CONTRIBUTION_STATUSES = [
  { color: 'green', label: 'Completed and correct' },
  { color: 'red', label: 'Attempted and incorrect' },
  { color: 'yellow', label: 'Completed with cheats' },
  { color: 'blue', label: 'Started but incomplete' },
  { color: 'grey', label: 'Examples or References set' },
  { color: 'white', label: 'Not attempted' },
] as const;

export const CONTRIBUTION_COLUMNS = 25;

export function exerciseUsedCheats(exercise: ExerciseSummary): boolean {
  const completedAt = parseExerciseDate(exercise.completed_at);
  const cheatsOffAt = parseExerciseDate(exercise.cheats_off);
  const completedSoonAfterDisabling = Boolean(
    completedAt
      && cheatsOffAt
      && completedAt.getTime() >= cheatsOffAt.getTime()
      && completedAt.getTime() - cheatsOffAt.getTime() <= 60_000,
  );
  return completedSoonAfterDisabling || (exercise.cheats_used?.startsWith('1') ?? false);
}

export function contributionStatus(exercise: ExerciseSummary): string {
  const exerciseSet = exercise.exercise_set?.trim().toLowerCase();
  if (exerciseSet === 'examples' || exerciseSet === 'references') return 'is-grey';
  if (!exercise.completed_at && (exercise.incorrect_count ?? 0) > 0) return 'is-red';
  if (exercise.completed_at) return exerciseUsedCheats(exercise) ? 'is-yellow' : 'is-green';
  if ((exercise.timer_total ?? 0) > 0 && !exercise.completed_at) return 'is-blue';
  return 'is-white';
}

export type TimelineStatus = 'is-black' | 'is-green' | 'is-yellow' | 'is-red' | 'is-blue';

export function isReviewedExercise(exercise: ExerciseSummary): boolean {
  const match = /^[A-Za-z](\d+)$/.exec(exercise.difficulty?.trim() ?? '');
  return Boolean(match && Number(match[1]) > 1 && !exerciseUsedCheats(exercise));
}

export type TimelineDay = {
  date: Date;
  counts: Record<TimelineStatus, number>;
};

export const TIMELINE_STATUSES: Array<{ key: TimelineStatus; label: string }> = [
  { key: 'is-black', label: 'Reviewed' },
  { key: 'is-green', label: 'Completed and correct' },
  { key: 'is-yellow', label: 'Completed with cheats' },
  { key: 'is-red', label: 'Attempted and incorrect' },
  { key: 'is-blue', label: 'Started but incomplete' },
];

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseExerciseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function buildTimeline(exerciseSummaries: ExerciseSummary[]): TimelineDay[] {
  const today = new Date();
  const dates = exerciseSummaries
    .map((exercise) => parseExerciseDate(exercise.completed_at ?? exercise.started_at))
    .filter((date): date is Date => date !== null);
  const oldestDate = dates.reduce(
    (oldest, date) => date < oldest ? date : oldest,
    addDays(today, -6),
  );
  const firstDate = new Date(oldestDate.getFullYear(), oldestDate.getMonth(), oldestDate.getDate());
  const lastDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days: TimelineDay[] = [];

  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    days.push({
      date,
      counts: { 'is-black': 0, 'is-green': 0, 'is-yellow': 0, 'is-red': 0, 'is-blue': 0 },
    });
  }

  const dayByKey = new Map(days.map((day) => [localDateKey(day.date), day]));
  exerciseSummaries.forEach((exercise) => {
    const date = parseExerciseDate(exercise.completed_at ?? exercise.started_at);
    const baseStatus = contributionStatus(exercise);
    const status = baseStatus !== 'is-grey' && isReviewedExercise(exercise) ? 'is-black' : baseStatus as TimelineStatus;
    const day = date && dayByKey.get(localDateKey(date));
    if (day && status in day.counts) day.counts[status] += 1;
  });
  return days;
}

export function formatTimelineDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function timelineTicks(maximumCount: number): number[] {
  if (maximumCount <= 1) return [1, 0];
  return [maximumCount, Math.ceil(maximumCount / 2), 0];
}

export const TIME_SCALE_STEP_SECONDS = 5 * 60;

export function timeScaleMaximum(maximumSeconds: number): number {
  return Math.max(
    TIME_SCALE_STEP_SECONDS,
    Math.ceil(maximumSeconds / TIME_SCALE_STEP_SECONDS) * TIME_SCALE_STEP_SECONDS,
  );
}

export function timeScaleTicks(maximumSeconds: number): number[] {
  return [maximumSeconds, maximumSeconds / 2, 0];
}

export type TimeDistributionBucket = {
  minute: number;
  easy: number;
  medium: number;
  difficult: number;
};

export type LogbookDistributionBucket = {
  createFragment: number;
  link: number;
  mergeFragments: number;
  dbe: number;
  rest: number;
  pause: number;
};

export const LOGBOOK_BIN_COUNT = 20;

export const LOGBOOK_REST_THRESHOLD_MS = 30_000;

export function parseLogbookTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = Math.abs(value) < 1e11 ? value * 1000 : value;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return Math.abs(numericValue) < 1e11 ? numericValue * 1000 : numericValue;
    }
    const parsedDate = Date.parse(value);
    return Number.isNaN(parsedDate) ? null : parsedDate;
  }
  return null;
}

export function parseLogbookRestarts(value: unknown): Array<{ start: number; stop: number }> {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((interval) => {
      if (typeof interval !== 'object' || interval === null) return [];
      const start = parseLogbookTimestamp((interval as { start?: unknown }).start);
      const stop = parseLogbookTimestamp((interval as { stop?: unknown }).stop);
      return start !== null && stop !== null && stop > start ? [{ start, stop }] : [];
    }).sort((left, right) => left.start - right.start);
  } catch {
    return [];
  }
}

export function parseLogbookPauseEvents(value: unknown): number[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseLogbookTimestamp)
      .filter((timestamp): timestamp is number => timestamp !== null);
  } catch {
    return [];
  }
}

export function exerciseLogbooks(
  logbooks: Record<string, ApiLogbookState[]>,
  exercise: ExerciseSummary,
): ApiLogbookState[] {
  return [...(logbooks[String(exercise.id)] ?? []), ...(logbooks[`exercise-${exercise.id}`] ?? [])];
}

export function buildLogbookDistribution(
  exerciseSummaries: ExerciseSummary[],
  logbooks: Record<string, ApiLogbookState[]>,
  onRest?: (exercise: ExerciseSummary, durationMs: number) => void,
): LogbookDistributionBucket[] {
  const buckets = Array.from({ length: LOGBOOK_BIN_COUNT }, () => ({
    createFragment: 0,
    link: 0,
    mergeFragments: 0,
    dbe: 0,
    rest: 0,
    pause: 0,
  }));
  const eventKinds = new Set(['create-fragment', 'link', 'merge-fragments', 'set-dbe']);

  exerciseSummaries.forEach((exercise) => {
    const startedAt = parseExerciseDate(exercise.started_at);
    const completedAt = parseExerciseDate(exercise.completed_at);
    const hasCurrentRange = Boolean(startedAt && completedAt && completedAt > startedAt);

    exerciseLogbooks(logbooks, exercise).forEach((logbook) => {
      const isArchived = Boolean(logbook.archived);
      // The active attempt counts once completed; archived attempts have their own timing.
      if (!isArchived && !hasCurrentRange) return;

      let entries: Array<{ kind?: string; ts?: unknown }> = [];
      try {
        const parsed = JSON.parse(logbook.entries_json) as unknown;
        if (Array.isArray(parsed)) entries = parsed.filter((entry): entry is { kind?: string; ts?: unknown } => typeof entry === 'object' && entry !== null);
      } catch {
        return;
      }

      const restarts = parseLogbookRestarts(logbook.restarts);
      const activeDuration = restarts.reduce((sum, interval) => sum + interval.stop - interval.start, 0);
      if (isArchived && !(restarts.length > 0 && activeDuration > 0)) return;
      const duration = hasCurrentRange ? completedAt!.getTime() - startedAt!.getTime() : 0;
      // Elapsed active time (ms) at a timestamp, or null when outside the attempt.
      const elapsedAt = (timestamp: number): number | null => {
        if (restarts.length > 0 && activeDuration > 0) {
          let elapsedBeforeInterval = 0;
          for (const interval of restarts) {
            if (timestamp >= interval.start && timestamp <= interval.stop) {
              return elapsedBeforeInterval + timestamp - interval.start;
            }
            elapsedBeforeInterval += interval.stop - interval.start;
          }
          return null;
        }
        if (timestamp >= startedAt!.getTime() && timestamp <= completedAt!.getTime()) return timestamp - startedAt!.getTime();
        return null;
      };
      const totalDuration = restarts.length > 0 && activeDuration > 0 ? activeDuration : duration;
      const addToBucket = (elapsed: number, kind: string) => {
        const bucket = buckets[Math.min(LOGBOOK_BIN_COUNT - 1, Math.floor((elapsed / totalDuration) * LOGBOOK_BIN_COUNT))];
        if (kind === 'create-fragment') bucket.createFragment += 1;
        if (kind === 'link') bucket.link += 1;
        if (kind === 'merge-fragments') bucket.mergeFragments += 1;
        if (kind === 'set-dbe') bucket.dbe += 1;
        if (kind === 'rest') bucket.rest += 1;
        if (kind === 'pause') bucket.pause += 1;
      };

      const activity: number[] = [];
      entries.forEach((entry) => {
        const timestamp = parseLogbookTimestamp(entry.ts);
        if (timestamp === null) return;
        const elapsed = elapsedAt(timestamp);
        if (elapsed === null) return;
        activity.push(elapsed);
        if (eventKinds.has(entry.kind ?? '')) addToBucket(elapsed, entry.kind ?? '');
      });

      parseLogbookPauseEvents(logbook.pause_events_json).forEach((timestamp) => {
        const elapsed = elapsedAt(timestamp);
        if (elapsed !== null) addToBucket(Math.min(elapsed, totalDuration - 1), 'pause');
      });

      // Each gap over 30 s between consecutive logbook entries is one rest, placed at the gap's midpoint.
      activity.sort((left, right) => left - right);
      for (let index = 1; index < activity.length; index += 1) {
        if (activity[index] - activity[index - 1] > LOGBOOK_REST_THRESHOLD_MS) {
          addToBucket((activity[index] + activity[index - 1]) / 2, 'rest');
          onRest?.(exercise, activity[index] - activity[index - 1]);
        }
      }
    });
  });

  return buckets;
}

export const DUE_LABEL_COUNT = 16;

export const DUE_MAX_BINS_PER_LABEL = 6;

export const DAY_MS = 24 * 60 * 60 * 1000;

export type DueBin = { startDay: number; size: number; count: number; labeled: boolean };

export function buildDueDistribution(exerciseSummaries: ExerciseSummary[], now: number): DueBin[] {
  const days: number[] = [];
  exerciseSummaries.forEach((exercise) => {
    const raw = exercise.due_time?.trim();
    if (!raw || Number(raw) === 0) return;
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp)) return;
    // Day 0 is the 24 hours starting now; day -1 is the 24 hours before that.
    days.push(Math.floor((timestamp - now) / DAY_MS));
  });
  const minDay = Math.min(0, ...days);
  const maxDay = Math.max(0, ...days);

  // Smallest whole-day label step whose 16 label slots cover the data, with day 0 on a label.
  let step = 1;
  while (Math.ceil(-minDay / step) + Math.ceil((maxDay + 1) / step) > DUE_LABEL_COUNT) step += 1;
  const negativeSlots = Math.ceil(-minDay / step);
  let size = 1;
  while (step % size !== 0 || step / size > DUE_MAX_BINS_PER_LABEL) size += 1;
  const binsPerLabel = step / size;
  const firstDay = -negativeSlots * step;

  const bins: DueBin[] = Array.from({ length: DUE_LABEL_COUNT * binsPerLabel }, (_, index) => ({
    startDay: firstDay + index * size,
    size,
    count: 0,
    labeled: index % binsPerLabel === 0,
  }));
  days.forEach((day) => {
    bins[Math.floor((day - firstDay) / size)].count += 1;
  });
  return bins;
}

export function dueBinClass(startDay: number): string {
  if (startDay < 0) return 'is-due';
  if (startDay <= 30) return 'is-upcoming';
  return 'is-deep';
}

export const SR_REVIEW_STATUSES = [
  { key: 'mature', label: 'Mature', color: '#22a447' },
  { key: 'young', label: 'Young', color: '#82c77c' },
  { key: 'relearning', label: 'Relearning', color: '#fb6b55' },
  { key: 'learning', label: 'Learning', color: '#fb923c' },
] as const;

export type SRChartDay = {
  date: Date;
  daysAgo: number;
  new: number;
  learning: number;
  relearning: number;
  young: number;
  mature: number;
  total: number;
  cumulativeTotal: number;
};

export function buildSRChartDays(
  history: StatisticsReviewDay[],
  rangeDays: number,
  today: Date,
): SRChartDay[] {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const countsByDate = new Map(history.map((day) => [day.date, day]));
  let cumulativeTotal = 0;

  return Array.from({ length: rangeDays + 1 }, (_, index) => {
    const daysAgo = rangeDays - index;
    const date = addDays(todayStart, -daysAgo);
    const counts = countsByDate.get(localDateKey(date));
    cumulativeTotal += counts?.total ?? 0;
    return {
      date,
      daysAgo,
      new: counts?.new ?? 0,
      learning: counts?.learning ?? 0,
      relearning: counts?.relearning ?? 0,
      young: counts?.young ?? 0,
      mature: counts?.mature ?? 0,
      total: counts?.total ?? 0,
      cumulativeTotal,
    };
  });
}

export function formatReviewCount(count: number): string {
  return new Intl.NumberFormat().format(count);
}

export const TIME_BIN_SECONDS = 30;

export const TIME_BIN_MAX = 120;

export const TIME_BIN_MIN = 20;

export function timeBinLabel(bin: number): string {
  if (bin === TIME_BIN_MAX) return '60+';
  return bin % 2 === 0 ? String(bin / 2) : '';
}

export function timeBinTitle(bin: number): string {
  if (bin === TIME_BIN_MAX) return '60+ minutes';
  const minutes = bin / 2;
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function exerciseTimeMinute(exercise: ExerciseSummary): number {
  const roundedHalfMinute = Math.round(Math.max(0, exercise.timer_total ?? 0) / TIME_BIN_SECONDS);
  return Math.min(TIME_BIN_MAX, Math.max(1, roundedHalfMinute));
}

export function exerciseDifficulty(exercise: ExerciseSummary): 'easy' | 'medium' | 'difficult' | null {
  const difficulty = exercise.difficulty?.trim().charAt(0).toUpperCase();
  if (difficulty === 'E') return 'easy';
  if (difficulty === 'M') return 'medium';
  if (difficulty === 'D') return 'difficult';
  return null;
}

export function buildTimeDistribution(exerciseSummaries: ExerciseSummary[]): TimeDistributionBucket[] {
  const completedExercises = exerciseSummaries.filter((exercise) => exercise.completed_at != null);
  const maximumMinute = Math.min(
    TIME_BIN_MAX,
    Math.max(TIME_BIN_MIN, ...completedExercises.map(exerciseTimeMinute)),
  );
  const buckets = Array.from({ length: maximumMinute }, (_, index) => ({
    minute: index + 1,
    easy: 0,
    medium: 0,
    difficult: 0,
  }));

  completedExercises.forEach((exercise) => {
    const difficulty = exerciseDifficulty(exercise);
    if (!difficulty) return;
    buckets[exerciseTimeMinute(exercise) - 1][difficulty] += 1;
  });
  return buckets;
}

export type RestDurationBucket = { bin: number; easy: number; medium: number; difficult: number };

export function buildRestDurationDistribution(
  exerciseSummaries: ExerciseSummary[],
  logbooks: Record<string, ApiLogbookState[]>,
): RestDurationBucket[] {
  const rests: Array<{ bin: number; difficulty: 'easy' | 'medium' | 'difficult' }> = [];
  buildLogbookDistribution(exerciseSummaries, logbooks, (exercise, durationMs) => {
    const difficulty = exerciseDifficulty(exercise);
    if (!difficulty) return;
    rests.push({ bin: Math.min(TIME_BIN_MAX, Math.max(1, Math.round(durationMs / (TIME_BIN_SECONDS * 1000)))), difficulty });
  });
  const binCount = Math.max(TIME_BIN_MIN, ...rests.map((rest) => rest.bin));
  const buckets = Array.from({ length: binCount }, (_, index) => ({ bin: index + 1, easy: 0, medium: 0, difficult: 0 }));
  rests.forEach((rest) => {
    buckets[rest.bin - 1][rest.difficulty] += 1;
  });
  return buckets;
}

export const DIFFICULTY_NUMBER = { easy: 1, medium: 2, difficult: 3 } as const;

export function buildExerciseSessions(
  exerciseSummaries: ExerciseSummary[],
  logbooks: Record<string, ApiLogbookState[]>,
  behaviorEvents: StatisticsBehaviorEvent[],
): ExerciseSession[] {
  const sessions: ExerciseSession[] = [];
  exerciseSummaries.forEach((exercise) => {
    const startedAt = parseExerciseDate(exercise.started_at);
    const completedAt = parseExerciseDate(exercise.completed_at);
    const difficulty = exerciseDifficulty(exercise);
    if (!startedAt || !completedAt || !difficulty || !exercise.has_statistics) return;
    const logbook = exerciseLogbooks(logbooks, exercise).find((candidate) => !candidate.archived);
    if (!logbook) return;

    const entryTimes: number[] = [];
    const reversalTimes: number[] = [];
    try {
      const parsed = JSON.parse(logbook.entries_json) as unknown;
      if (Array.isArray(parsed)) {
        parsed.forEach((entry) => {
          const timestamp = parseLogbookTimestamp((entry as { ts?: unknown } | null)?.ts);
          if (timestamp === null || timestamp < startedAt.getTime() || timestamp > completedAt.getTime()) return;
          entryTimes.push(timestamp);
          if (REVERSAL_ENTRY_KINDS.includes((entry as { kind?: string }).kind ?? '')) reversalTimes.push(timestamp);
        });
      }
    } catch {
      return;
    }
    if (entryTimes.length === 0) return;
    
    // Extract pause times within exercise window
    const pauseTimes = parseLogbookPauseEvents(logbook.pause_events_json)
      .filter((timestamp) => timestamp >= startedAt.getTime() && timestamp <= completedAt.getTime());
    
    const restartIntervals = parseLogbookRestarts(logbook.restarts);
    const restartMs = restartIntervals.reduce((sum, interval) => sum + interval.stop - interval.start, 0);
    const activeMs = restartMs > 0 ? restartMs : completedAt.getTime() - startedAt.getTime();

    const keys = new Set([String(exercise.id), `exercise-${exercise.id}`]);
    const attemptEvents = behaviorEvents.filter((event) => {
      if (!keys.has(event.exercise_id)) return false;
      const occurredAt = parseExerciseDate(event.occurred_at)?.getTime();
      return occurredAt !== undefined && occurredAt >= startedAt.getTime() && occurredAt <= completedAt.getTime();
    });
    const timesFor = (eventType: StatisticsBehaviorEvent['event_type']) => attemptEvents
      .filter((event) => event.event_type === eventType)
      .map((event) => parseExerciseDate(event.occurred_at)!.getTime());

    sessions.push({
      incorrectCount: exercise.incorrect_count ?? 0,
      confidence: exercise.confidence ?? 0,
      difficulty: DIFFICULTY_NUMBER[difficulty],
      cheatsUsed: exerciseUsedCheats(exercise),
      entryTimes,
      incorrectTimes: timesFor('incorrect-validation'),
      cheatActivationTimes: timesFor('cheat-activation'),
      exitTimes: timesFor('exercise-closed'),
      reversalTimes,
      pauseTimes,
      activeMs,
      completedAt: completedAt.getTime(),
    });
  });
  return sessions;
}

export const LAST_SESSIONS_WINDOW = 20;

export const TIME_OF_DAY_BIN_COUNT = 96;

export function buildTimeOfDayDistribution(
  exerciseSummaries: ExerciseSummary[],
  logbooks: Record<string, ApiLogbookState[]>,
): Array<{ easy: number; medium: number; difficult: number }> {
  const buckets = Array.from({ length: TIME_OF_DAY_BIN_COUNT }, () => ({ easy: 0, medium: 0, difficult: 0 }));
  exerciseSummaries.forEach((exercise) => {
    const difficulty = exerciseDifficulty(exercise);
    if (!difficulty) return;
    exerciseLogbooks(logbooks, exercise).forEach((logbook) => parseLogbookRestarts(logbook.restarts).forEach(({ start, stop }) => {
      let cursor = start;
      while (cursor < stop) {
        const date = new Date(cursor);
        const bin = Math.floor((date.getHours() * 60 + date.getMinutes()) / 15);
        const binEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, (bin + 1) * 15).getTime();
        const segmentEnd = Math.min(stop, binEnd);
        buckets[bin][difficulty] += (segmentEnd - cursor) / 1000;
        cursor = segmentEnd;
      }
    }));
  });
  return buckets;
}

export function formatTimeOfDayBin(index: number): string {
  const minutes = index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export type AverageTimeDay = {
  date: Date;
  averageSeconds: number;
  exerciseCount: number;
};

export function buildAverageTimeDays(exerciseSummaries: ExerciseSummary[]): AverageTimeDay[] {
  const timelineDays = buildTimeline(exerciseSummaries);
  const totalsByDate = new Map<string, { totalSeconds: number; exerciseCount: number }>();

  exerciseSummaries.forEach((exercise) => {
    const date = parseExerciseDate(exercise.completed_at ?? exercise.started_at);
    if (!date) return;

    const key = localDateKey(date);
    const current = totalsByDate.get(key) ?? { totalSeconds: 0, exerciseCount: 0 };
    current.totalSeconds += Math.max(0, exercise.timer_total ?? 0);
    current.exerciseCount += 1;
    totalsByDate.set(key, current);
  });

  return timelineDays.map(({ date }) => {
    const totals = totalsByDate.get(localDateKey(date));
    return {
      date,
      averageSeconds: totals ? totals.totalSeconds / totals.exerciseCount : 0,
      exerciseCount: totals?.exerciseCount ?? 0,
    };
  });
}

export function formatDuration(seconds: number | null | undefined): string {
  const totalSeconds = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

export const LEVEL_COUNT = 6;

export const LEVEL_MIN_POINTS = 3;

export type LevelPoint = { id: number; name: string; seconds: number; difficulty: 'easy' | 'medium' | 'difficult' };

export const LEVEL_DOT_COLORS = { easy: '#22c55e', medium: '#3b82f6', difficult: '#ef4444' } as const;

export function buildLevelPoints(exerciseSummaries: ExerciseSummary[]): LevelPoint[][] {
  const levels: LevelPoint[][] = Array.from({ length: LEVEL_COUNT }, () => []);
  exerciseSummaries.forEach((exercise) => {
    const difficulty = exerciseDifficulty(exercise);
    if (!difficulty || exercise.timer_total == null) return;
    const tags = [...(exercise.tags ?? []), ...(exercise.statistics_tags ?? [])];
    const matched = new Set<number>();
    tags.forEach((tag) => {
      const match = /^level\s*(\d+)$/i.exec(tag.trim());
      if (match && Number(match[1]) < LEVEL_COUNT) matched.add(Number(match[1]));
    });
    matched.forEach((level) => levels[level].push({
      id: exercise.id,
      name: exercise.name ?? `Exercise ${exercise.id}`,
      seconds: Math.max(0, exercise.timer_total ?? 0),
      difficulty,
    }));
  });
  return levels;
}
