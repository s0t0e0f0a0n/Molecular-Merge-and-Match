import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TagsIcon, TimeDistributionIcon, ResetIcon } from '../../components/PanelIcons';
import {
  fetchStatisticsReviewHistory,
  type ExerciseSummary,
  type StatisticsReviewDay,
} from '../../api/exercises';
import { fetchAllLogbooks, type ApiLogbookState } from '../../api/logbook';
import { resetExercises, type ResetLevel } from '../../api/reset';
import { fetchTags, type Tag } from '../../api/tags';
import '../../panelStyles.css';

type StatisticsTabId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

type StatisticsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  exerciseSummaries: ExerciseSummary[];
  selectedExerciseId: number | null;
  enableDelete?: boolean;
  deleteProgression?: boolean;
};
// tab 1 contains progression overview and graph.
// tab 2 contains timing tables
// tab 3 contains timing graphs
// tab 4 contains advanced statistics 
// tab 5 conatins the reset functions
// tab 6 contains temporary statistics
const TABS: Array<{ id: StatisticsTabId; label: React.ReactNode }> = [
  { id: '1', label: <>
      <TagsIcon />&nbsp;<span>Progression</span></> },
  { id: '2', label: <>
      <TagsIcon />&nbsp;<span>Exercise overview</span></> },
  { id: '3', label: <>

      <TimeDistributionIcon />&nbsp;<span>Time distribution</span></> },
  { id: '4', label: <>
      <TagsIcon />&nbsp;<span>Advanced</span></> },
  { id: '5', label: <>

      <ResetIcon />&nbsp;<span>Reset</span></> },
  { id: '7', label: <>
      <TagsIcon />&nbsp;<span>Mastery List</span></> },
  { id: '8', label: <>
      <TimeDistributionIcon />&nbsp;<span>Level analysis</span></> },
  { id: '6', label: 'Temp' },
];

const CONTRIBUTION_STATUSES = [
  { color: 'green', label: 'Completed and correct' },
  { color: 'red', label: 'Attempted and incorrect' },
  { color: 'yellow', label: 'Completed with cheats' },
  { color: 'blue', label: 'Started but incomplete' },
  { color: 'grey', label: 'Examples or References set' },
  { color: 'white', label: 'Not attempted' },
] as const;

const CONTRIBUTION_COLUMNS = 20;

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
};

const LOGBOOK_BIN_COUNT = 20;

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

function buildLogbookDistribution(
  exerciseSummaries: ExerciseSummary[],
  logbooks: Record<string, ApiLogbookState>,
): LogbookDistributionBucket[] {
  const buckets = Array.from({ length: LOGBOOK_BIN_COUNT }, () => ({
    createFragment: 0,
    link: 0,
    mergeFragments: 0,
    dbe: 0,
  }));
  const eventKinds = new Set(['create-fragment', 'link', 'merge-fragments', 'set-dbe']);

  exerciseSummaries
    .filter((exercise) => exercise.completed_at != null)
    .forEach((exercise) => {
      const startedAt = parseExerciseDate(exercise.started_at);
      const completedAt = parseExerciseDate(exercise.completed_at);
      if (!startedAt || !completedAt || completedAt <= startedAt) return;

      const logbook = logbooks[String(exercise.id)] ?? logbooks[`exercise-${exercise.id}`];
      if (!logbook) return;

      let entries: Array<{ kind?: string; ts?: unknown }> = [];
      try {
        const parsed = JSON.parse(logbook.entries_json) as unknown;
        if (Array.isArray(parsed)) entries = parsed.filter((entry): entry is { kind?: string; ts?: unknown } => typeof entry === 'object' && entry !== null);
      } catch {
        return;
      }

      const restarts = parseLogbookRestarts(logbook.restarts);
      const activeDuration = restarts.reduce((sum, interval) => sum + interval.stop - interval.start, 0);
      const duration = completedAt.getTime() - startedAt.getTime();
      entries.forEach((entry) => {
        if (!eventKinds.has(entry.kind ?? '')) return;
        const timestamp = parseLogbookTimestamp(entry.ts);
        if (timestamp === null) return;
        let normalizedPosition: number | null = null;
        if (restarts.length > 0 && activeDuration > 0) {
          let elapsedBeforeInterval = 0;
          for (const interval of restarts) {
            if (timestamp >= interval.start && timestamp <= interval.stop) {
              normalizedPosition = (elapsedBeforeInterval + timestamp - interval.start) / activeDuration;
              break;
            }
            elapsedBeforeInterval += interval.stop - interval.start;
          }
        } else if (timestamp >= startedAt.getTime() && timestamp <= completedAt.getTime()) {
          normalizedPosition = (timestamp - startedAt.getTime()) / duration;
        }
        if (normalizedPosition === null) return;
        const bucket = buckets[Math.min(LOGBOOK_BIN_COUNT - 1, Math.floor(normalizedPosition * LOGBOOK_BIN_COUNT))];
        if (entry.kind === 'create-fragment') bucket.createFragment += 1;
        if (entry.kind === 'link') bucket.link += 1;
        if (entry.kind === 'merge-fragments') bucket.mergeFragments += 1;
        if (entry.kind === 'set-dbe') bucket.dbe += 1;
      });
    });

  return buckets;
}

function LogbookDistributionGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const [logbooks, setLogbooks] = useState<Record<string, ApiLogbookState>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    fetchAllLogbooks()
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
    ...buckets.map((bucket) => bucket.createFragment + bucket.link + bucket.mergeFragments + bucket.dbe),
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
                const total = bucket.createFragment + bucket.link + bucket.mergeFragments + bucket.dbe;
                return (
                  <div key={index} className="statistics-time-of-day-bin" title={`${index * 5}-${(index + 1) * 5}%: ${total} event${total === 1 ? '' : 's'}`}>
                    <div className="statistics-timeline-bar" aria-label={`${index * 5}-${(index + 1) * 5}%: ${total} events`}>
                      <span className="statistics-timeline-segment statistics-logbook-create" style={{ height: `${(bucket.createFragment / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-link" style={{ height: `${(bucket.link / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-merge" style={{ height: `${(bucket.mergeFragments / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-dbe" style={{ height: `${(bucket.dbe / maximumCount) * 100}%` }} />
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
  const [rangeDays, setRangeDays] = useState(365);
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
  const totalAreaPath = [
    `M 0 100`,
    ...days.map((day, index) => {
      const y = 100 - (day.cumulativeTotal / maximumCumulativeTotal) * 100;
      return `L ${index + 0.5} ${y}`;
    }),
    `L ${days.length} 100 Z`,
  ].join(' ');
  const totalLinePoints = days
    .map((day, index) => `${index + 0.5},${100 - (day.cumulativeTotal / maximumCumulativeTotal) * 100}`)
    .join(' ');
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
          {days.every((day) => day.total === 0) ? (
            <p className="statistics-sr-review-message">No review activity in this period.</p>
          ) : null}
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
            <div className="statistics-sr-review-axis-caption">Days ago</div>
            <div className="statistics-sr-review-right-axis-title">Cumulative reviews</div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function exerciseTimeMinute(exercise: ExerciseSummary): number {
  const roundedMinute = Math.round(Math.max(0, exercise.timer_total ?? 0) / 60);
  return Math.min(60, Math.max(1, roundedMinute));
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
    60,
    Math.max(1, ...completedExercises.map(exerciseTimeMinute)),
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
                    title={`${bucket.minute === 60 ? '60+' : bucket.minute} minute${bucket.minute === 1 ? '' : 's'}: ${total} exercise${total === 1 ? '' : 's'}`}
                  >
                    <div className="statistics-timeline-bar" aria-label={`${bucket.minute === 60 ? '60+' : bucket.minute} minutes: ${total} exercises`}>
                      <span className="statistics-timeline-segment is-green" style={{ height: `${(bucket.easy / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-blue" style={{ height: `${(bucket.medium / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-red" style={{ height: `${(bucket.difficult / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-time-distribution-label">{bucket.minute === 60 ? '60+' : bucket.minute}</span>
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

const TIME_OF_DAY_BIN_COUNT = 96;

function buildTimeOfDayDistribution(
  exerciseSummaries: ExerciseSummary[],
  logbooks: Record<string, ApiLogbookState>,
): Array<{ easy: number; medium: number; difficult: number }> {
  const buckets = Array.from({ length: TIME_OF_DAY_BIN_COUNT }, () => ({ easy: 0, medium: 0, difficult: 0 }));
  exerciseSummaries.forEach((exercise) => {
    const difficulty = exerciseDifficulty(exercise);
    const logbook = logbooks[String(exercise.id)] ?? logbooks[`exercise-${exercise.id}`];
    if (!difficulty || !logbook) return;
    parseLogbookRestarts(logbook.restarts).forEach(({ start, stop }) => {
      let cursor = start;
      while (cursor < stop) {
        const date = new Date(cursor);
        const bin = Math.floor((date.getHours() * 60 + date.getMinutes()) / 15);
        const binEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, (bin + 1) * 15).getTime();
        const segmentEnd = Math.min(stop, binEnd);
        buckets[bin][difficulty] += (segmentEnd - cursor) / 1000;
        cursor = segmentEnd;
      }
    });
  });
  return buckets;
}

function formatTimeOfDayBin(index: number): string {
  const minutes = index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function TimeOfDayDistributionGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const [logbooks, setLogbooks] = useState<Record<string, ApiLogbookState>>({});

  useEffect(() => {
    let isCurrent = true;
    fetchAllLogbooks()
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

function TempTab({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  return (
    <section className="statistics-summary" aria-label="Temporary statistics">
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

function TagProgression({ exerciseSummaries, tags }: { exerciseSummaries: ExerciseSummary[]; tags: Tag[] }) {
  const trackedExercises = exerciseSummaries.filter(isTrackedExerciseSet);
  const progressionTags = tags
    .filter((tag) => tag.progression_use)
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

function ProgressionTab({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
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
            <TagProgression exerciseSummaries={exerciseSummaries} tags={tags} />
          </div>
        </div>
      </div>
    </div>
  );
}

type ResetRowId = 'current' | 'set' | 'tag' | 'age' | 'difficulty' | 'all';

function ResetTab({ exerciseSummaries, selectedExerciseId, enableDelete, deleteProgression }: { exerciseSummaries: ExerciseSummary[]; selectedExerciseId: number | null; enableDelete: boolean; deleteProgression: boolean }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedSet, setSelectedSet] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [minimumAge, setMinimumAge] = useState('');
  const [maximumAge, setMaximumAge] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [resetLevels, setResetLevels] = useState<Record<ResetRowId, ResetLevel | ''>>({ current: '', set: '', tag: '', age: '', difficulty: '', all: '' });
  const [pendingReset, setPendingReset] = useState<{ exerciseIds: number[]; level: ResetLevel } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const exerciseSets = Array.from(new Set(exerciseSummaries.map((exercise) => exercise.exercise_set?.trim()).filter((set): set is string => Boolean(set)))).sort((left, right) => left.localeCompare(right));

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

  const idsForDateRange = (minimum: number, maximum: number): number[] => exerciseSummaries
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

  const proceedWithReset = async () => {
    if (!pendingReset || resetting || (pendingReset.level === 'exercise' && !enableDelete) || (pendingReset.level === 'progression' && !deleteProgression)) return;
    setResetting(true);
    setResetError(null);
    try {
      await resetExercises(pendingReset.exerciseIds, pendingReset.level);
      setPendingReset(null);
      window.dispatchEvent(new CustomEvent('exercise-reset', { detail: pendingReset }));
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
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset current exercise</span>{scopeSelect('current', 'Reset level for current exercise')}{resetButton('current', selectedExerciseId === null ? [] : [selectedExerciseId])}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises from the <select className="statistics-reset-select" value={selectedSet} onChange={(event) => setSelectedSet(event.target.value)} aria-label="Exercise set"><option value="" disabled>Select exercise set</option>{exerciseSets.map((set) => <option key={set} value={set}>{set}</option>)}</select> exercise set</span>{scopeSelect('set', 'Reset level for exercise set')}{resetButton('set', exerciseSummaries.filter((exercise) => exercise.exercise_set?.trim() === selectedSet).map((exercise) => exercise.id))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises with the <select className="statistics-reset-select" value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} aria-label="Tag"><option value="" disabled>Select tag</option>{tags.map((tag) => <option key={tag.id} value={tag.tag_name}>{tag.tag_name}</option>)}</select> tag</span>{scopeSelect('tag', 'Reset level for tag')}{resetButton('tag', exerciseSummaries.filter((exercise) => exercise.tags.includes(selectedTag)).map((exercise) => exercise.id))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises between <input className="statistics-reset-number" type="number" min="0" aria-label="Youngest age in days" value={minimumAge} onChange={(event) => setMinimumAge(event.target.value)} /> and <input className="statistics-reset-number" type="number" min="0" aria-label="Oldest age in days" value={maximumAge} onChange={(event) => setMaximumAge(event.target.value)} /> days old</span>{scopeSelect('age', 'Reset level for age range')}{resetButton('age', idsForDateRange(Number(minimumAge) || 0, Number(maximumAge) || Number.POSITIVE_INFINITY))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises with <select className="statistics-reset-select" value={selectedDifficulty} onChange={(event) => setSelectedDifficulty(event.target.value)} aria-label="Difficulty"><option value="" disabled>Select difficulty</option><option value="E">Easy</option><option value="M">Medium</option><option value="D">Hard</option></select> difficulty</span>{scopeSelect('difficulty', 'Reset level for difficulty')}{resetButton('difficulty', exerciseSummaries.filter((exercise) => exercise.difficulty?.startsWith(selectedDifficulty)).map((exercise) => exercise.id))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset all exercises</span>{scopeSelect('all', 'Reset level for all exercises')}{resetButton('all', exerciseSummaries.map((exercise) => exercise.id))}</div>
      </div>
      {pendingReset ? <div className="statistics-reset-confirmation-backdrop" role="presentation"><div className="statistics-reset-confirmation" role="dialog" aria-modal="true" aria-labelledby="statistics-reset-confirmation-title"><div className="statistics-reset-confirmation-icon" aria-hidden="true">!</div><h3 id="statistics-reset-confirmation-title">Reset data?</h3><p>This action cannot be undone.</p><p className="statistics-reset-confirmation-detail">For the selected exercises, <b>all {pendingReset.level} data</b> will be permanently deleted.</p>{resetError ? <p className="statistics-reset-confirmation-error" role="alert">{resetError}</p> : null}<div className="statistics-reset-confirmation-actions"><button type="button" className="statistics-reset-cancel" disabled={resetting} onClick={() => setPendingReset(null)}>Cancel</button><button type="button" className="statistics-reset-proceed" disabled={resetting} onClick={() => void proceedWithReset()}>{resetting ? 'Resetting...' : 'Proceed'}</button></div></div></div> : null}
    </section>
  );
}

function exerciseLevel(exercise: ExerciseSummary): string {
  const tags = exercise.statistics_tags ?? exercise.tags;
  return tags.find((tag) => /^level [0-5]$/i.test(tag.trim()))?.trim() ?? '';
}

function MasteryListTab({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  // Only exercises with a statistics row have a difficulty value.
  const rows = exerciseSummaries
    .filter((exercise) => exercise.difficulty != null)
    .sort((left, right) => (right.mastery_index ?? 0) - (left.mastery_index ?? 0));
  const difficultyNames: Record<string, string> = { E: 'Easy', M: 'Medium', D: 'Difficult' };

  return (
    <div className="statistics-mastery-list">
      <table className="statistics-mastery-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Level</th>
            <th>Cheats</th>
            <th>Incorrect</th>
            <th>Confidence</th>
            <th>Difficulty</th>
            <th>Successes</th>
            <th>Time spent</th>
            <th>Mastery Index</th>
            <th>Due date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((exercise) => {
            const match = /^([EMD])(\d+)$/.exec(exercise.difficulty?.trim() ?? '');
            const due = parseExerciseDate(exercise.due_time);
            return (
              <tr key={exercise.id}>
                <td>{`${exercise.exercise_set ?? 'Unassigned'} / ${exercise.name ?? `Exercise ${exercise.id}`}`}</td>
                <td>{exerciseLevel(exercise)}</td>
                <td>{exerciseUsedCheats(exercise) ? 'yes' : 'no'}</td>
                <td>{exercise.incorrect_count ?? 0}</td>
                <td>{exercise.confidence ?? ''}</td>
                <td>{match ? difficultyNames[match[1]] : '--'}</td>
                <td>{match ? match[2] : '--'}</td>
                <td>{formatDuration(exercise.timer_total)}</td>
                <td>{(exercise.mastery_index ?? 0).toFixed(3)}</td>
                <td>{due ? due.toLocaleDateString() : ''}</td>
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
  const visibleLevels = levels
    .map((points, level) => ({ points, level }))
    .filter(({ points }) => points.length >= LEVEL_MIN_POINTS);
  const allSeconds = visibleLevels.flatMap(({ points }) => points.map((point) => point.seconds));
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
      {visibleLevels.length === 0 ? (
        <p>{`A level row appears once it has at least ${LEVEL_MIN_POINTS} timed exercises.`}</p>
      ) : (
        <div className="statistics-level-chart">
          {visibleLevels.map(({ points, level }) => {
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

export function StatisticsPanel({ isOpen, onClose, exerciseSummaries, selectedExerciseId, enableDelete = false, deleteProgression = false }: StatisticsPanelProps) {
  const [activeTab, setActiveTab] = useState<StatisticsTabId>('1');

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
            {activeTab === '1' ? <ProgressionTab exerciseSummaries={exerciseSummaries} /> : activeTab === '2' ? <ContributionGrid exerciseSummaries={exerciseSummaries} /> : activeTab === '3' ? <div className="statistics-progression-tab"><div className="statistics-graph-box"><TimeDistributionGraph exerciseSummaries={exerciseSummaries} /></div><div className="statistics-graph-box"><TimeOfDayDistributionGraph exerciseSummaries={exerciseSummaries} /></div></div> : activeTab === '4' ? <div className="statistics-progression-tab"><div className="statistics-graph-box"><LogbookDistributionGraph exerciseSummaries={exerciseSummaries} /></div><div className="statistics-graph-box"><DueDistributionGraph exerciseSummaries={exerciseSummaries} /></div><div className="statistics-graph-box"><SRReviewHistoryGraph /></div></div> : activeTab === '5' ? <ResetTab exerciseSummaries={exerciseSummaries} selectedExerciseId={selectedExerciseId} enableDelete={enableDelete} deleteProgression={deleteProgression} /> : activeTab === '6' ? <TempTab exerciseSummaries={exerciseSummaries} /> : activeTab === '7' ? <MasteryListTab exerciseSummaries={exerciseSummaries} /> : activeTab === '8' ? <div className="statistics-progression-tab"><div className="statistics-graph-box"><LevelAnalysisGraph exerciseSummaries={exerciseSummaries} /></div></div> : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
