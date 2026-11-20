import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchLogbookHistory, type ApiLogbookState } from '../../api/logbook';
import type { ExerciseSummary } from '../../api/exercises';
import type { Tag } from '../../api/tags';
import '../../panelStyles.css';
import { ResetTab } from './ResetTab';
import { LogbookDistributionGraph } from './charts/LogbookDistributionGraph';
import { DueDistributionGraph } from './charts/DueDistributionGraph';
import { SRReviewHistoryGraph } from './charts/SRReviewHistoryGraph';
import { TimeDistributionGraph } from './charts/TimeDistributionGraph';
import { RestDurationGraph } from './charts/RestDurationGraph';
import { BehaviourProfiles } from './charts/BehaviourProfiles';
import { TimeOfDayDistributionGraph } from './charts/TimeOfDayDistributionGraph';
import { LevelAnalysisGraph } from './charts/LevelAnalysisGraph';
import { ContributionGrid } from './charts/ContributionGrid';
import { ProgressionTab } from './charts/Progression';
import { exerciseUsedCheats, formatDuration, parseExerciseDate } from './statisticsData';

type StatisticsTabId = 'overview' | 'progression' | 'behaviour' | 'time' | 'levels' | 'mastery' | 'spaced' | 'reset';

type StatisticsTabProps = {
  exerciseSummaries: ExerciseSummary[];
  selectedExerciseId: number | null;
  activeTags: Tag[];
  enableDelete: boolean;
  deleteProgression: boolean;
  showCheatTags: boolean;
  logbooks: Record<string, ApiLogbookState[]>;
  logbooksLoading: boolean;
};
function OverviewTab({ exerciseSummaries }: StatisticsTabProps) {
  return <ContributionGrid exerciseSummaries={exerciseSummaries} />;
}

function TimeTab({ exerciseSummaries, logbooks, logbooksLoading }: StatisticsTabProps) {
  return <div className="statistics-progression-tab"><div className="statistics-graph-box"><LogbookDistributionGraph exerciseSummaries={exerciseSummaries} logbooks={logbooks} isLoading={logbooksLoading} /></div><div className="statistics-graph-box"><TimeDistributionGraph exerciseSummaries={exerciseSummaries} /></div><div className="statistics-graph-box"><RestDurationGraph exerciseSummaries={exerciseSummaries} logbooks={logbooks} isLoading={logbooksLoading} /></div></div>;
}

function SpacedTab({ exerciseSummaries }: StatisticsTabProps) {
  return <div className="statistics-progression-tab"><div className="statistics-graph-box"><DueDistributionGraph exerciseSummaries={exerciseSummaries} /></div><div className="statistics-graph-box"><SRReviewHistoryGraph /></div></div>;
}

function BehaviourTab({ exerciseSummaries, logbooks }: StatisticsTabProps) {
  return <div className="statistics-progression-tab"><div className="statistics-graph-box"><BehaviourProfiles exerciseSummaries={exerciseSummaries} logbooks={logbooks} /></div><div className="statistics-graph-box"><TimeOfDayDistributionGraph exerciseSummaries={exerciseSummaries} logbooks={logbooks} /></div></div>;
}

function LevelsTab({ exerciseSummaries }: StatisticsTabProps) {
  return <div className="statistics-progression-tab"><div className="statistics-graph-box"><LevelAnalysisGraph exerciseSummaries={exerciseSummaries} /></div></div>;
}

const TABS: Array<{ id: StatisticsTabId; label: React.ReactNode; Component: React.ComponentType<StatisticsTabProps> }> = [
  { id: 'overview', label: 'Exercise overview', Component: OverviewTab },
  { id: 'progression', label: 'Progression', Component: ProgressionTab },
  { id: 'behaviour', label: 'Study behaviour', Component: BehaviourTab },
  { id: 'time', label: 'Time distribution', Component: TimeTab },
  { id: 'levels', label: 'Level analysis', Component: LevelsTab },
  { id: 'mastery', label: 'Mastery List', Component: MasteryListTab },
  { id: 'spaced', label: 'Spaced repetition', Component: SpacedTab },
  { id: 'reset', label: 'Reset', Component: ResetTab },
];

type StatisticsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  exerciseSummaries: ExerciseSummary[];
  selectedExerciseId: number | null;
  activeTags?: Tag[];
  enableDelete?: boolean;
  deleteProgression?: boolean;
  showCheatTags?: boolean;
};

































































































// Same 30 s rounding and 10-60 minute range as the exercise time graph.












































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














export function StatisticsPanel({ isOpen, onClose, exerciseSummaries, selectedExerciseId, activeTags = [], enableDelete = false, deleteProgression = false, showCheatTags = false }: StatisticsPanelProps) {
  const [activeTab, setActiveTab] = useState<StatisticsTabId>('overview');
  const ActiveTab = TABS.find((tab) => tab.id === activeTab)?.Component;
  const [logbooks, setLogbooks] = useState<Record<string, ApiLogbookState[]>>({});
  const [logbooksLoading, setLogbooksLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let isCurrent = true;
    setLogbooksLoading(true);
    fetchLogbookHistory()
      .then((data) => {
        if (isCurrent) setLogbooks(data);
      })
      .catch(() => {
        if (isCurrent) setLogbooks({});
      })
      .finally(() => {
        if (isCurrent) setLogbooksLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [isOpen]);

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
            {ActiveTab ? <ActiveTab exerciseSummaries={exerciseSummaries} selectedExerciseId={selectedExerciseId} activeTags={activeTags} enableDelete={enableDelete} deleteProgression={deleteProgression} showCheatTags={showCheatTags} logbooks={logbooks} logbooksLoading={logbooksLoading} /> : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
