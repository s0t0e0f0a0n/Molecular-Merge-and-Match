import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExerciseSummary } from '../../api/exercises';
import { fetchTags, type Tag } from '../../api/tags';
import '../../panelStyles.css';

type StatisticsTabId = '1' | '2';

type StatisticsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  exerciseSummaries: ExerciseSummary[];
};

const TABS: Array<{ id: StatisticsTabId; label: string }> = [
  { id: '1', label: 'Progression' },
  { id: '2', label: 'Table' },
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

function isTrackedExerciseSet(exercise: ExerciseSummary): boolean {
  const exerciseSet = exercise.exercise_set?.trim().toLowerCase();
  return exerciseSet !== 'examples' && exerciseSet !== 'references';
}

function ProgressionBar({ title, exercises, layout = 'stacked' }: { title: string; exercises: ExerciseSummary[]; layout?: 'stacked' | 'row' }) {
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
      <div className="statistics-progression-row">
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
      <ProgressionBar title="Total progression" exercises={trackedExercises} layout="row" />
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
      <div className="statistics-progression-tab-box">Placeholder</div>
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
                title={exercise ? `${exercise.exercise_set ?? 'Unassigned'} / ${exercise.name ?? `Exercise ${exercise.id}`}` : undefined}
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
          <RankedExerciseList title="Most incorrect answers" exercises={mostIncorrectExercises} includeIncorrectCount />
        </div>
      </div>
    </div>
  );
}

function CsvIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 3.5h10l6 6V20.5H4v-17Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 3.5v6h6M7 13h10M7 16h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function StatisticsPanel({ isOpen, onClose, exerciseSummaries }: StatisticsPanelProps) {
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
            <span aria-label="CSV" title="CSV">
              <CsvIcon />
            </span>
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
            {activeTab === '1' ? <ProgressionTab exerciseSummaries={exerciseSummaries} /> : <ContributionGrid exerciseSummaries={exerciseSummaries} />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}