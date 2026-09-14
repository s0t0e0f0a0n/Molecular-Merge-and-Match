import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExerciseSummary } from '../../api/exercises';
import { fetchAllLogbooks } from '../../api/logbook';
import { resetExercises, type ResetLevel } from '../../api/reset';
import { fetchTags, type Tag } from '../../api/tags';
import '../../panelStyles.css';

type StatisticsTabId = '1' | '2' | '3' | '4' | '5';

type StatisticsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  exerciseSummaries: ExerciseSummary[];
  selectedExerciseId: number | null;
};
// tab 1 contains progression overview and graph.
// tab 2 contains timing tables
// tab 3 contains timing graphs
// tab 4 contains advanced statistics 
// tab 5 conatins the reset functions
const TABS: Array<{ id: StatisticsTabId; label: string }> = [
  { id: '1', label: 'Progression' },
  { id: '2', label: 'Table' },
  { id: '3', label: 'Time distribution' },
  { id: '4', label: 'Advanced' },
  { id: '5', label: 'Reset' },
];

const CONTRIBUTION_STATUSES = [
  { color: 'green', label: 'Completed and correct' },
  { color: 'red', label: 'Attempted and incorrect' },
  { color: 'yellow', label: 'Completed with cheats activated' },
  { color: 'blue', label: 'Started but incomplete' },
  { color: 'grey', label: 'Examples or References set' },
  { color: 'white', label: 'Not attempted' },
] as const;

const CONTRIBUTION_COLUMNS = 20;

function contributionStatus(exercise: ExerciseSummary): string {
  const exerciseSet = exercise.exercise_set?.trim().toLowerCase();
  const usedCheats = exercise.cheats_used?.startsWith('1') ?? false;
  if (exerciseSet === 'examples' || exerciseSet === 'references') return 'is-grey';
  if (!exercise.completed_at && (exercise.incorrect_count ?? 0) > 0) return 'is-red';
  if (exercise.completed_at) return usedCheats ? 'is-yellow' : 'is-green';
  if ((exercise.timer_total ?? 0) > 0 && !exercise.completed_at) return 'is-blue';
  return 'is-white';
}

type TimelineStatus = 'is-green' | 'is-yellow' | 'is-red' | 'is-blue';

type TimelineDay = {
  date: Date;
  counts: Record<TimelineStatus, number>;
};

const TIMELINE_STATUSES: Array<{ key: TimelineStatus; label: string }> = [
  { key: 'is-green', label: 'Completed and correct' },
  { key: 'is-yellow', label: 'Completed with cheats activated' },
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
      counts: { 'is-green': 0, 'is-yellow': 0, 'is-red': 0, 'is-blue': 0 },
    });
  }

  const dayByKey = new Map(days.map((day) => [localDateKey(day.date), day]));
  exerciseSummaries.forEach((exercise) => {
    const date = parseExerciseDate(exercise.completed_at ?? exercise.started_at);
    const status = contributionStatus(exercise) as TimelineStatus;
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

function buildLogbookDistribution(
  exerciseSummaries: ExerciseSummary[],
  logbooks: Record<string, { entries_json: string }>,
): LogbookDistributionBucket[] {
  const buckets = Array.from({ length: LOGBOOK_BIN_COUNT }, () => ({
    createFragment: 0,
    link: 0,
    mergeFragments: 0,
  }));
  const eventKinds = new Set(['create-fragment', 'link', 'merge-fragments']);

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

      const duration = completedAt.getTime() - startedAt.getTime();
      entries.forEach((entry) => {
        if (!eventKinds.has(entry.kind ?? '')) return;
        const timestamp = parseLogbookTimestamp(entry.ts);
        if (timestamp === null || timestamp < startedAt.getTime() || timestamp > completedAt.getTime()) return;
        const normalizedPosition = (timestamp - startedAt.getTime()) / duration;
        const bucket = buckets[Math.min(LOGBOOK_BIN_COUNT - 1, Math.floor(normalizedPosition * LOGBOOK_BIN_COUNT))];
        if (entry.kind === 'create-fragment') bucket.createFragment += 1;
        if (entry.kind === 'link') bucket.link += 1;
        if (entry.kind === 'merge-fragments') bucket.mergeFragments += 1;
      });
    });

  return buckets;
}

function LogbookDistributionGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const [logbooks, setLogbooks] = useState<Record<string, { entries_json: string }>>({});
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
    ...buckets.map((bucket) => bucket.createFragment + bucket.link + bucket.mergeFragments),
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
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-logbook-chart">
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
            <div className="statistics-logbook-distribution" style={{ '--timeline-days': buckets.length } as React.CSSProperties}>
              {buckets.map((bucket, index) => {
                const total = bucket.createFragment + bucket.link + bucket.mergeFragments;
                return (
                  <div key={index} className="statistics-logbook-bin" title={`${index * 5}-${(index + 1) * 5}%: ${total} event${total === 1 ? '' : 's'}`}>
                    <div className="statistics-timeline-bar" aria-label={`${index * 5}-${(index + 1) * 5}%: ${total} events`}>
                      <span className="statistics-timeline-segment statistics-logbook-create" style={{ height: `${(bucket.createFragment / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-link" style={{ height: `${(bucket.link / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-merge" style={{ height: `${(bucket.mergeFragments / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-logbook-label">{index % 5 === 0 ? `${index * 5}%` : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
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
              {exercise.cheats_used?.startsWith('1') ? (
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
              exercises={trackedExercises.filter((exercise) => exercise.tags.includes(tag.tag_name))}
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

function ResetTab({ exerciseSummaries, selectedExerciseId }: { exerciseSummaries: ExerciseSummary[]; selectedExerciseId: number | null }) {
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
    if (exerciseIds.length === 0 || level === '') return;
    setResetError(null);
    setPendingReset({ exerciseIds, level });
  };

  const proceedWithReset = async () => {
    if (!pendingReset || resetting) return;
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
      <option value="progression">Progression data</option>
      <option value="exercise">Exercise</option>
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

export function StatisticsPanel({ isOpen, onClose, exerciseSummaries, selectedExerciseId }: StatisticsPanelProps) {
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
      <div className="settings-panel-surface" role="dialog" aria-modal="true" aria-label="Statistics panel">
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
            {activeTab === '1' ? <ProgressionTab exerciseSummaries={exerciseSummaries} /> : activeTab === '2' ? <ContributionGrid exerciseSummaries={exerciseSummaries} /> : activeTab === '3' ? <TimeDistributionGraph exerciseSummaries={exerciseSummaries} /> : activeTab === '4' ? <LogbookDistributionGraph exerciseSummaries={exerciseSummaries} /> : activeTab === '5' ? <ResetTab exerciseSummaries={exerciseSummaries} selectedExerciseId={selectedExerciseId} /> : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}