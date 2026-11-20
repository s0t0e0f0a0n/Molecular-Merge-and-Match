import type { ExerciseSummary } from '../../../api/exercises';
import { CONTRIBUTION_COLUMNS, CONTRIBUTION_STATUSES, contributionStatus, exerciseUsedCheats, formatDuration, parseExerciseDate } from '../statisticsData';

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
  const recentExercises = exerciseSummaries
    .map((exercise) => {
      const completedAt = parseExerciseDate(exercise.completed_at);
      const lastValidationAt = parseExerciseDate(exercise.last_validation_at);
      const startedAt = parseExerciseDate(exercise.started_at);
      const hasIncorrectAttempts = (exercise.incorrect_count ?? 0) > 0;
      if (!completedAt && !hasIncorrectAttempts) return null;

      const activityAt = [completedAt, lastValidationAt, hasIncorrectAttempts ? startedAt : null]
        .filter((date): date is Date => date !== null)
        .reduce((latest, date) => date > latest ? date : latest, new Date(0));
      return { exercise, activityAt, hasIncorrectAttempts };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => (
      right.activityAt.getTime() - left.activityAt.getTime()
      || Number(right.hasIncorrectAttempts) - Number(left.hasIncorrectAttempts)
    ));

  let streak = 0;
  for (const { exercise, hasIncorrectAttempts } of recentExercises) {
    if (hasIncorrectAttempts) break;
    if (!exercise.completed_at) continue;
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

export function ContributionGrid({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
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
