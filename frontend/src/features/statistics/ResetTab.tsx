import { useEffect, useState } from 'react';
import type { ExerciseSummary } from '../../api/exercises';
import { resetDueExercises, resetExercises, type ResetLevel } from '../../api/reset';
import type { Tag } from '../../api/tags';
import { exerciseUsedCheats, parseExerciseDate } from './statisticsData';

type ResetRowId = 'current' | 'set' | 'tag' | 'age' | 'difficulty' | 'all';

export function ResetTab({ exerciseSummaries: allExerciseSummaries, selectedExerciseId, activeTags, enableDelete, deleteProgression, showCheatTags }: { exerciseSummaries: ExerciseSummary[]; selectedExerciseId: number | null; activeTags: Tag[]; enableDelete: boolean; deleteProgression: boolean; showCheatTags: boolean }) {
  // Only exercises with a statistics row can be reset (seeded examples/references have none), except for full deletion.
  const exerciseSummaries = allExerciseSummaries.filter((exercise) => exercise.has_statistics === true);
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
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises with the <select className="statistics-reset-select" value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} aria-label="Tag"><option value="" disabled>Select tag</option>{activeTags.filter((tag) => showCheatTags || !tag.is_cheat).map((tag) => <option key={tag.id} value={tag.tag_name}>{tag.tag_name}</option>)}</select> tag</span>{scopeSelect('tag', 'Reset level for tag')}{resetButton('tag', listFor('tag').filter((exercise) => exercise.tags.includes(selectedTag)).map((exercise) => exercise.id))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises between <input className="statistics-reset-number" type="number" min="0" aria-label="Youngest age in days" value={minimumAge} onChange={(event) => setMinimumAge(event.target.value)} /> and <input className="statistics-reset-number" type="number" min="0" aria-label="Oldest age in days" value={maximumAge} onChange={(event) => setMaximumAge(event.target.value)} /> days old</span>{scopeSelect('age', 'Reset level for age range')}{resetButton('age', idsForDateRange(Number(minimumAge) || 0, Number(maximumAge) || Number.POSITIVE_INFINITY))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset exercises with <select className="statistics-reset-select" value={selectedDifficulty} onChange={(event) => setSelectedDifficulty(event.target.value)} aria-label="Difficulty"><option value="" disabled>Select difficulty</option><option value="E">Easy</option><option value="M">Medium</option><option value="D">Hard</option></select> difficulty</span>{scopeSelect('difficulty', 'Reset level for difficulty')}{resetButton('difficulty', listFor('difficulty').filter((exercise) => exercise.difficulty?.startsWith(selectedDifficulty)).map((exercise) => exercise.id))}</div>
        <div className="statistics-reset-row"><span className="statistics-reset-inline-content">Reset all exercises</span>{scopeSelect('all', 'Reset level for all exercises')}{resetButton('all', listFor('all').map((exercise) => exercise.id))}</div>
      </div>
      {pendingReset ? <div className="statistics-reset-confirmation-backdrop" role="presentation"><div className="statistics-reset-confirmation" role="dialog" aria-modal="true" aria-labelledby="statistics-reset-confirmation-title"><div className="statistics-reset-confirmation-icon" aria-hidden="true">!</div><h3 id="statistics-reset-confirmation-title">Reset data?</h3><p>This action cannot be undone.</p><p className="statistics-reset-confirmation-detail">For the selected exercises, <b>all {pendingReset.level} data</b> will be permanently deleted.</p>{resetError ? <p className="statistics-reset-confirmation-error" role="alert">{resetError}</p> : null}<div className="statistics-reset-confirmation-actions"><button type="button" className="statistics-reset-cancel" disabled={resetting} onClick={() => setPendingReset(null)}>Cancel</button><button type="button" className="statistics-reset-proceed" disabled={resetting} onClick={() => void proceedWithReset()}>{resetting ? 'Resetting...' : 'Proceed'}</button></div></div></div> : null}
    </section>
  );
}
