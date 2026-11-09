import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchStatisticsBehaviorEvents,
  fetchStatisticsReviewHistory,
  type ExerciseSummary,
  type StatisticsReviewDay,
  type StatisticsBehaviorEvent,
} from '../../api/exercises';
import { fetchLogbookHistory, type ApiLogbookState } from '../../api/logbook';
import { RadarChart } from './RadarChart';
import {
  generateGlobalProfile,
  generateStudyStyleProfile,
  MIN_STYLE_SESSIONS,
  REVERSAL_ENTRY_KINDS,
  selectSessions,
  type ExerciseSession,
} from './metaCognitive';
import { resetDueExercises, resetExercises, type ResetLevel } from '../../api/reset';
import { fetchTags, type Tag } from '../../api/tags';
import '../../panelStyles.css';

type StatisticsTabId = 'overview' | 'progression' | 'behaviour' | 'time' | 'levels' | 'mastery' | 'spaced' | 'reset';

type StatisticsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  exerciseSummaries: ExerciseSummary[];
  selectedExerciseId: number | null;
  enableDelete?: boolean;
  deleteProgression?: boolean;
  showCheatTags?: boolean;
};
// Tab order: overview, progression, behaviour, time, levels, mastery, spaced, reset
const TABS: Array<{ id: StatisticsTabId; label: React.ReactNode }> = [
  { id: 'overview', label: 'Exercise overview' },
  { id: 'progression', label: 'Progression' },
  { id: 'behaviour', label: 'Study behaviour' },
  { id: 'time', label: 'Time distribution' },
  { id: 'levels', label: 'Level analysis' },
  { id: 'mastery', label: 'Mastery List' },
  { id: 'spaced', label: 'Spaced repetition' },
  { id: 'reset', label: 'Reset' },
];

const CONTRIBUTION_STATUSES = [
  { color: 'green', label: 'Completed and correct' },
  { color: 'red', label: 'Attempted and incorrect' },
  { color: 'yellow', label: 'Completed with cheats' },
  { color: 'blue', label: 'Started but incomplete' },
  { color: 'grey', label: 'Examples or References set' },
  { color: 'white', label: 'Not attempted' },
] as const;

const CONTRIBUTION_COLUMNS = 25;

function exerciseUsedCheats(exercise: ExerciseSummary): boolean {
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

function contributionStatus(exercise: ExerciseSummary): string {
  const exerciseSet = exercise.exercise_set?.trim().toLowerCase();
  if (exerciseSet === 'examples' || exerciseSet === 'references') return 'is-grey';
  if (!exercise.completed_at && (exercise.incorrect_count ?? 0) > 0) return 'is-red';
  if (exercise.completed_at) return exerciseUsedCheats(exercise) ? 'is-yellow' : 'is-green';
  if ((exercise.timer_total ?? 0) > 0 && !exercise.completed_at) return 'is-blue';
  return 'is-white';
}

type TimelineStatus = 'is-black' | 'is-green' | 'is-yellow' | 'is-red' | 'is-blue';

function isReviewedExercise(exercise: ExerciseSummary): boolean {
  const match = /^[A-Za-z](\d+)$/.exec(exercise.difficulty?.trim() ?? '');
  return Boolean(match && Number(match[1]) > 1 && !exerciseUsedCheats(exercise));
}

type TimelineDay = {
  date: Date;
  counts: Record<TimelineStatus, number>;
};

const TIMELINE_STATUSES: Array<{ key: TimelineStatus; label: string }> = [
  { key: 'is-black', label: 'Reviewed' },
  { key: 'is-green', label: 'Completed and correct' },
  { key: 'is-yellow', label: 'Completed with cheats' },
  { key: 'is-red', label: 'Attempted and incorrect' },
  { key: 'is-blue', label: 'Started but incomplete' },
];

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseExerciseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function buildTimeline(exerciseSummaries: ExerciseSummary[]): TimelineDay[] {
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

function formatTimelineDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function timelineTicks(maximumCount: number): number[] {
  if (maximumCount <= 1) return [1, 0];
  return [maximumCount, Math.ceil(maximumCount / 2), 0];
}

const TIME_SCALE_STEP_SECONDS = 5 * 60;

function timeScaleMaximum(maximumSeconds: number): number {
  return Math.max(
    TIME_SCALE_STEP_SECONDS,
    Math.ceil(maximumSeconds / TIME_SCALE_STEP_SECONDS) * TIME_SCALE_STEP_SECONDS,
  );
}

function timeScaleTicks(maximumSeconds: number): number[] {
  return [maximumSeconds, maximumSeconds / 2, 0];
}

function StatisticsTimeline({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const days = buildTimeline(exerciseSummaries);
  const maximumCount = Math.max(1, ...days.map((day) => Object.values(day.counts).reduce((sum, count) => sum + count, 0)));
  const ticks = timelineTicks(maximumCount);
  const averageTimeDays = buildAverageTimeDays(exerciseSummaries);
  const maximumAverage = timeScaleMaximum(Math.max(0, ...averageTimeDays.map((day) => day.averageSeconds)));
  const averageTimeTicks = timeScaleTicks(maximumAverage);
  const averageTimeLinePoints = averageTimeDays
    .map((day, index) => `${index + 0.5},${100 - (day.averageSeconds / maximumAverage) * 100}`)
    .join(' ');

  return (
    <section className="statistics-timeline-section" aria-label="Daily statistics timeline">
      <div className="statistics-timeline-heading">
        <h3>Activity over time</h3>
        <div className="statistics-timeline-legend" aria-label="Timeline legend">
          {TIMELINE_STATUSES.map((status) => (
            <span key={status.key} className="statistics-timeline-legend-item">
              <span className={`statistics-contribution-swatch statistics-contribution-status ${status.key}`} aria-hidden="true" />
              {status.label}
            </span>
          ))}
          <span className="statistics-timeline-legend-item">
            <span className="statistics-average-time-legend-line" aria-hidden="true" />
            Average time per exercise
          </span>
        </div>
      </div>
      <div className="statistics-timeline-chart">
        <div className="statistics-timeline-axis-title">Number of exercises</div>
        <div className="statistics-timeline-right-axis-title">Average time</div>
        <div className="statistics-timeline-axis" aria-label="Number of exercises">
          {ticks.map((tick) => (
            <span key={tick} className="statistics-timeline-axis-label" style={{ bottom: `${(tick / maximumCount) * 100}%` }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="statistics-timeline-viewport">
          <div className="statistics-timeline-plot">
            <div className="statistics-timeline-guides" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / maximumCount) * 100}%` }} />
              ))}
            </div>
            <div className="statistics-timeline" style={{ '--timeline-days': days.length } as React.CSSProperties}>
              <svg
                className="statistics-average-time-line"
                viewBox={`0 0 ${days.length} 100`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline points={averageTimeLinePoints} />
              </svg>
              {days.map((day) => {
                const total = Object.values(day.counts).reduce((sum, count) => sum + count, 0);
                const averageTimeDay = averageTimeDays.find((candidate) => localDateKey(candidate.date) === localDateKey(day.date));
                return (
                  <div key={localDateKey(day.date)} className="statistics-timeline-day" title={`${formatTimelineDate(day.date)}: ${total} exercise${total === 1 ? '' : 's'}`}>
                    <div className="statistics-timeline-bar" aria-label={`${formatTimelineDate(day.date)}: ${total} exercises`}>
                      {TIMELINE_STATUSES.map((status) => (
                        <span
                          key={status.key}
                          className={`statistics-timeline-segment ${status.key}`}
                          style={{ height: `${(day.counts[status.key] / maximumCount) * 100}%` }}
                        />
                      ))}
                    </div>
                    {averageTimeDay ? (
                      <span
                        className="statistics-average-time-point"
                        style={{ '--average-time-position': averageTimeDay.averageSeconds / maximumAverage } as React.CSSProperties}
                        title={`${formatDuration(Math.round(averageTimeDay.averageSeconds))} average time`}
                        aria-label={`${formatTimelineDate(day.date)}: ${formatDuration(Math.round(averageTimeDay.averageSeconds))} average time`}
                      />
                    ) : null}
                    <span className="statistics-timeline-date">{formatTimelineDate(day.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="statistics-timeline-right-axis" aria-label="Average time per exercise">
          {averageTimeTicks.map((tick) => (
            <span
              key={tick}
              className="statistics-timeline-axis-label"
              style={{ '--average-time-position': tick / maximumAverage } as React.CSSProperties}
            >
              {formatDuration(tick)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

type TimeDistributionBucket = {
  minute: number;
  easy: number;
  medium: number;
  difficult: number;
};

type LogbookDistributionBucket = {
  createFragment: number;
  link: number;
  mergeFragments: number;
  dbe: number;
  rest: number;
  pause: number;
};

const LOGBOOK_BIN_COUNT = 20;
const LOGBOOK_REST_THRESHOLD_MS = 30_000;

function parseLogbookTimestamp(value: unknown): number | null {
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

function parseLogbookRestarts(value: unknown): Array<{ start: number; stop: number }> {
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

function parseLogbookPauseEvents(value: unknown): number[] {
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

function exerciseLogbooks(
  logbooks: Record<string, ApiLogbookState[]>,
  exercise: ExerciseSummary,
): ApiLogbookState[] {
  return [...(logbooks[String(exercise.id)] ?? []), ...(logbooks[`exercise-${exercise.id}`] ?? [])];
}

function buildLogbookDistribution(
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

function LogbookDistributionGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const [logbooks, setLogbooks] = useState<Record<string, ApiLogbookState[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    fetchLogbookHistory()
      .then((data) => {
        if (isCurrent) setLogbooks(data);
      })
      .catch(() => {
        if (isCurrent) setLogbooks({});
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [exerciseSummaries]);

  if (isLoading) return <p>Loading logbook statistics...</p>;

  const buckets = buildLogbookDistribution(exerciseSummaries, logbooks);
  const maximumCount = Math.max(
    1,
    ...buckets.map((bucket) => bucket.createFragment + bucket.link + bucket.mergeFragments + bucket.dbe + bucket.rest + bucket.pause),
  );
  const ticks = timelineTicks(maximumCount);

  return (
    <section className="statistics-timeline-section" aria-label="Logbook events over exercise duration">
      <div className="statistics-timeline-heading">
        <h3>Logbook events during completed exercises</h3>
        <div className="statistics-timeline-legend" aria-label="Logbook event legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-create" aria-hidden="true" />Create fragment</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-link" aria-hidden="true" />Link</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-merge" aria-hidden="true" />Merge fragments</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-dbe" aria-hidden="true" />Set DBE</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-rest" aria-hidden="true" />Rests (&gt;30 s)</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-pause" aria-hidden="true" />Pause</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-of-day-chart">
        <div className="statistics-timeline-axis-title">Number of events</div>
        <div className="statistics-timeline-axis" aria-label="Number of logbook events">
          {ticks.map((tick) => (
            <span key={tick} className="statistics-timeline-axis-label" style={{ bottom: `${(tick / maximumCount) * 100}%` }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="statistics-timeline-viewport">
          <div className="statistics-timeline-plot">
            <div className="statistics-timeline-guides" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / maximumCount) * 100}%` }} />
              ))}
            </div>
            <div className="statistics-time-of-day-distribution statistics-spaced-bins" style={{ '--timeline-days': buckets.length } as React.CSSProperties}>
              {buckets.map((bucket, index) => {
                const total = bucket.createFragment + bucket.link + bucket.mergeFragments + bucket.dbe + bucket.rest + bucket.pause;
                return (
                  <div key={index} className="statistics-time-of-day-bin" title={`${index * 5}-${(index + 1) * 5}%: ${total} event${total === 1 ? '' : 's'}`}>
                    <div className="statistics-timeline-bar" aria-label={`${index * 5}-${(index + 1) * 5}%: ${total} events`}>
                      <span className="statistics-timeline-segment statistics-logbook-create" style={{ height: `${(bucket.createFragment / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-link" style={{ height: `${(bucket.link / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-merge" style={{ height: `${(bucket.mergeFragments / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-dbe" style={{ height: `${(bucket.dbe / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-rest" style={{ height: `${(bucket.rest / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-pause" style={{ height: `${(bucket.pause / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-time-distribution-label">{index % 5 === 0 ? `${index * 5}%` : ''}</span>
                  </div>
                );
              })}
              <span className="statistics-time-of-day-end-label">100%</span>
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">normalized time</div>
    </section>
  );
}

const DUE_LABEL_COUNT = 16;
const DUE_MAX_BINS_PER_LABEL = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

type DueBin = { startDay: number; size: number; count: number; labeled: boolean };

function buildDueDistribution(exerciseSummaries: ExerciseSummary[], now: number): DueBin[] {
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

function dueBinClass(startDay: number): string {
  if (startDay < 0) return 'is-due';
  if (startDay <= 30) return 'is-upcoming';
  return 'is-deep';
}

function DueDistributionGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const bins = buildDueDistribution(exerciseSummaries, Date.now());
  const maximumCount = Math.max(1, ...bins.map((bin) => bin.count));
  const ticks = timelineTicks(maximumCount);

  return (
    <section className="statistics-timeline-section" aria-label="Exercises by due date">
      <div className="statistics-timeline-heading">
        <h3>Exercises by due date</h3>
        <div className="statistics-timeline-legend" aria-label="Due date legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Due for review</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Upcoming reviews</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-black" aria-hidden="true" />In deep knowledge</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-of-day-chart">
        <div className="statistics-timeline-axis-title">Number of exercises</div>
        <div className="statistics-timeline-axis" aria-label="Number of exercises">
          {ticks.map((tick) => (
            <span key={tick} className="statistics-timeline-axis-label" style={{ bottom: `${(tick / maximumCount) * 100}%` }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="statistics-timeline-viewport">
          <div className="statistics-timeline-plot">
            <div className="statistics-timeline-guides" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / maximumCount) * 100}%` }} />
              ))}
            </div>
            <div className="statistics-time-of-day-distribution" style={{ '--timeline-days': bins.length } as React.CSSProperties}>
              {bins.map((bin) => {
                const endDay = bin.startDay + bin.size - 1;
                const range = bin.size === 1 ? `Day ${bin.startDay}` : `Days ${bin.startDay} to ${endDay}`;
                const showLabel = bin.labeled;
                return (
                  <div key={bin.startDay} className="statistics-time-of-day-bin" title={`${range}: ${bin.count} exercise${bin.count === 1 ? '' : 's'}`}>
                    <div className="statistics-timeline-bar" aria-label={`${range}: ${bin.count} exercises`}>
                      <span className={`statistics-timeline-segment statistics-due-segment ${dueBinClass(bin.startDay)}`} style={{ height: `${(bin.count / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-due-label"><span>{showLabel ? bin.startDay : ''}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">days relative to today</div>
    </section>
  );
}

const SR_REVIEW_STATUSES = [
  { key: 'mature', label: 'Mature', color: '#22a447' },
  { key: 'young', label: 'Young', color: '#82c77c' },
  { key: 'relearning', label: 'Relearning', color: '#fb6b55' },
  { key: 'learning', label: 'Learning', color: '#fb923c' },
] as const;

type SRChartDay = {
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

function buildSRChartDays(
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

function formatReviewCount(count: number): string {
  return new Intl.NumberFormat().format(count);
}

function SRReviewHistoryGraph() {
  const [history, setHistory] = useState<StatisticsReviewDay[]>([]);
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    fetchStatisticsReviewHistory()
      .then((data) => {
        if (isCurrent) setHistory(data);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load review history.',
          );
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  const days = buildSRChartDays(history, rangeDays, new Date());
  const maximumDailyCount = Math.max(
    1,
    ...days.map((day) => day.learning + day.relearning + day.young + day.mature),
  );
  const maximumCumulativeTotal = Math.max(1, ...days.map((day) => day.cumulativeTotal));
  const dailyTicks = timelineTicks(maximumDailyCount);
  const totalTicks = timelineTicks(maximumCumulativeTotal);
  // Extend the total line to the plot edges so it spans the full graph width.
  const totalPoints = [
    ...(days.length > 0 ? [{ x: 0, total: days[0].cumulativeTotal }] : []),
    ...days.map((day, index) => ({ x: index + 0.5, total: day.cumulativeTotal })),
    ...(days.length > 0 ? [{ x: days.length, total: days[days.length - 1].cumulativeTotal }] : []),
  ].map((point) => ({ x: point.x, y: 100 - (point.total / maximumCumulativeTotal) * 100 }));
  const totalAreaPath = [
    `M 0 100`,
    ...totalPoints.map((point) => `L ${point.x} ${point.y}`),
    `L ${days.length} 100 Z`,
  ].join(' ');
  const totalLinePoints = totalPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const labelStep = Math.max(1, Math.ceil(rangeDays / 5));
  const dateLabels = days.filter(
    (day, index) => index % labelStep === 0 || index === days.length - 1,
  );

  return (
    <section className="statistics-timeline-section statistics-sr-review-section" aria-label="Spaced-repetition reviews">
      <div className="statistics-timeline-heading">
        <h3>Reviews</h3>
        <p className="statistics-sr-review-subtitle">Daily reviews by learning state</p>
        <div className="statistics-sr-review-ranges" aria-label="Review history time range">
          {[30, 90, 365].map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={rangeDays === range}
              className={rangeDays === range ? 'is-active' : ''}
              onClick={() => setRangeDays(range)}
            >
              {range === 30 ? '1 month' : range === 90 ? '3 months' : '1 year'}
            </button>
          ))}
        </div>
        <div className="statistics-timeline-legend" aria-label="Review status legend">
          {SR_REVIEW_STATUSES.map((status) => (
            <span key={status.key} className="statistics-timeline-legend-item">
              <span className={`statistics-sr-review-swatch is-${status.key}`} aria-hidden="true" />
              {status.label}
            </span>
          ))}
          <span className="statistics-timeline-legend-item">
            <span className="statistics-sr-review-swatch is-total" aria-hidden="true" />
            Total reviews
          </span>
        </div>
      </div>
      {loading ? <p className="statistics-sr-review-message">Loading review history...</p> : null}
      {error ? <p className="statistics-sr-review-error" role="alert">{error}</p> : null}
      {!loading && !error ? (
        <>
          <div className="statistics-sr-review-chart">
            <div className="statistics-sr-review-axis-title">Reviews per day</div>
            <div className="statistics-sr-review-axis" aria-label="Reviews per day">
              {dailyTicks.map((tick) => (
                <span
                  key={tick}
                  className="statistics-timeline-axis-label"
                  style={{ bottom: `${(tick / maximumDailyCount) * 100}%` }}
                >
                  {formatReviewCount(tick)}
                </span>
              ))}
            </div>
            <div className="statistics-sr-review-plot">
              <svg
                className="statistics-sr-review-svg"
                viewBox={`0 0 ${days.length} 100`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`Daily learning, relearning, young, and mature reviews over the last ${rangeDays} days`}
              >
                {dailyTicks.map((tick) => {
                  const y = 100 - (tick / maximumDailyCount) * 100;
                  return (
                    <line
                      key={`daily-grid-${tick}`}
                      className="statistics-sr-review-grid"
                      x1="0"
                      x2={days.length}
                      y1={y}
                      y2={y}
                    />
                  );
                })}
                <path className="statistics-sr-review-total-area" d={totalAreaPath} />
                {days.map((day, index) => {
                  let stackedCount = 0;
                  const segments = SR_REVIEW_STATUSES.map((status) => {
                    const count = day[status.key];
                    const y = 100 - ((stackedCount + count) / maximumDailyCount) * 100;
                    stackedCount += count;
                    return count > 0 ? (
                      <rect
                        key={status.key}
                        className={`statistics-sr-review-segment is-${status.key}`}
                        x={index + 0.12}
                        y={y}
                        width="0.76"
                        height={(count / maximumDailyCount) * 100}
                      />
                    ) : null;
                  });
                  return (
                    <g key={localDateKey(day.date)}>
                      <title>
                        {`${day.daysAgo} days ago: ${day.learning + day.relearning + day.young + day.mature} categorized reviews; ${day.total} total reviews`}
                      </title>
                      {segments}
                    </g>
                  );
                })}
                <polyline className="statistics-sr-review-total-line" points={totalLinePoints} />
              </svg>
              <div className="statistics-sr-review-date-labels" aria-hidden="true">
                {dateLabels.map((day) => (
                  <span
                    key={localDateKey(day.date)}
                    style={{ left: `${((rangeDays - day.daysAgo) / rangeDays) * 100}%` }}
                  >
                    {day.daysAgo === 0 ? '0' : `-${day.daysAgo}`}
                  </span>
                ))}
              </div>
            </div>
            <div className="statistics-sr-review-right-axis" aria-label="Cumulative total reviews">
              {totalTicks.map((tick) => (
                <span
                  key={tick}
                  className="statistics-timeline-axis-label"
                  style={{ bottom: `${(tick / maximumCumulativeTotal) * 100}%` }}
                >
                  {formatReviewCount(tick)}
                </span>
              ))}
            </div>
            <div className="statistics-sr-review-axis-caption">days ago</div>
            <div className="statistics-sr-review-right-axis-title">Cumulative reviews</div>
          </div>
        </>
      ) : null}
    </section>
  );
}

const TIME_BIN_SECONDS = 30;
const TIME_BIN_MAX = 120;
const TIME_BIN_MIN = 20;

function timeBinLabel(bin: number): string {
  if (bin === TIME_BIN_MAX) return '60+';
  return bin % 2 === 0 ? String(bin / 2) : '';
}

function timeBinTitle(bin: number): string {
  if (bin === TIME_BIN_MAX) return '60+ minutes';
  const minutes = bin / 2;
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function exerciseTimeMinute(exercise: ExerciseSummary): number {
  const roundedHalfMinute = Math.round(Math.max(0, exercise.timer_total ?? 0) / TIME_BIN_SECONDS);
  return Math.min(TIME_BIN_MAX, Math.max(1, roundedHalfMinute));
}

function exerciseDifficulty(exercise: ExerciseSummary): 'easy' | 'medium' | 'difficult' | null {
  const difficulty = exercise.difficulty?.trim().charAt(0).toUpperCase();
  if (difficulty === 'E') return 'easy';
  if (difficulty === 'M') return 'medium';
  if (difficulty === 'D') return 'difficult';
  return null;
}

function buildTimeDistribution(exerciseSummaries: ExerciseSummary[]): TimeDistributionBucket[] {
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

function TimeDistributionGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const buckets = buildTimeDistribution(exerciseSummaries);
  const maximumCount = Math.max(
    1,
    ...buckets.map((bucket) => bucket.easy + bucket.medium + bucket.difficult),
  );
  const ticks = timelineTicks(maximumCount);

  return (
    <section className="statistics-timeline-section" aria-label="Completed exercise time distribution">
      <div className="statistics-timeline-heading">
        <h3>Completed exercises by time</h3>
        <div className="statistics-timeline-legend" aria-label="Difficulty legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-green" aria-hidden="true" />Easy</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Medium</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Difficult</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-distribution-chart">
        <div className="statistics-timeline-axis-title">Number of exercises</div>
        <div className="statistics-timeline-axis" aria-label="Number of exercises">
          {ticks.map((tick) => (
            <span key={tick} className="statistics-timeline-axis-label" style={{ bottom: `${(tick / maximumCount) * 100}%` }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="statistics-timeline-viewport">
          <div className="statistics-timeline-plot">
            <div className="statistics-timeline-guides" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / maximumCount) * 100}%` }} />
              ))}
            </div>
            <div className="statistics-time-distribution" style={{ '--timeline-days': buckets.length } as React.CSSProperties}>
              {buckets.map((bucket) => {
                const total = bucket.easy + bucket.medium + bucket.difficult;
                return (
                  <div
                    key={bucket.minute}
                    className="statistics-time-distribution-day"
                    title={`${timeBinTitle(bucket.minute)}: ${total} exercise${total === 1 ? '' : 's'}`}
                  >
                    <div className="statistics-timeline-bar" aria-label={`${timeBinTitle(bucket.minute)}: ${total} exercises`}>
                      <span className="statistics-timeline-segment is-green" style={{ height: `${(bucket.easy / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-blue" style={{ height: `${(bucket.medium / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-red" style={{ height: `${(bucket.difficult / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-time-distribution-label">{timeBinLabel(bucket.minute)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">time spent (min)</div>
    </section>
  );
}

type RestDurationBucket = { bin: number; easy: number; medium: number; difficult: number };

// Same 30 s rounding and 10-60 minute range as the exercise time graph.
function buildRestDurationDistribution(
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

function RestDurationGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const [logbooks, setLogbooks] = useState<Record<string, ApiLogbookState[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    fetchLogbookHistory()
      .then((data) => {
        if (isCurrent) setLogbooks(data);
      })
      .catch(() => {
        if (isCurrent) setLogbooks({});
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [exerciseSummaries]);

  if (isLoading) return <p>Loading logbook statistics...</p>;

  const buckets = buildRestDurationDistribution(exerciseSummaries, logbooks);
  const maximumCount = Math.max(1, ...buckets.map((bucket) => bucket.easy + bucket.medium + bucket.difficult));
  const ticks = timelineTicks(maximumCount);

  return (
    <section className="statistics-timeline-section" aria-label="Rest duration distribution">
      <div className="statistics-timeline-heading">
        <h3>Rests duration</h3>
        <div className="statistics-timeline-legend" aria-label="Difficulty legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-green" aria-hidden="true" />Easy</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Medium</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Difficult</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-distribution-chart">
        <div className="statistics-timeline-axis-title">Number of rests</div>
        <div className="statistics-timeline-axis" aria-label="Number of rests">
          {ticks.map((tick) => (
            <span key={tick} className="statistics-timeline-axis-label" style={{ bottom: `${(tick / maximumCount) * 100}%` }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="statistics-timeline-viewport">
          <div className="statistics-timeline-plot">
            <div className="statistics-timeline-guides" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / maximumCount) * 100}%` }} />
              ))}
            </div>
            <div className="statistics-time-distribution" style={{ '--timeline-days': buckets.length } as React.CSSProperties}>
              {buckets.map((bucket) => {
                const total = bucket.easy + bucket.medium + bucket.difficult;
                return (
                  <div
                    key={bucket.bin}
                    className="statistics-time-distribution-day"
                    title={`${timeBinTitle(bucket.bin)}: ${total} rest${total === 1 ? '' : 's'}`}
                  >
                    <div className="statistics-timeline-bar" aria-label={`${timeBinTitle(bucket.bin)}: ${total} rests`}>
                      <span className="statistics-timeline-segment is-green" style={{ height: `${(bucket.easy / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-blue" style={{ height: `${(bucket.medium / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-red" style={{ height: `${(bucket.difficult / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-time-distribution-label">{timeBinLabel(bucket.bin)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">rest duration (min)</div>
    </section>
  );
}

const DIFFICULTY_NUMBER = { easy: 1, medium: 2, difficult: 3 } as const;

function buildExerciseSessions(
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
      activeMs,
      completedAt: completedAt.getTime(),
    });
  });
  return sessions;
}

const LAST_SESSIONS_WINDOW = 20;

function BehaviourProfiles({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const [data, setData] = useState<{ logbooks: Record<string, ApiLogbookState[]>; events: StatisticsBehaviorEvent[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastOnly, setLastOnly] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setData(null);
    setLoadError(null);
    Promise.all([fetchLogbookHistory(), fetchStatisticsBehaviorEvents()])
      .then(([logbooks, events]) => {
        if (isCurrent) setData({ logbooks, events });
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load study behaviour data.');
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [exerciseSummaries]);

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!data) return <p>Loading study behaviour...</p>;

  const allSessions = buildExerciseSessions(exerciseSummaries, data.logbooks, data.events);
  const sessions = selectSessions(allSessions, lastOnly ? LAST_SESSIONS_WINDOW : null);
  const profile = generateGlobalProfile(sessions);
  const style = generateStudyStyleProfile(sessions);
  const countLabel = `${sessions.length} completed exercise${sessions.length === 1 ? '' : 's'} with logbook data`;

  return (
    <>
      <div className="statistics-radar-row">
        <section className="statistics-timeline-section statistics-radar-section" aria-label="Metacognitive profile">
          <div className="statistics-timeline-heading">
            <h3>Metacognitive profile</h3>
            <span className="statistics-timeline-legend-item">{countLabel}</span>
          </div>
          <RadarChart
            ariaLabel="Metacognitive profile radar chart"
            axes={[
              { label: 'Concept mastery', value: profile.conceptMastery, description: 'Accuracy (1 / (incorrect validations + 1)) weighted by difficulty. High is good.' },
              { label: 'Calibration', value: profile.calibration, description: 'How closely your confidence rating matches your actual accuracy. High is good.' },
              { label: 'Deliberation', value: profile.deliberation, description: 'Gaps over 20 s between logbook entries, relative to the number of entries: time spent thinking.' },
              { label: 'Resilience', value: profile.resilience, description: 'How you react after an incorrect validation: no cheat right away, no giving up, little backtracking.' },
              { label: 'Autonomy', value: profile.autonomous, description: 'Solving without cheats. 1 at no cheat use, 0 when 30% or more of exercises used cheats.' },
            ]}
          />
        </section>
        <div className="statistics-radar-toggle" role="group" aria-label="Exercises included in the profiles">
          <button type="button" className={lastOnly ? '' : 'is-active'} aria-pressed={!lastOnly} onClick={() => setLastOnly(false)}>All exercises</button>
          <button type="button" className={lastOnly ? 'is-active' : ''} aria-pressed={lastOnly} onClick={() => setLastOnly(true)}>Last {LAST_SESSIONS_WINDOW}</button>
        </div>
        <section className="statistics-timeline-section statistics-radar-section" aria-label="Study style profile">
          <div className="statistics-timeline-heading">
            <h3>Study style profile</h3>
            <span className="statistics-timeline-legend-item">
              {sessions.length < MIN_STYLE_SESSIONS ? `Needs at least ${MIN_STYLE_SESSIONS} exercises` : 'Low everywhere is best'}
            </span>
          </div>
          <RadarChart
            ariaLabel="Study style radar chart"
            startAngle={(-2 * Math.PI) / 3}
            floor={0.1}
            axes={[
              { label: 'Phantom', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.phantom, description: 'Accurate and quick, but with cheats. Leans on aids.' },
              { label: 'Dunning-Kruger', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.dunningKruger, description: 'Confident on difficult exercises, yet inaccurate. Overestimates own skill.' },
              { label: 'Hidden genius', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.hiddenGenius, description: 'Accurate and decisive, yet low confidence. Underestimates own skill.' },
              { label: 'Speed demon', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.speedDemon, description: 'Finishes in under 5 minutes with many mistakes. Rushes.' },
              { label: 'Perfectionist', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.perfectionist, description: 'Accurate without cheats, but takes over 20 minutes.' },
              { label: 'Stubborn', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.stubborn, description: 'Many mistakes, no cheats, and either a long time or a lot of undoing. Struggles without help.' },
            ]}
          />
        </section>
      </div>
    </>
  );
}

const TIME_OF_DAY_BIN_COUNT = 96;

function buildTimeOfDayDistribution(
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

function formatTimeOfDayBin(index: number): string {
  const minutes = index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function TimeOfDayDistributionGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const [logbooks, setLogbooks] = useState<Record<string, ApiLogbookState[]>>({});

  useEffect(() => {
    let isCurrent = true;
    fetchLogbookHistory()
      .then((data) => {
        if (isCurrent) setLogbooks(data);
      })
      .catch(() => {
        if (isCurrent) setLogbooks({});
      });
    return () => {
      isCurrent = false;
    };
  }, [exerciseSummaries]);

  const buckets = buildTimeOfDayDistribution(exerciseSummaries, logbooks);
  const maximumSeconds = timeScaleMaximum(Math.max(0, ...buckets.map((bucket) => bucket.easy + bucket.medium + bucket.difficult)));
  const ticks = timeScaleTicks(maximumSeconds);

  return (
    <section className="statistics-timeline-section" aria-label="Time spent by time of day">
      <div className="statistics-timeline-heading">
        <h3>Time spent by time of day</h3>
        <div className="statistics-timeline-legend" aria-label="Difficulty legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-green" aria-hidden="true" />Easy</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Medium</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Difficult</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-of-day-chart">
        <div className="statistics-timeline-axis-title">Total time</div>
        <div className="statistics-timeline-axis" aria-label="Total time">
          {ticks.map((tick) => (
            <span key={tick} className="statistics-timeline-axis-label" style={{ bottom: `${(tick / maximumSeconds) * 100}%` }}>
              {formatDuration(Math.round(tick))}
            </span>
          ))}
        </div>
        <div className="statistics-timeline-viewport">
          <div className="statistics-timeline-plot">
            <div className="statistics-timeline-guides" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / maximumSeconds) * 100}%` }} />
              ))}
            </div>
            <div className="statistics-time-of-day-distribution" style={{ '--timeline-days': buckets.length } as React.CSSProperties}>
              {buckets.map((bucket, index) => {
                const total = bucket.easy + bucket.medium + bucket.difficult;
                const label = `${formatTimeOfDayBin(index)}-${formatTimeOfDayBin((index + 1) % TIME_OF_DAY_BIN_COUNT)}: ${formatDuration(Math.round(total))}`;
                return (
                  <div key={index} className="statistics-time-of-day-bin" title={label}>
                    <div className="statistics-timeline-bar" aria-label={label}>
                      <span className="statistics-timeline-segment is-green" style={{ height: `${(bucket.easy / maximumSeconds) * 100}%` }} />
                      <span className="statistics-timeline-segment is-blue" style={{ height: `${(bucket.medium / maximumSeconds) * 100}%` }} />
                      <span className="statistics-timeline-segment is-red" style={{ height: `${(bucket.difficult / maximumSeconds) * 100}%` }} />
                    </div>
                    <span className="statistics-time-distribution-label">{index % 4 === 0 ? String(index / 4) : ''}</span>
                  </div>
                );
              })}
              <span className="statistics-time-of-day-end-label">24</span>
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">time of the day</div>
    </section>
  );
}

type AverageTimeDay = {
  date: Date;
  averageSeconds: number;
  exerciseCount: number;
};

function buildAverageTimeDays(exerciseSummaries: ExerciseSummary[]): AverageTimeDay[] {
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

function formatDuration(seconds: number | null | undefined): string {
  const totalSeconds = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function formatTotalDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const remainingSeconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${remainingSeconds}`;
}

function exerciseLabel(exercise: ExerciseSummary, includeTime: boolean, includeIncorrectCount: boolean): string {
  const title = `${exercise.exercise_set ?? 'Unassigned'} / ${exercise.name ?? `Exercise ${exercise.id}`}`;
  const duration = includeTime ? ` (${formatDuration(exercise.timer_total)})` : '';
  const incorrectCount = includeIncorrectCount ? ` (${exercise.incorrect_count ?? 0}x)` : '';
  return `${title}${duration}${incorrectCount}`;
}

function RankedExerciseList({ title, exercises, includeTime = false, includeIncorrectCount = false }: { title: string; exercises: ExerciseSummary[]; includeTime?: boolean; includeIncorrectCount?: boolean }) {
  return (
    <section className="statistics-ranking-list">
      <h3>{title}</h3>
      {exercises.length > 0 ? (
        <ol>
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              {exerciseUsedCheats(exercise) ? (
                <span
                  className="statistics-cheat-indicator"
                  title="Cheats used"
                  style={{ fontWeight: 800 }}
                >
                  !!
                </span>
              ) : null}
              {exerciseLabel(exercise, includeTime, includeIncorrectCount)}
            </li>
          ))}
        </ol>
      ) : <p>No data</p>}
    </section>
  );
}

function StatisticsSummary({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const completedExerciseCount = exerciseSummaries.filter((exercise) => exercise.completed_at != null).length;
  const dbeInputTotal = exerciseSummaries.reduce((sum, exercise) => sum + (exercise.dbe_set ?? 0), 0);
  const statistics = [
    { label: 'Fragments', field: 'fragments_drawn' as const, unit: 'fragments' },
    { label: 'Merges', field: 'merges_done' as const, unit: 'merges' },
    { label: 'Matches', field: 'matches_done' as const, unit: 'matches' },
  ];

  return (
    <section className="statistics-summary" aria-label="Statistics summary">
      {statistics.map(({ label, field, unit }) => {
        const total = exerciseSummaries.reduce((sum, exercise) => sum + (exercise[field] ?? 0), 0);
        const average = completedExerciseCount > 0 ? total / completedExerciseCount : 0;
        return (
          <div key={field} className="statistics-summary-item">
            <h3>{`Number of ${label}`}</h3>
            <p>total: {total} {unit}</p>
            <p>average: {average.toFixed(1)} per completed exercise</p>
          </div>
        );
      })}
      <div className="statistics-summary-item">
        <h3>Number of DBE inputs</h3>
        <p>total: {dbeInputTotal} inputs</p>
        <p>average: {(completedExerciseCount > 0 ? dbeInputTotal / completedExerciseCount : 0).toFixed(1)} per completed exercise</p>
      </div>
    </section>
  );
}

function perfectStreak(exerciseSummaries: ExerciseSummary[]): number {
  const completedExercises = exerciseSummaries
    .map((exercise) => ({ exercise, completedAt: parseExerciseDate(exercise.completed_at) }))
    .filter((entry): entry is { exercise: ExerciseSummary; completedAt: Date } => entry.completedAt !== null)
    .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime());

  let streak = 0;
  for (const { exercise } of completedExercises) {
    if (exercise.incorrect_count !== 0) break;
    streak += 1;
  }
  return streak;
}

function PerfectStreak({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  return (
    <section className="statistics-summary" aria-label="Perfect streak">
      <div className="statistics-summary-item">
        <h3>Perfect streak</h3>
        <p>{perfectStreak(exerciseSummaries)} exercises</p>
      </div>
    </section>
  );
}

function isTrackedExerciseSet(exercise: ExerciseSummary): boolean {
  const exerciseSet = exercise.exercise_set?.trim().toLowerCase();
  return exerciseSet !== 'examples' && exerciseSet !== 'references';
}

function ProgressionBar({ title, exercises, layout = 'stacked', rowClassName = '' }: { title: string; exercises: ExerciseSummary[]; layout?: 'stacked' | 'row'; rowClassName?: string }) {
  const total = exercises.length;
  const statuses = exercises.map(contributionStatus);
  const correctNoCheats = statuses.filter((status) => status === 'is-green').length;
  const correctWithCheats = statuses.filter((status) => status === 'is-yellow').length;
  const openIncorrect = statuses.filter((status) => status === 'is-red').length;
  const incomplete = statuses.filter((status) => status === 'is-blue').length;
  const completed = correctNoCheats + correctWithCheats;
  const totalTimeSpent = exercises.reduce((sum, exercise) => sum + (exercise.timer_total ?? 0), 0);
  const counts = (
    <div className="statistics-progression-counts">
      <span className="statistics-progression-count is-green">{correctNoCheats}</span>
      <span className="statistics-progression-separator">/</span>
      <span className="statistics-progression-count is-yellow">{correctWithCheats}</span>
      <span className="statistics-progression-separator">/</span>
      <span className="statistics-progression-count is-red">{openIncorrect}</span>
      <span className="statistics-progression-separator">/</span>
      <span className="statistics-progression-count is-blue">{incomplete}</span>
      <span className="statistics-progression-separator">/</span>
      <span className="statistics-progression-count is-black">{total}</span>
      <span className="statistics-progression-time">[{formatTotalDuration(totalTimeSpent)}]</span>
    </div>
  );

  if (layout === 'row') {
    return (
      <div className={`statistics-progression-row ${rowClassName}`.trim()}>
        <span className="statistics-progression-row-title">{title}</span>
        <progress className="statistics-progression-bar" value={completed} max={total || 1} />
        {counts}
      </div>
    );
  }

  return (
    <div className="statistics-progression">
      <h3>{title}</h3>
      <progress className="statistics-progression-bar" value={completed} max={total || 1} />
      {counts}
    </div>
  );
}

function ProgressionStats({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const trackedExercises = exerciseSummaries.filter(isTrackedExerciseSet);
  return (
    <div className="statistics-total-progression">
      <ProgressionBar
        title="Total progression"
        exercises={trackedExercises}
        layout="row"
        rowClassName="statistics-total-progression-row"
      />
    </div>
  );
}

function ExerciseSetProgression({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const trackedExercises = exerciseSummaries.filter(isTrackedExerciseSet);
  const exerciseSetNames = Array.from(
    new Set(trackedExercises.map((exercise) => exercise.exercise_set ?? 'Unassigned')),
  ).sort((left, right) => left.localeCompare(right));

  return (
    <div className="statistics-set-progression">
      <h3 className="statistics-set-progression-title">Progression per exercise set</h3>
      <div className="statistics-set-progression-list">
        {exerciseSetNames.map((exerciseSetName) => (
          <ProgressionBar
            key={exerciseSetName}
            title={exerciseSetName}
            layout="row"
            exercises={trackedExercises.filter((exercise) => (exercise.exercise_set ?? 'Unassigned') === exerciseSetName)}
          />
        ))}
      </div>
    </div>
  );
}

function TagProgression({ exerciseSummaries, tags, showCheatTags }: { exerciseSummaries: ExerciseSummary[]; tags: Tag[]; showCheatTags: boolean }) {
  const trackedExercises = exerciseSummaries.filter(isTrackedExerciseSet);
  const progressionTags = tags
    .filter((tag) => tag.progression_use && (showCheatTags || !tag.is_cheat))
    .sort((left, right) => left.tag_name.localeCompare(right.tag_name));

  return (
    <div className="statistics-set-progression">
      <h3 className="statistics-set-progression-title">Progression per tag</h3>
      <div className="statistics-set-progression-list">
        {progressionTags.length > 0 ? (
          progressionTags.map((tag) => (
            <ProgressionBar
              key={tag.id}
              title={tag.tag_name}
              layout="row"
              exercises={trackedExercises.filter((exercise) => (exercise.statistics_tags ?? exercise.tags).includes(tag.tag_name))}
            />
          ))
        ) : <p>No data</p>}
      </div>
    </div>
  );
}

function ProgressionTab({ exerciseSummaries, showCheatTags }: { exerciseSummaries: ExerciseSummary[]; showCheatTags: boolean }) {
  const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => {
    fetchTags().then(setTags).catch(() => setTags([]));
  }, []);

  return (
    <div className="statistics-progression-tab">
      <div className="statistics-progression-tab-box">
        <StatisticsTimeline exerciseSummaries={exerciseSummaries} />
      </div>
      <div className="statistics-progression-tab-box">
        <ProgressionStats exerciseSummaries={exerciseSummaries} />
        <div className="statistics-progression-panel">
          <div className="statistics-progression-column">
            <ExerciseSetProgression exerciseSummaries={exerciseSummaries} />
          </div>
          <div className="statistics-progression-column">
            <TagProgression exerciseSummaries={exerciseSummaries} tags={tags} showCheatTags={showCheatTags} />
          </div>
        </div>
      </div>
    </div>
  );
}

type ResetRowId = 'current' | 'set' | 'tag' | 'age' | 'difficulty' | 'all';

function ResetTab({ exerciseSummaries: allExerciseSummaries, selectedExerciseId, enableDelete, deleteProgression, showCheatTags }: { exerciseSummaries: ExerciseSummary[]; selectedExerciseId: number | null; enableDelete: boolean; deleteProgression: boolean; showCheatTags: boolean }) {
  // Only exercises with a statistics row can be reset (seeded examples/references have none), except for full deletion.
  const exerciseSummaries = allExerciseSummaries.filter((exercise) => exercise.has_statistics === true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedSet, setSelectedSet] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [minimumAge, setMinimumAge] = useState('');
  const [maximumAge, setMaximumAge] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [resetLevels, setResetLevels] = useState<Record<ResetRowId, ResetLevel | ''>>({ current: '', set: '', tag: '', age: '', difficulty: '', all: '' });
  const [pendingReset, setPendingReset] = useState<{ exerciseIds: number[]; level: ResetLevel; dueOnly?: boolean } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const setSource = enableDelete ? allExerciseSummaries : exerciseSummaries;
  const exerciseSets = Array.from(new Set(setSource.map((exercise) => exercise.exercise_set?.trim()).filter((set): set is string => Boolean(set) && (enableDelete || set!.toLowerCase() !== 'references')))).sort((left, right) => left.localeCompare(right));

  useEffect(() => {
    setResetLevels((levels) => ({
      current: (levels.current === 'exercise' && !enableDelete) || (levels.current === 'progression' && !deleteProgression) ? '' : levels.current,
      set: (levels.set === 'exercise' && !enableDelete) || (levels.set === 'progression' && !deleteProgression) ? '' : levels.set,
      tag: (levels.tag === 'exercise' && !enableDelete) || (levels.tag === 'progression' && !deleteProgression) ? '' : levels.tag,
      age: (levels.age === 'exercise' && !enableDelete) || (levels.age === 'progression' && !deleteProgression) ? '' : levels.age,
      difficulty: (levels.difficulty === 'exercise' && !enableDelete) || (levels.difficulty === 'progression' && !deleteProgression) ? '' : levels.difficulty,
      all: (levels.all === 'exercise' && !enableDelete) || (levels.all === 'progression' && !deleteProgression) ? '' : levels.all,
    }));
    setPendingReset((pending) => (
      (pending?.level === 'exercise' && !enableDelete) || (pending?.level === 'progression' && !deleteProgression)
        ? null
        : pending
    ));
  }, [deleteProgression, enableDelete]);

  useEffect(() => {
    fetchTags().then(setTags).catch(() => setTags([]));
  }, []);

  const listFor = (rowId: ResetRowId) => (resetLevels[rowId] === 'exercise' ? allExerciseSummaries : exerciseSummaries);

  const idsForDateRange = (minimum: number, maximum: number): number[] => listFor('age')
    .filter((exercise) => {
      const dateValue = exercise.completed_at ?? exercise.started_at;
      if (!dateValue) return false;
      const ageDays = (Date.now() - new Date(dateValue).getTime()) / 86_400_000;
      return ageDays >= minimum && ageDays <= maximum;
    })
    .map((exercise) => exercise.id);

  const requestReset = (rowId: ResetRowId, exerciseIds: number[]) => {
    const level = resetLevels[rowId];
    if (exerciseIds.length === 0 || level === '' || (level === 'exercise' && !enableDelete) || (level === 'progression' && !deleteProgression)) return;
    setResetError(null);
    setPendingReset({ exerciseIds, level });
  };

  const requestQuickReset = (exerciseIds: number[] | 'due') => {
    if (exerciseIds !== 'due' && exerciseIds.length === 0) return;
    setResetError(null);
    setPendingReset(exerciseIds === 'due' ? { exerciseIds: [], level: 'completion', dueOnly: true } : { exerciseIds, level: 'completion' });
  };

  const hasCompletion = (exercise: ExerciseSummary) => {
    const completedAt = exercise.completed_at?.trim();
    return Boolean(completedAt && completedAt !== '0');
  };
  const completedWithHelpIds = exerciseSummaries.filter((exercise) => hasCompletion(exercise) && exerciseUsedCheats(exercise)).map((exercise) => exercise.id);
  // An exercise flagged completed without a completion time (the seeded Sucrose example) is not incomplete.
  // Mirrors the backend: overdue selected exercises that are still marked completed get reopened.
  const hasDueExercises = exerciseSummaries.some((exercise) => {
    const due = parseExerciseDate(exercise.due_time);
    return (exercise.in_SR ?? 0) > 0 && due !== null && due.getTime() < Date.now() && (exercise.completed === true || hasCompletion(exercise));
  });
  const incompleteIds = exerciseSummaries.filter((exercise) => !hasCompletion(exercise) && exercise.completed !== true).map((exercise) => exercise.id);

  const proceedWithReset = async () => {
    if (!pendingReset || resetting || (pendingReset.level === 'exercise' && !enableDelete) || (pendingReset.level === 'progression' && !deleteProgression)) return;
    setResetting(true);
    setResetError(null);
    try {
      const exerciseIds = pendingReset.dueOnly
        ? await resetDueExercises()
        : (await resetExercises(pendingReset.exerciseIds, pendingReset.level), pendingReset.exerciseIds);
      setPendingReset(null);
      window.dispatchEvent(new CustomEvent('exercise-reset', { detail: { ...pendingReset, exerciseIds } }));
      window.dispatchEvent(new Event('exercise-statistics-updated'));
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Reset failed.');
    } finally {
      setResetting(false);
    }
  };

  const scopeSelect = (rowId: ResetRowId, label: string) => (
    <select className="statistics-reset-scope" value={resetLevels[rowId]} aria-label={label} onChange={(event) => setResetLevels((levels) => ({ ...levels, [rowId]: event.target.value as ResetLevel | '' }))}>
      <option value="">...select what to reset...</option>
      <option value="logbook">Logbook data</option>
      <option value="workspace">Workspace data</option>
      <option value="completion">Completion status</option>
      {deleteProgression ? <option value="progression">Progression data</option> : null}
      {enableDelete ? <option value="exercise">Exercise</option> : null}
    </select>
  );

  const resetButton = (rowId: ResetRowId, ids: number[]) => (
    <button type="button" className="statistics-reset-button" disabled={resetLevels[rowId] === ''} onClick={() => requestReset(rowId, ids)}>Reset!</button>
  );

  return (
    <section className="statistics-reset-tab" aria-label="Reset options">
      <div className="statistics-reset-heading"><h3>Reset data</h3><p>Choose the scope for each reset action.</p></div>
      <div className="statistics-reset-list">
        <div className="statistics-quick-reset-row">
          <span className="statistics-reset-inline-content">Quick reset</span>
          <div className="statistics-quick-reset-buttons">
            <button type="button" className="statistics-reset-button" disabled={completedWithHelpIds.length === 0} onClick={() => requestQuickReset(completedWithHelpIds)}>All completed exercises with help enabled</button>
            <button type="button" className="statistics-reset-button" disabled={incompleteIds.length === 0} onClick={() => requestQuickReset(incompleteIds)}>All currently incomplete exercises</button>
            <button type="button" className="statistics-reset-button" disabled={!hasDueExercises} onClick={() => requestQuickReset('due')}>All exercises due for review</button>
          </div>
        </div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset current exercise</span>{scopeSelect('current', 'Reset level for current exercise')}{resetButton('current', selectedExerciseId === null || !listFor('current').some((exercise) => exercise.id === selectedExerciseId) ? [] : [selectedExerciseId])}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises from the <select className="statistics-reset-select" value={selectedSet} onChange={(event) => setSelectedSet(event.target.value)} aria-label="Exercise set"><option value="" disabled>Select exercise set</option>{exerciseSets.map((set) => <option key={set} value={set}>{set}</option>)}</select> exercise set</span>{scopeSelect('set', 'Reset level for exercise set')}{resetButton('set', listFor('set').filter((exercise) => exercise.exercise_set?.trim() === selectedSet).map((exercise) => exercise.id))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises with the <select className="statistics-reset-select" value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} aria-label="Tag"><option value="" disabled>Select tag</option>{tags.filter((tag) => showCheatTags || !tag.is_cheat).map((tag) => <option key={tag.id} value={tag.tag_name}>{tag.tag_name}</option>)}</select> tag</span>{scopeSelect('tag', 'Reset level for tag')}{resetButton('tag', listFor('tag').filter((exercise) => exercise.tags.includes(selectedTag)).map((exercise) => exercise.id))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises between <input className="statistics-reset-number" type="number" min="0" aria-label="Youngest age in days" value={minimumAge} onChange={(event) => setMinimumAge(event.target.value)} /> and <input className="statistics-reset-number" type="number" min="0" aria-label="Oldest age in days" value={maximumAge} onChange={(event) => setMaximumAge(event.target.value)} /> days old</span>{scopeSelect('age', 'Reset level for age range')}{resetButton('age', idsForDateRange(Number(minimumAge) || 0, Number(maximumAge) || Number.POSITIVE_INFINITY))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises with <select className="statistics-reset-select" value={selectedDifficulty} onChange={(event) => setSelectedDifficulty(event.target.value)} aria-label="Difficulty"><option value="" disabled>Select difficulty</option><option value="E">Easy</option><option value="M">Medium</option><option value="D">Hard</option></select> difficulty</span>{scopeSelect('difficulty', 'Reset level for difficulty')}{resetButton('difficulty', listFor('difficulty').filter((exercise) => exercise.difficulty?.startsWith(selectedDifficulty)).map((exercise) => exercise.id))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset all exercises</span>{scopeSelect('all', 'Reset level for all exercises')}{resetButton('all', listFor('all').map((exercise) => exercise.id))}</div>
      </div>
      {pendingReset ? <div className="statistics-reset-confirmation-backdrop" role="presentation"><div className="statistics-reset-confirmation" role="dialog" aria-modal="true" aria-labelledby="statistics-reset-confirmation-title"><div className="statistics-reset-confirmation-icon" aria-hidden="true">!</div><h3 id="statistics-reset-confirmation-title">Reset data?</h3><p>This action cannot be undone.</p><p className="statistics-reset-confirmation-detail">For the selected exercises, <b>all {pendingReset.level} data</b> will be permanently deleted.</p>{resetError ? <p className="statistics-reset-confirmation-error" role="alert">{resetError}</p> : null}<div className="statistics-reset-confirmation-actions"><button type="button" className="statistics-reset-cancel" disabled={resetting} onClick={() => setPendingReset(null)}>Cancel</button><button type="button" className="statistics-reset-proceed" disabled={resetting} onClick={() => void proceedWithReset()}>{resetting ? 'Resetting...' : 'Proceed'}</button></div></div></div> : null}
    </section>
  );
}

function exerciseLevel(exercise: ExerciseSummary): string {
  const tags = exercise.statistics_tags ?? exercise.tags;
  return tags.find((tag) => /^level [0-5]$/i.test(tag.trim()))?.trim() ?? '';
}

type MasterySortKey = 'name' | 'level' | 'cheats' | 'incorrect' | 'confidence' | 'difficulty' | 'successes' | 'time' | 'mastery' | 'due';

const MASTERY_COLUMNS: Array<{ key: MasterySortKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'level', label: 'Level' },
  { key: 'cheats', label: 'Cheats' },
  { key: 'incorrect', label: 'Incorrect' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'successes', label: 'Successes' },
  { key: 'time', label: 'Time spent' },
  { key: 'mastery', label: 'Mastery Index' },
  { key: 'due', label: 'Due date' },
];

const MASTERY_FLEX_COLUMNS: MasterySortKey[] = ['name'];

const DIFFICULTY_ORDER: Record<string, number> = { E: 0, M: 1, D: 2 };

function masterySortValue(exercise: ExerciseSummary, key: MasterySortKey): string | number | null {
  const match = /^([EMD])(\d+)$/.exec(exercise.difficulty?.trim() ?? '');
  switch (key) {
    case 'name': return `${exercise.exercise_set ?? 'Unassigned'} / ${exercise.name ?? `Exercise ${exercise.id}`}`;
    case 'level': return exerciseLevel(exercise) || null;
    case 'cheats': return exerciseUsedCheats(exercise) ? 1 : 0;
    case 'incorrect': return exercise.incorrect_count ?? 0;
    case 'confidence': return exercise.confidence ?? null;
    case 'difficulty': return match ? DIFFICULTY_ORDER[match[1]] : null;
    case 'successes': return match ? Number(match[2]) : null;
    case 'time': return exercise.timer_total ?? 0;
    case 'mastery': return exercise.mastery_index ?? 0;
    case 'due': return parseExerciseDate(exercise.due_time)?.getTime() ?? null;
  }
}

function MasteryListTab({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const [sort, setSort] = useState<{ key: MasterySortKey; direction: 'asc' | 'desc' }>({ key: 'mastery', direction: 'desc' });
  const factor = sort.direction === 'asc' ? 1 : -1;
  // Only exercises with a statistics row have a difficulty value.
  const rows = exerciseSummaries
    .filter((exercise) => exercise.difficulty != null)
    .sort((left, right) => {
      const leftValue = masterySortValue(left, sort.key);
      const rightValue = masterySortValue(right, sort.key);
      // Empty values always go last regardless of direction.
      if (leftValue === null || rightValue === null) {
        return leftValue === rightValue ? 0 : leftValue === null ? 1 : -1;
      }
      const result = typeof leftValue === 'string' && typeof rightValue === 'string'
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);
      return result * factor;
    });
  const difficultyNames: Record<string, string> = { E: 'Easy', M: 'Medium', D: 'Difficult' };

  return (
    <div className="statistics-mastery-list">
      <table className="statistics-mastery-table">
        <thead>
          <tr>
            {MASTERY_COLUMNS.map((column) => (
              <th
                key={column.key}
                className={MASTERY_FLEX_COLUMNS.includes(column.key) ? 'is-flex' : 'is-compact'}
                aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  type="button"
                  className="statistics-mastery-sort"
                  onClick={() => setSort((current) => ({
                    key: column.key,
                    direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
                  }))}
                >
                  {column.label}
                  <span className="statistics-mastery-sort-arrow" aria-hidden="true">
                    {sort.key === column.key ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((exercise) => {
            const match = /^([EMD])(\d+)$/.exec(exercise.difficulty?.trim() ?? '');
            const due = parseExerciseDate(exercise.due_time);
            return (
              <tr key={exercise.id}>
                <td className="is-flex">{`${exercise.exercise_set ?? 'Unassigned'} / ${exercise.name ?? `Exercise ${exercise.id}`}`}</td>
                <td className="is-compact">{exerciseLevel(exercise)}</td>
                <td className="is-compact">{exerciseUsedCheats(exercise) ? 'yes' : 'no'}</td>
                <td className="is-compact">{exercise.incorrect_count ?? 0}</td>
                <td className="is-compact">{exercise.confidence ?? ''}</td>
                <td className="is-compact">{match ? difficultyNames[match[1]] : '--'}</td>
                <td className="is-compact">{match ? match[2] : '--'}</td>
                <td className="is-compact">{formatDuration(exercise.timer_total)}</td>
                <td className="is-compact">{(exercise.mastery_index ?? 0).toFixed(3)}</td>
                <td className="is-compact">{due ? due.toLocaleDateString() : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ContributionGrid({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const slotCount = Math.ceil(exerciseSummaries.length / CONTRIBUTION_COLUMNS) * CONTRIBUTION_COLUMNS;
  const solvedExercises = exerciseSummaries.filter((exercise) => exercise.completed_at);
  const fastestExercises = [...solvedExercises]
    .sort((left, right) => (left.timer_total ?? Number.POSITIVE_INFINITY) - (right.timer_total ?? Number.POSITIVE_INFINITY))
    .slice(0, 10);
  const slowestExercises = [...solvedExercises]
    .sort((left, right) => (right.timer_total ?? Number.NEGATIVE_INFINITY) - (left.timer_total ?? Number.NEGATIVE_INFINITY))
    .slice(0, 10);
  const mostIncorrectExercises = [...exerciseSummaries]
    .filter((exercise) => (exercise.incorrect_count ?? 0) > 0)
    .sort((left, right) => (right.incorrect_count ?? 0) - (left.incorrect_count ?? 0))
    .slice(0, 10);

  return (
    <div className="statistics-contribution-content">
      <div className="statistics-contribution-column">
        <div className="statistics-contribution-grid" aria-label="Contribution overview">
          {Array.from({ length: slotCount }, (_, index) => {
            const exercise = exerciseSummaries[index];
            return (
              <span
                key={exercise?.id ?? `empty-${index}`}
                className={`statistics-contribution-cell statistics-contribution-status ${exercise ? contributionStatus(exercise) : 'is-empty'}`}
                title={exercise ? `${exercise.exercise_set ?? 'Unassigned'} / ${exercise.name ?? `Exercise ${exercise.id}`}${(exercise.timer_total ?? 0) > 0 ? ` (${formatDuration(exercise.timer_total)})` : ''}` : undefined}
                aria-hidden="true"
              />
            );
          })}
        </div>
        <div className="statistics-contribution-legend" aria-label="Contribution status legend">
          {CONTRIBUTION_STATUSES.map((status) => (
            <div key={status.color} className="statistics-contribution-legend-item">
              <span className={`statistics-contribution-swatch statistics-contribution-status is-${status.color}`} aria-hidden="true" />
              <span>{status.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="statistics-contribution-column statistics-contribution-column-right">
        <div className="statistics-ranking-lists">
          <RankedExerciseList title="Fastest solved exercises" exercises={fastestExercises} includeTime />
          <RankedExerciseList title="Slowest solved exercises" exercises={slowestExercises} includeTime />
          <div className="statistics-ranking-list-column">
            <RankedExerciseList title="Most incorrect answers" exercises={mostIncorrectExercises} includeIncorrectCount />
            <PerfectStreak exerciseSummaries={exerciseSummaries} />
            <StatisticsSummary exerciseSummaries={exerciseSummaries} />
          </div>
        </div>
      </div>
    </div>
  );
}

const LEVEL_COUNT = 6;
const LEVEL_MIN_POINTS = 3;

type LevelPoint = { id: number; name: string; seconds: number; difficulty: 'easy' | 'medium' | 'difficult' };

const LEVEL_DOT_COLORS = { easy: '#22c55e', medium: '#3b82f6', difficult: '#ef4444' } as const;

function buildLevelPoints(exerciseSummaries: ExerciseSummary[]): LevelPoint[][] {
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

function LevelAnalysisGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const levels = buildLevelPoints(exerciseSummaries);
  const allLevels = levels.map((points, level) => ({ points, level }));
  const analyzedLevels = allLevels.filter(({ points }) => points.length >= LEVEL_MIN_POINTS);
  const allSeconds = analyzedLevels.flatMap(({ points }) => points.map((point) => point.seconds));
  const maximum = timeScaleMaximum(Math.max(0, ...allSeconds));
  const ticks = [0, maximum / 4, maximum / 2, (maximum * 3) / 4, maximum];
  const position = (seconds: number) => `${Math.min(100, Math.max(0, (seconds / maximum) * 100))}%`;

  return (
    <section className="statistics-timeline-section" aria-label="Level analysis">
      <div className="statistics-timeline-heading">
        <h3>Time per exercise level</h3>
        <div className="statistics-timeline-legend" aria-label="Difficulty legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-green" aria-hidden="true" />Easy</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Medium</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Difficult</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-level-mean-legend" aria-hidden="true" />Mean</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-level-mad-legend" aria-hidden="true" />Mean absolute deviation</span>
        </div>
      </div>
      {(
        <div className="statistics-level-chart">
          {allLevels.map(({ points, level }) => {
            const hasAnalysis = points.length >= LEVEL_MIN_POINTS;
            const mean = points.reduce((sum, point) => sum + point.seconds, 0) / points.length;
            const mad = points.reduce((sum, point) => sum + Math.abs(point.seconds - mean), 0) / points.length;
            const left = Math.max(0, mean - mad);
            const right = Math.min(maximum, mean + mad);
            return (
              <div key={level} className="statistics-level-row">
                <div className="statistics-level-label">
                  <strong>Level {level}</strong>
                  <span>n={points.length}</span>
                </div>
                <div className="statistics-level-track">
                  {hasAnalysis ? (<>
                  <div
                    className="statistics-level-mad"
                    style={{ left: position(left), width: `${((right - left) / maximum) * 100}%` }}
                    title={`MAD: ${formatDuration(Math.round(mad))}`}
                  />
                  <div className="statistics-level-mean" style={{ left: position(mean) }}>
                    <span className="statistics-level-mean-label">{`Mean ${formatDuration(Math.round(mean))} / MAD ${formatDuration(Math.round(mad))}`}</span>
                  </div>
                  {points.map((point) => (
                    <span
                      key={point.id}
                      className="statistics-level-dot"
                      style={{ left: position(point.seconds), background: LEVEL_DOT_COLORS[point.difficulty] }}
                      title={`${point.name}: ${formatDuration(Math.round(point.seconds))}`}
                    />
                  ))}
                  </>) : (
                    <span className="statistics-level-placeholder">{`Analysis of this level appears when at least ${LEVEL_MIN_POINTS} exercises of this level have been completed`}</span>
                  )}
                </div>
              </div>
            );
          })}
          <div className="statistics-level-row">
            <div className="statistics-level-label" />
            <div className="statistics-level-axis">
              {ticks.map((tick) => (
                <span key={tick} style={{ left: position(tick) }}>{formatDuration(Math.round(tick))}</span>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="statistics-time-of-day-axis-title">time spent (min:sec)</div>
    </section>
  );
}

export function StatisticsPanel({ isOpen, onClose, exerciseSummaries, selectedExerciseId, enableDelete = false, deleteProgression = false, showCheatTags = false }: StatisticsPanelProps) {
  const [activeTab, setActiveTab] = useState<StatisticsTabId>('overview');

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="settings-panel-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="settings-panel-surface settings-panel-surface--wide" role="dialog" aria-modal="true" aria-label="Statistics panel">
        <div className="settings-panel-header">
          <div className="settings-panel-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`settings-panel-tab${tab.id === activeTab ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button type="button" className="settings-panel-close" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="settings-panel-content">
          <div className="settings-tab-content" id={`statisticstab-${activeTab}`}>
            {activeTab === 'progression' ? <ProgressionTab exerciseSummaries={exerciseSummaries} showCheatTags={showCheatTags} /> : activeTab === 'overview' ? <ContributionGrid exerciseSummaries={exerciseSummaries} /> : activeTab === 'time' ? <div className="statistics-progression-tab"><div className="statistics-graph-box"><LogbookDistributionGraph exerciseSummaries={exerciseSummaries} /></div><div className="statistics-graph-box"><TimeDistributionGraph exerciseSummaries={exerciseSummaries} /></div><div className="statistics-graph-box"><RestDurationGraph exerciseSummaries={exerciseSummaries} /></div></div> : activeTab === 'spaced' ? <div className="statistics-progression-tab"><div className="statistics-graph-box"><DueDistributionGraph exerciseSummaries={exerciseSummaries} /></div><div className="statistics-graph-box"><SRReviewHistoryGraph /></div></div> : activeTab === 'reset' ? <ResetTab exerciseSummaries={exerciseSummaries} selectedExerciseId={selectedExerciseId} enableDelete={enableDelete} deleteProgression={deleteProgression} showCheatTags={showCheatTags} /> : activeTab === 'behaviour' ? <div className="statistics-progression-tab"><div className="statistics-graph-box"><BehaviourProfiles exerciseSummaries={exerciseSummaries} /></div><div className="statistics-graph-box"><TimeOfDayDistributionGraph exerciseSummaries={exerciseSummaries} /></div></div> : activeTab === 'mastery' ? <MasteryListTab exerciseSummaries={exerciseSummaries} /> : activeTab === 'levels' ? <div className="statistics-progression-tab"><div className="statistics-graph-box"><LevelAnalysisGraph exerciseSummaries={exerciseSummaries} /></div></div> : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
