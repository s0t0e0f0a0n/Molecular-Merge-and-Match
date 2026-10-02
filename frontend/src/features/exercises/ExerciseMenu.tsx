import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExerciseSummary } from '../../api/exercises';
import type { Tag } from '../../api/tags';
import { deferExerciseAfterSkip } from '../../api/spacedrep';
import { ExerciseCreationForm } from './ExerciseCreationForm';
import { ExerciseZipImport } from './ExerciseZipImport';
import { formatChemistryText } from '../../utils/formatChemistryText';

const exerciseNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export type ExerciseMenuProps = {
  srMode: boolean;
  onSetSrMode: (enabled: boolean) => Promise<void>;
  selectedExerciseId: number | null;
  exerciseSummaries: ExerciseSummary[];
  activeTags: Tag[];
  loadingExerciseSummaries: boolean;
  exerciseSummariesError: string | null;
  showCheatTags: boolean;
  showCreation: boolean;
  onSelectExercise: (id: number) => void;
  onExercisesMutated: () => Promise<void>;
  onDeleteExercises: (ids: number[]) => Promise<number[]>;
  onResetExercise: () => void;
};

export function ExerciseMenu({
  srMode,
  onSetSrMode,
  selectedExerciseId,
  exerciseSummaries,
  activeTags,
  loadingExerciseSummaries,
  exerciseSummariesError,
  showCheatTags,
  showCreation,
  onSelectExercise,
  onExercisesMutated,
  onDeleteExercises,
  onResetExercise,
}: ExerciseMenuProps) {
  const [exerciseMenuOpen, setExerciseMenuOpen] = useState(false);
  const [creationFormOpen, setCreationFormOpen] = useState(false);
  const [expandedExerciseSets, setExpandedExerciseSets] = useState<string[]>([]);
  const [activeSetFilters, setActiveSetFilters] = useState<string[]>([]);
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);
  const [tagFilterMode, setTagFilterMode] = useState<'AND' | 'OR'>('AND');
  const [deletionMode, setDeletionMode] = useState(false);
  const [skippingExercise, setSkippingExercise] = useState(false);
  const [savingSrMode, setSavingSrMode] = useState(false);
  const [srFinishedDialogDismissed, setSrFinishedDialogDismissed] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const exerciseMenuCloseTimer = useRef<number | null>(null);
  const zipImportingRef = useRef(false);
  const exerciseMenuRef = useRef<HTMLDivElement | null>(null);

  const normalizeExerciseSet = useCallback((value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : 'Unassigned';
  }, []);

  const getExerciseSummaryLabel = useCallback(
    (exercise: ExerciseSummary) => exercise.name ?? `Exercise ${exercise.id}`,
    [],
  );

  const renderExerciseSummaryLabel = useCallback(
    (exercise: ExerciseSummary) => {
      const label = getExerciseSummaryLabel(exercise);
      return exercise.exercise_set?.trim().toLowerCase() === 'references'
        ? formatChemistryText(label)
        : label;
    },
    [getExerciseSummaryLabel],
  );

  const scheduleExerciseMenuClose = useCallback(() => {
    if (creationFormOpen || zipImportingRef.current) return;
    if (exerciseMenuCloseTimer.current) window.clearTimeout(exerciseMenuCloseTimer.current);
    const delay = deletionMode ? 1000 : 150;
    exerciseMenuCloseTimer.current = window.setTimeout(() => setExerciseMenuOpen(false), delay);
  }, [creationFormOpen, deletionMode]);

  const cancelExerciseMenuClose = useCallback(() => {
    if (exerciseMenuCloseTimer.current) {
      window.clearTimeout(exerciseMenuCloseTimer.current);
      exerciseMenuCloseTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!exerciseMenuOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (exerciseMenuRef.current && !exerciseMenuRef.current.contains(event.target as Node)) {
        setExerciseMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [exerciseMenuOpen]);

  useEffect(() => {
    if (!exerciseMenuOpen || selectedExerciseId === null) return;
    const selected = exerciseSummaries.find((exercise) => exercise.id === selectedExerciseId);
    if (!selected) return;
    const setName = normalizeExerciseSet(selected.exercise_set);
    setExpandedExerciseSets((previous) => (
      previous.includes(setName) ? previous : [...previous, setName]
    ));
  }, [exerciseMenuOpen, selectedExerciseId, exerciseSummaries, normalizeExerciseSet]);

  useEffect(() => {
    if (!showCreation) setCreationFormOpen(false);
  }, [showCreation]);

  useEffect(() => {
    if (!srMode) return;
    setDeletionMode(false);
    setSelectedForDeletion(new Set());
    setCreationFormOpen(false);
  }, [srMode]);

  const exercisesByDueTime = useMemo(() => [...exerciseSummaries].sort((a, b) => {
    const aDueTime = a.due_time ? Date.parse(a.due_time) : Number.POSITIVE_INFINITY;
    const bDueTime = b.due_time ? Date.parse(b.due_time) : Number.POSITIVE_INFINITY;
    return aDueTime - bDueTime || a.id - b.id;
  }), [exerciseSummaries]);
  const pastExercises = useMemo(
    () => exercisesByDueTime.filter((exercise) => {
      const dueTime = exercise.due_time?.trim();
      if (!dueTime || Number(dueTime) === 0) return false;
      return Number.isFinite(Date.parse(dueTime));
    }),
    [exercisesByDueTime],
  );
  const nextExercises = useMemo(
    () => exerciseSummaries
      .filter((exercise) => {
        if (exercise.completed !== false || (exercise.in_SR ?? 0) <= 0) return false;
        const dueTime = exercise.due_time?.trim();
        if (!dueTime) return true;
        if (Number(dueTime) === 0) return false;
        const dueTimestamp = Date.parse(dueTime);
        return Number.isFinite(dueTimestamp) && dueTimestamp < Date.now();
      })
      .sort((a, b) => (a.in_SR ?? 0) - (b.in_SR ?? 0) || a.id - b.id),
    [exerciseSummaries],
  );

  const handleSetSrMode = useCallback(async (enabled: boolean) => {
    if (savingSrMode) return;
    setSavingSrMode(true);
    try {
      await onSetSrMode(enabled);
    } catch (error) {
      console.error('failed to update spaced repetition mode', error);
    } finally {
      setSavingSrMode(false);
    }
  }, [onSetSrMode, savingSrMode]);

  const handleGoToNextExercise = useCallback(async () => {
    if (skippingExercise || nextExercises.length === 0) return;
    setSkippingExercise(true);
    try {
      const selectedExercise = exerciseSummaries.find((exercise) => exercise.id === selectedExerciseId);
      if (selectedExerciseId !== null && (selectedExercise?.in_SR ?? 0) !== 0) {
        await deferExerciseAfterSkip(selectedExerciseId);
      }
      await onExercisesMutated();
      const currentIndex = nextExercises.findIndex((exercise) => exercise.id === selectedExerciseId);
      const remainingExercises = nextExercises.filter((exercise) => exercise.id !== selectedExerciseId);
      const nextExercise = currentIndex >= 0
        ? nextExercises.slice(currentIndex + 1).find((exercise) => exercise.id !== selectedExerciseId)
          ?? remainingExercises[0]
        : remainingExercises[0];
      if (nextExercise) onSelectExercise(nextExercise.id);
    } catch (error) {
      console.error('failed to defer skipped exercise', error);
    } finally {
      setSkippingExercise(false);
    }
  }, [exerciseSummaries, nextExercises, onExercisesMutated, onSelectExercise, selectedExerciseId, skippingExercise]);

  const formatDueTime = useCallback((value: string | null | undefined) => {
    if (!value) return 'Not scheduled';
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 'Not scheduled' : new Date(timestamp).toLocaleString();
  }, []);

  const exerciseSetOptions = useMemo(() => {
    const setNames = new Set<string>();
    for (const exercise of exerciseSummaries) {
      setNames.add(normalizeExerciseSet(exercise.exercise_set));
    }
    return Array.from(setNames).sort((a, b) => a.localeCompare(b));
  }, [exerciseSummaries, normalizeExerciseSet]);

  const tagOptions = useMemo(() => {
    const activeTagNames = new Set(
      activeTags
        .filter((tag) => !tag.is_hidden)
        .map((tag) => tag.tag_name.toLocaleLowerCase()),
    );
    const cheatTagNames = new Set(
      activeTags.filter((tag) => tag.is_cheat).map((tag) => tag.tag_name.toLocaleLowerCase()),
    );
    const tags = new Set<string>();
    for (const exercise of exerciseSummaries) {
      for (const tag of exercise.statistics_tags ?? exercise.tags) {
        const normalizedTag = tag.toLocaleLowerCase();
        if (activeTagNames.has(normalizedTag) && (showCheatTags || !cheatTagNames.has(normalizedTag))) {
          tags.add(tag);
        }
      }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [activeTags, exerciseSummaries, showCheatTags]);

  useEffect(() => {
    const allowedTagNames = new Set(
      activeTags
        .filter((tag) => !tag.is_hidden && (showCheatTags || !tag.is_cheat))
        .map((tag) => tag.tag_name.toLocaleLowerCase()),
    );
    setActiveTagFilters((previous) =>
      previous.filter((tag) => allowedTagNames.has(tag.toLocaleLowerCase())),
    );
  }, [activeTags, showCheatTags]);

  const exercisesBySet = useMemo(() => {
    const matchesSet = (setName: string) =>
      activeSetFilters.length === 0 || activeSetFilters.includes(setName);
    const matchesCompletion = (exercise: ExerciseSummary) =>
      !showOnlyIncomplete || exercise.completed !== true;
    const matchesTags = (tags: string[]) => {
      if (activeTagFilters.length === 0) return true;
      if (tagFilterMode === 'AND') {
        return activeTagFilters.every((filter) => tags.includes(filter));
      }
      return tags.some((tag) => activeTagFilters.includes(tag));
    };

    const map = new Map<string, ExerciseSummary[]>();
    for (const exercise of exerciseSummaries) {
      const setName = normalizeExerciseSet(exercise.exercise_set);
      if (!matchesSet(setName) || !matchesCompletion(exercise) || !matchesTags(exercise.tags)) continue;
      const list = map.get(setName) ?? [];
      list.push(exercise);
      map.set(setName, list);
    }

    return Array.from(map.entries())
      .map(([setName, exercises]) => ({
        setName,
        exercises: [...exercises].sort((a, b) => {
          const nameOrder = exerciseNameCollator.compare(
            getExerciseSummaryLabel(a),
            getExerciseSummaryLabel(b),
          );
          return nameOrder !== 0 ? nameOrder : a.id - b.id;
        }),
      }))
      .sort((a, b) => a.setName.localeCompare(b.setName));
  }, [
    exerciseSummaries,
    activeSetFilters,
    activeTagFilters,
    showOnlyIncomplete,
    tagFilterMode,
    normalizeExerciseSet,
    getExerciseSummaryLabel,
  ]);

  const toggleSetForDeletion = useCallback((setName: string) => {
    const exerciseIds = new Set(
      exercisesBySet.find((set) => set.setName === setName)?.exercises.map((exercise) => `ex-${exercise.id}`) ?? [],
    );
    setSelectedForDeletion((previous) => {
      const next = new Set(previous);
      const allSelected = exerciseIds.size > 0
        && Array.from(exerciseIds).every((id) => next.has(id));
      if (allSelected) {
        exerciseIds.forEach((id) => next.delete(id));
      } else {
        exerciseIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [exercisesBySet]);

  const handleDeleteSelected = useCallback(async () => {
    const ok = window.confirm(
      `Delete ${selectedForDeletion.size} item${selectedForDeletion.size !== 1 ? 's' : ''}? This cannot be undone.`,
    );
    if (!ok) return;

    const exerciseIds = Array.from(selectedForDeletion)
      .filter((id) => id.startsWith('ex-'))
      .map((id) => Number(id.slice(3)));
    const failed = await onDeleteExercises(exerciseIds);

    setSelectedForDeletion(new Set());
    setDeletionMode(false);
    if (failed.length > 0) alert(`Failed to delete: ${failed.join(', ')}`);
  }, [selectedForDeletion, onDeleteExercises]);

  const toggleExpandedSet = (setName: string) => {
    setExpandedExerciseSets((previous) => (
      previous.includes(setName)
        ? previous.filter((name) => name !== setName)
        : [...previous, setName]
    ));
  };

  const toggleSetFilter = (setName: string) => {
    setActiveSetFilters((previous) => (
      previous.includes(setName)
        ? previous.filter((name) => name !== setName)
        : [...previous, setName]
    ));
  };

  const toggleTagFilter = (tag: string) => {
    setActiveTagFilters((previous) => (
      previous.includes(tag)
        ? previous.filter((name) => name !== tag)
        : [...previous, tag]
    ));
  };

  const toggleDeleteSelection = (id: string) => {
    setSelectedForDeletion((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      ref={exerciseMenuRef}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, zIndex: 50 }}
      onMouseLeave={scheduleExerciseMenuClose}
      onMouseEnter={cancelExerciseMenuClose}
    >
      <button
        type="button"
        onClick={() => setExerciseMenuOpen((open) => !open)}
        onMouseLeave={scheduleExerciseMenuClose}
        onMouseEnter={cancelExerciseMenuClose}
        style={{
          color: '#111', width: 200, borderRadius: 12, height: 36, border: '1px solid #111',
          background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8, padding: '0px 12px', whiteSpace: 'nowrap',
          boxShadow: exerciseMenuOpen ? '0 4px 14px rgba(0,0,0,0.08)' : 'none',
        }}
        title={exerciseMenuOpen ? 'Hide exercises' : 'Show exercises'}
        data-testid="exercise-menu-button"
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {loadingExerciseSummaries
              ? 'Loading…'
              : (exerciseSummaries.find((exercise) => exercise.id === selectedExerciseId)
                ? renderExerciseSummaryLabel(exerciseSummaries.find((exercise) => exercise.id === selectedExerciseId)!)
                : 'Exercises')}
          </span>
          {exerciseSummaries.find((exercise) => exercise.id === selectedExerciseId)?.completed === true ? (
            <span aria-hidden="true" style={{ color: '#16a34a', fontWeight: 700, marginLeft: 8, flexShrink: 0 }}>{'\u2714'}</span>
          ) : null}
        </span>
        <span style={{ fontSize: 12 }}>{exerciseMenuOpen ? '▲' : '▼'}</span>
      </button>

      {!srMode && (
        <button
          type="button"
          onClick={onResetExercise}
          title="Reset this exercise"
          style={{ background: 'none', border: 'none', padding: '1px 3px', cursor: 'pointer', fontSize: 14, color: '#b33', lineHeight: 1, borderRadius: 4 }}
        >
          {'\u21BA'}
        </button>
      )}

      <div
        onMouseEnter={cancelExerciseMenuClose}
        onMouseLeave={scheduleExerciseMenuClose}
        style={{
          position: 'absolute', top: 44, right: 0, width: 680, maxWidth: '90vw', maxHeight: '85vh',
          overflow: 'auto', borderRadius: 12, border: '1px solid #ddd', background: 'white', padding: 12,
          display: exerciseMenuOpen ? 'flex' : 'none', flexDirection: 'column', gap: 8,
          boxShadow: '0 12px 30px rgba(0,0,0,0.12)', zIndex: 60,
          pointerEvents: exerciseMenuOpen ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Exercises</div>
          {!srMode && <button
            type="button"
            onClick={() => {
              setDeletionMode((mode) => !mode);
              setSelectedForDeletion(new Set());
            }}
            title={deletionMode ? 'Cancel deletion' : 'Delete exercises'}
            style={{ background: 'none', border: 'none', padding: '2px 2px', cursor: 'pointer', lineHeight: 1, borderRadius: 4, opacity: deletionMode ? 1 : 0.6, display: 'flex', alignItems: 'center' }}
          >
            <img src={`${import.meta.env.BASE_URL}chemisch_afval.svg`} alt="Delete" style={{ width: 16, height: 16 }} />
          </button>}
        </div>

        {srMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
            <button
              type="button"
              onClick={handleGoToNextExercise}
              disabled={nextExercises.length === 0 || skippingExercise}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #111', background: '#111', color: '#fff', cursor: nextExercises.length === 0 || skippingExercise ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: nextExercises.length === 0 || skippingExercise ? 0.55 : 1 }}
            >
              Go to next exercise
            </button>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Past exercises</div>
            {loadingExerciseSummaries ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Loading exercises...</div>
            ) : exerciseSummariesError ? (
              <div style={{ fontSize: 12, color: '#b30000' }}>{exerciseSummariesError}</div>
            ) : pastExercises.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>No past exercises.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '52vh', overflowY: 'auto' }}>
                {pastExercises.map((exercise) => (
                  <div key={exercise.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 10px', borderBottom: '1px solid #eee', fontSize: 13 }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{renderExerciseSummaryLabel(exercise)}</span>
                    <span style={{ flexShrink: 0, fontSize: 12, opacity: 0.65 }}>Due: {formatDueTime(exercise.due_time)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : <div style={{ display: creationFormOpen ? 'none' : 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12 }}>
          <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 10, background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Exercise sets</div>
            <div style={{ flex: 1, minHeight: 0, maxHeight: '52vh', overflowY: 'auto', scrollbarGutter: 'stable', paddingRight: 4 }}>
              {loadingExerciseSummaries ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>Loading exercises...</div>
              ) : exerciseSummariesError ? (
                <div style={{ fontSize: 12, color: '#b30000' }}>{exerciseSummariesError}</div>
              ) : exerciseSummaries.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>No exercises found.</div>
              ) : exercisesBySet.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>No exercises match the current filters.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {exercisesBySet.map(({ setName, exercises }) => {
                    const expanded = expandedExerciseSets.includes(setName);
                    const selectedExerciseCount = exercises.filter((exercise) => (
                      selectedForDeletion.has(`ex-${exercise.id}`)
                    )).length;
                    const allExercisesSelected = exercises.length > 0
                      && selectedExerciseCount === exercises.length;
                    const allSetExercisesCompleted = exerciseSummaries
                      .filter((exercise) => normalizeExerciseSet(exercise.exercise_set) === setName)
                      .every((exercise) => exercise.completed === true);
                    return (
                      <div key={setName} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {deletionMode && (
                            <input
                              type="checkbox"
                              checked={allExercisesSelected}
                              ref={(input) => {
                                if (input) input.indeterminate = selectedExerciseCount > 0 && !allExercisesSelected;
                              }}
                              onChange={() => toggleSetForDeletion(setName)}
                              style={{ cursor: 'pointer' }}
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                            <button
                              type="button"
                              onClick={() => deletionMode ? toggleSetForDeletion(setName) : toggleExpandedSet(setName)}
                              style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '8px 10px', borderRadius: '8px 0 0 8px', border: '1px solid #d8d8d8', borderRight: 0, background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>{setName}</span>
                                {allSetExercisesCompleted ? <span aria-label="Exercise set completed" style={{ color: '#238636', fontWeight: 700 }}>{'\u2714'}</span> : null}
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${setName}`}
                              aria-expanded={expanded}
                              onClick={() => toggleExpandedSet(setName)}
                              style={{ padding: '8px 10px', borderRadius: '0 8px 8px 0', border: '1px solid #d8d8d8', background: 'white', cursor: 'pointer', fontSize: 11 }}
                            >
                              {expanded ? '▲' : '▼'}
                            </button>
                          </div>
                        </div>
                        {expanded ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 10 }}>
                            {exercises.map((exercise) => (
                              <div key={exercise.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {deletionMode && (
                                  <input type="checkbox" checked={selectedForDeletion.has(`ex-${exercise.id}`)} onChange={() => toggleDeleteSelection(`ex-${exercise.id}`)} style={{ cursor: 'pointer' }} />
                                )}
                                <button
                                  type="button"
                                  onClick={() => deletionMode ? toggleDeleteSelection(`ex-${exercise.id}`) : onSelectExercise(exercise.id)}
                                  style={{ flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', background: selectedExerciseId === exercise.id ? '#111' : '#f9f9f9', color: selectedExerciseId === exercise.id ? '#fff' : '#111', cursor: 'pointer', fontSize: 13 }}
                                >
                                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <span>{renderExerciseSummaryLabel(exercise)}</span>
                                    {exercise.completed === true && Boolean(exercise.completed_at && exercise.completed_at !== '0') ? (
                                      <svg aria-hidden="true" viewBox="0 0 16 16" version="1.1" width="16" height="16" style={{ fill: '#238636', flexShrink: 0, display: 'inline-block', verticalAlign: 'text-bottom' }}>
                                        <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z"></path>
                                      </svg>
                                    ) : /^(?:E|M|H|O)\d+$/.test(exercise.difficulty ?? '') && Number(exercise.difficulty?.slice(1)) !== 0 ? (
                                      <span aria-label="Exercise completed" style={{ color: '#238636', fontWeight: 700, flexShrink: 0 }}>{'\u2713'}</span>
                                    ) : exercise.incorrect_count != null && exercise.incorrect_count > 0 ? (
                                      /* Failed before */
                                      <svg
                                        aria-hidden="true"
                                        viewBox="0 0 16 16"
                                        version="1.1"
                                        width="16"
                                        height="16"
                                        style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'text-bottom' }}
                                      >
                                        <circle cx="8" cy="8" r="7" fill="#ffffff" />
                                        <path
                                          fill="#f85149"
                                          d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z"
                                        />
                                      </svg>
                                    ) : exercise.incorrect_count === 0 && (exercise.timer_total ?? 0) > 0 && exercise.has_saved_progress === true ? (
                                      /* incomplete */
                                      <svg
                                        aria-hidden="true"
                                        viewBox="0 0 16 16"
                                        version="1.1"
                                        width="16"
                                        height="16"
                                        style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'text-bottom' }}
                                      >
                                        <circle cx="8" cy="8" r="7" fill="#ffffff" />
                                        <path
                                          fill="#3b82f6"
                                          d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16ZM4.25 7.25a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Z"
                                        />
                                      </svg>
                                    ) : null}
                                  </div>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 10, background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, maxHeight: 'calc(52vh + 48px)', boxSizing: 'border-box', alignSelf: 'start' }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Filters</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <input type="checkbox" checked={showOnlyIncomplete} onChange={(event) => setShowOnlyIncomplete(event.target.checked)} />
              <span>Show only incomplete exercises</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Exercise sets</div>
              {exerciseSetOptions.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>No sets available.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto', paddingRight: 4 }}>
                  {exerciseSetOptions.map((setName) => (
                    <label key={`set-${setName}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <input type="checkbox" checked={activeSetFilters.includes(setName)} onChange={() => toggleSetFilter(setName)} />
                      <span>{setName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Tags</div>
                <button type="button" onClick={() => setTagFilterMode((mode) => mode === 'AND' ? 'OR' : 'AND')} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #ccc', background: '#f0f0f0', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>{tagFilterMode}</button>
              </div>
              {tagOptions.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>No tags available.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable', paddingRight: 4 }}>
                  {tagOptions.map((tag) => (
                    <label key={`tag-${tag}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <input type="checkbox" checked={activeTagFilters.includes(tag)} onChange={() => toggleTagFilter(tag)} />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>}

        {srMode && !srFinishedDialogDismissed && !loadingExerciseSummaries && !exerciseSummariesError && nextExercises.length === 0 ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0, 0, 0, 0.35)', display: 'grid', placeItems: 'center', padding: 16 }}>
            <div role="dialog" aria-modal="true" aria-labelledby="sr-finished-title" style={{ width: 'min(420px, 100%)', background: 'white', border: '1px solid #ccc', borderRadius: 8, padding: 20, boxShadow: '0 12px 32px rgba(0,0,0,0.22)' }}>
              <h2 id="sr-finished-title" style={{ margin: '0 0 12px', fontSize: 18 }}>Done for today</h2>
              <p style={{ margin: '0 0 18px', fontSize: 14 }}>Do you want to switch to normal mode or stay in spaced repetition mode?</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" disabled={savingSrMode} onClick={() => void handleSetSrMode(false)} style={{ padding: '8px 12px', border: '1px solid #aaa', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Switch to normal mode</button>
                <button type="button" disabled={savingSrMode} onClick={() => setSrFinishedDialogDismissed(true)} style={{ padding: '8px 12px', border: '1px solid #111', borderRadius: 6, background: '#111', color: '#fff', cursor: 'pointer' }}>Stay in spaced repetition</button>
              </div>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: creationFormOpen ? 0 : 8, borderTop: creationFormOpen ? 'none' : '1px solid #eee', paddingTop: creationFormOpen ? 0 : 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!srMode && deletionMode && selectedForDeletion.size > 0 && (
            <button type="button" onClick={() => void handleDeleteSelected()} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', background: '#ff6b6b', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Delete {selectedForDeletion.size} item{selectedForDeletion.size !== 1 ? 's' : ''}
            </button>
          )}
          <div style={{ display: creationFormOpen ? 'none' : 'block' }}>
            <ExerciseZipImport
              onImported={onExercisesMutated}
              onImportingChange={(isImporting) => { zipImportingRef.current = isImporting; }}
            />
          </div>
          {showCreation && !srMode ? (
            <>
              <button type="button" onClick={() => setCreationFormOpen((open) => !open)} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', background: '#f9f9f9', color: '#111', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {creationFormOpen ? 'Hide exercise creation form' : 'Create new exercise'}
              </button>
              {creationFormOpen ? (
                <div style={{ maxHeight: '70vh', overflow: 'auto', border: '1px solid #eee', borderRadius: 8, padding: 8, background: '#fcfcfc' }}>
                  <ExerciseCreationForm onCreated={onExercisesMutated} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
