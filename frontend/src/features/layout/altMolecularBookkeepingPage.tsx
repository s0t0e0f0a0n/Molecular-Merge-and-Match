import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useWarning } from '../../context/WarningContext';
import { SpectrumViewer } from '../viewingSpectra/SpectraPrototype';
import { AdditionalSpectraPopup } from '../viewingSpectra/AdditionalSpectraPopup';
import { PeakList } from '../linking/PeakTableColumn';
import { WorkingFragmentsStrip } from '../linking/WorkingFragmentsStrip';
import { MoleculeEditorPopup } from '../molecule/MoleculeEditorPopup';
import { PredefinedFragmentMenu } from '../molecule/PredefinedFragmentMenu';
import { WorkingSolutionPanel } from '../solution/WorkingSolutionPanel';
import { StereoChoiceDialog } from '../../components/StereoChoiceDialog';
import { useFragments } from '../../hooks/useFragments';
import { useWorkingSolution } from '../../hooks/useWorkingSolution';
import { useLinking } from '../../hooks/useLinking';
import { useLinkedFragmentWarnings } from '../../hooks/useLinkedFragmentWarnings';
import { useRDKit } from '../../context/RDKitContext';
import { parseMolBlock, molGraphToMolBlock } from '../../utils/molParser';
import { mergeAtAtoms } from '../../utils/mergeFragments';
import type { MolGraph } from '../../types/molecule';
import { ExerciseCreationForm } from '../exercises/ExerciseCreationForm';
import { ExerciseZipImport } from '../exercises/ExerciseZipImport';
import {
  fetchExerciseStatistics,
  fetchExerciseSummaries,
  pauseExerciseTimer,
  resumeExerciseTimer,
  resetExercise,
  validateExerciseCasAnswer,
  fetchExerciseDbe,
  saveExerciseDbe,
  deleteExercise,
  type ExerciseStatistics,
  type ExerciseSummary,
} from '../../api/exercises';
import { useExerciseData } from '../../context/ExerciseDataContext';
import { useHistory } from '../../context/HistoryContext';
import { LogbookPanel } from '../history/LogbookPanel';
import { detectNewStereoBonds } from '../../utils/stereoDetection';
import { formatChemistryText } from '../../utils/formatChemistryText';
import type { PeakDef } from '../../types/peak'; 
import type { MergeState, NewStereoBond } from '../../types/molecule';
import WarningPanel from '../warning/WarningPanel'
import { FullscreenButton } from '../../components/FullscreenButton';
import { LoadingExerciseOverlay, PausedExerciseOverlay } from './LoadingExerciseOverlay';
import { LinkInheritOptionsPopup, type LinkInheritMode } from '../linking/LinkInheritOptionsPopup';
import { fetchUserSettings, updateUserSettings } from '../../api/settings';

function parseStatisticsTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatElapsedTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}


export function MolecularBookkeepingPage() {
  const { rdkit } = useRDKit();
  const { resetWarnings } = useWarning();
  const {
  selectedExerciseId,
  selectedExercise,
  selectedExerciseStatistics,
  loadingSelectedExercise,
  selectedExerciseError,
  selectExerciseById,
  clearSelectedExercise,
  setSelectedExerciseStatistics,
  } = useExerciseData();
  
  const storageExerciseKey =
  selectedExerciseId !== null ? `exercise-${selectedExerciseId}` : 'exercise-none';

  const [initialUrlId] = useState<number | null>(() => {
    const raw = new URLSearchParams(window.location.search).get('exercise');
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  });


  const [casAnswerInput, setCasAnswerInput] = useState('');
  const [casAnswerIsCorrect, setCasAnswerIsCorrect] = useState<boolean | null>(null);
  const [validatingCasAnswer, setValidatingCasAnswer] = useState(false);
  const [exercisePaused, setExercisePaused] = useState(false);
  const [pausingExercise, setPausingExercise] = useState(false);
  const [resumingExercise, setResumingExercise] = useState(false);
  const [pauseButtonHovered, setPauseButtonHovered] = useState(false);
  const [timerNow, setTimerNow] = useState(() => Date.now());

  useEffect(() => {
    setCasAnswerInput('');
    setCasAnswerIsCorrect(null);
    setValidatingCasAnswer(false);
    setExercisePaused(false);
    setPausingExercise(false);
    setResumingExercise(false);
    setTimerNow(Date.now());
  }, [selectedExerciseId]);

  useEffect(() => {
    const startCountingMs = parseStatisticsTimestamp(selectedExerciseStatistics?.start_counting);
    const stopCountingMs = parseStatisticsTimestamp(selectedExerciseStatistics?.stop_counting);
    const completedAtMs = parseStatisticsTimestamp(selectedExerciseStatistics?.completed_at);

    if (startCountingMs === null || stopCountingMs !== null || completedAtMs !== null) {
      return;
    }

    setTimerNow(Date.now());

    const intervalId = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [
    selectedExerciseStatistics?.completed_at,
    selectedExerciseStatistics?.start_counting,
    selectedExerciseStatistics?.stop_counting,
  ]);

  const displayedTimerTotalSeconds = useMemo(() => {
    const statistics = selectedExerciseStatistics;
    if (!statistics) {
      return 0;
    }

    const startCountingMs = parseStatisticsTimestamp(statistics.start_counting);
    const stopCountingMs = parseStatisticsTimestamp(statistics.stop_counting);
    const completedAtMs = parseStatisticsTimestamp(statistics.completed_at);
    let totalSeconds = statistics.timer_total ?? 0;

    if (startCountingMs !== null && stopCountingMs === null && completedAtMs === null) {
      totalSeconds += Math.max(0, Math.floor((timerNow - startCountingMs) / 1000));
    }

    return totalSeconds;
  }, [selectedExerciseStatistics, timerNow]);

  const formattedDisplayedTimer = useMemo(
    () => formatElapsedTime(displayedTimerTotalSeconds),
    [displayedTimerTotalSeconds],
  );

  const handlePauseExercise = useCallback(async () => {
    if (selectedExerciseId === null) return;
    if (exercisePaused || pausingExercise || resumingExercise) return;

    if (selectedExercise?.completed === true) {
      setExercisePaused(true);
      return;
    }

    setPausingExercise(true);
    try {
      const statistics = await pauseExerciseTimer(selectedExerciseId);
      setSelectedExerciseStatistics(statistics);
      setExercisePaused(true);
    } catch (err) {
      console.error('pause failed', err);
    } finally {
      setPausingExercise(false);
    }
  }, [exercisePaused, pausingExercise, resumingExercise, selectedExercise?.completed, selectedExerciseId, setSelectedExerciseStatistics]);

  const handleResumeExercise = useCallback(async () => {
    if (selectedExerciseId === null) return;
    if (selectedExercise?.completed === true) {
      setExercisePaused(false);
      return;
    }
    if (!exercisePaused || resumingExercise) return;

    setResumingExercise(true);
    try {
      const statistics = await resumeExerciseTimer(selectedExerciseId);
      setSelectedExerciseStatistics(statistics);
      setExercisePaused(false);
    } catch (err) {
      console.error('resume failed', err);
    } finally {
      setResumingExercise(false);
    }
  }, [exercisePaused, resumingExercise, selectedExercise?.completed, selectedExerciseId, setSelectedExerciseStatistics]);

  useLayoutEffect(() => {
    if (loadingSelectedExercise || selectedExerciseId === null) {
      resetWarnings();
      return;
    }

    resetWarnings();
  }, [selectedExerciseId, loadingSelectedExercise, resetWarnings]);

  useEffect(() => {
    if (casAnswerIsCorrect === null) return;

    const timeoutId = window.setTimeout(() => {
      setCasAnswerIsCorrect(null);
    }, 30_000);

    return () => window.clearTimeout(timeoutId);
  }, [casAnswerIsCorrect]);

  const {
    fragments,
    createFragment: rawCreateFragment,
    updateFragment,
    deleteFragment: rawDeleteFragment,
    restoreFragment: rawRestoreFragment,
    refetch: refetchFragments,
  } = useFragments(storageExerciseKey);
  const {
    solution,
    setSolution: rawSetSolution,
    clearSolution: rawClearSolution,
    refetch: refetchSolution,
  } = useWorkingSolution(storageExerciseKey);

  const history = useHistory();
  
  useEffect(() => {
    history.registerHandlers({
      deleteFragment: async (id: number) => {
        await rawDeleteFragment(id);
      },
      restoreFragment: rawRestoreFragment,
      updateFragment: async (id: number, smiles: string, molFile: string) => {
        await updateFragment(id, smiles, molFile);
      },
      setSolution: rawSetSolution,
      clearSolution: rawClearSolution,
    });
  }, [history, rawDeleteFragment, rawRestoreFragment, updateFragment, rawSetSolution, rawClearSolution]);

  // Wrapped versions used by user-driven UI actions: they record a logbook
  // entry after the underlying API call succeeds.
  const getNextFragmentLabel = useCallback(() => {
    const usedNumbers = fragments
      .map((fragment) => {
        const match = fragment.label.match(/^Fragment (\d+)$/);
        return match ? Number(match[1]) : null;
      })
      .filter((value): value is number => value !== null);

    const nextNumber = usedNumbers.length > 0
      ? Math.max(...usedNumbers) + 1
      : 1;

    return `Fragment ${nextNumber}`;
  }, [fragments]);

  const createFragment = useCallback(
    async (_label: string, smiles: string, molFile: string): Promise<number | null> => {
      const label = getNextFragmentLabel();

      const newId = await rawCreateFragment(label, smiles, molFile);
      if (newId !== null) {
        history.record({ kind: 'create-fragment', fragmentId: newId, fragLabel: label });
      }
      return newId;
    },
    [rawCreateFragment, history, getNextFragmentLabel],
  );

  const setSolution = useCallback(
    async (smiles: string, molFile: string) => {
      const before = solution;
      await rawSetSolution(smiles, molFile);
      history.record({ kind: 'set-solution', before, after: { smiles, mol_file: molFile } });
    },
    [rawSetSolution, solution, history],
  );

  const clearSolution = useCallback(async () => {
    if (!solution) return;
    const before = solution;
    await rawClearSolution();
    history.record({ kind: 'clear-solution', before });
  }, [rawClearSolution, solution, history]);
  const handleUpdateFragment = useCallback(
  async (id: number, smiles: string, molFile: string): Promise<boolean> => {
    const before = fragments.find((fragment) => fragment.id === id);
    if (!before) return false;

    const ok = await updateFragment(id, smiles, molFile);
    if (!ok) return false;

    history.record({
      kind: 'edit-fragment',
      fragmentId: id,
      fragLabel: before.label,
      before: {
        smiles: before.smiles,
        mol_file: before.mol_file,
      },
      after: {
        smiles,
        mol_file: molFile,
      },
    });

    return true;
  },
  [fragments, updateFragment, history],
);
  {/* exercise menu */}
  const [exerciseMenuOpen, setExerciseMenuOpen] = useState(false);
  const [creationFormOpen, setCreationFormOpen] = useState(false);
  const [expandedExerciseSets, setExpandedExerciseSets] = useState<string[]>([]);
  const [activeSetFilters, setActiveSetFilters] = useState<string[]>([]);
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [tagFilterMode, setTagFilterMode] = useState<'AND' | 'OR'>('AND');
  const [deletionMode, setDeletionMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());

  // Auto-close the exercise menu when the mouse leaves it. We use a short
  // timer so brushing the small gap between the button and the dropdown
  // doesnt close the menu by accident.
  const exerciseMenuCloseTimer = useRef<number | null>(null);
  const zipImportingRef = useRef(false);
  const exerciseMenuRef = useRef<HTMLDivElement | null>(null);
  const scheduleExerciseMenuClose = useCallback(() => {
    if (creationFormOpen) return;
    if (zipImportingRef.current) return;
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
    function onClickOutside(e: MouseEvent) {
      if (exerciseMenuRef.current && !exerciseMenuRef.current.contains(e.target as Node)) {
        setExerciseMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [exerciseMenuOpen]);
  const [exerciseSummaries, setExerciseSummaries] = useState<ExerciseSummary[]>([]);
  const [loadingExerciseSummaries, setLoadingExerciseSummaries] = useState(false);
  const [exerciseSummariesError, setExerciseSummariesError] = useState<string | null>(null);

  const getExerciseSummaryLabel = useCallback((exercise: ExerciseSummary) => exercise.name ?? `Exercise ${exercise.id}`, []);

  const normalizeExerciseSet = useCallback((value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : 'Unassigned';
  }, []);

  {/*getting the exercise list from api*/}
  const loadExerciseSummaries = useCallback(async () => {
  setLoadingExerciseSummaries(true);
  setExerciseSummariesError(null);

  try {
    const data = await fetchExerciseSummaries();
    setExerciseSummaries(data);
  } catch (error) {
    setExerciseSummariesError(
      error instanceof Error ? error.message : 'Failed to load exercises.',
    );
  } finally {
    setLoadingExerciseSummaries(false);
  }
}, []);

useEffect(() => {
  async function initExercises() {
    setLoadingExerciseSummaries(true);
    setExerciseSummariesError(null);

    try {
      const data = await fetchExerciseSummaries();
      setExerciseSummaries(data);

      if (data.length > 0) {
        const initialId = data.find((ex) => ex.id === initialUrlId)?.id ?? data[0].id;
        await selectExerciseById(initialId);
      }
    } catch (error) {
      setExerciseSummariesError(
        error instanceof Error ? error.message : 'Failed to load exercises.',
      );
    } finally {
      setLoadingExerciseSummaries(false);
    }
  }

  void initExercises();
}, [selectExerciseById, initialUrlId]);

useEffect(() => {
  const handleExerciseCompleted = () => {
    void loadExerciseSummaries();
  };

  window.addEventListener('exercise-completed', handleExerciseCompleted);
  return () => window.removeEventListener('exercise-completed', handleExerciseCompleted);
}, [loadExerciseSummaries]);

useEffect(() => {
  if (selectedExerciseId === null) return;
  const params = new URLSearchParams(window.location.search);
  params.set('exercise', String(selectedExerciseId));
  window.history.replaceState(null, '', `?${params.toString()}`);
}, [selectedExerciseId]);

  useEffect(() => {
    if (!exerciseMenuOpen || selectedExerciseId === null) return;
    const selected = exerciseSummaries.find((ex) => ex.id === selectedExerciseId);
    if (!selected) return;
    const setName = normalizeExerciseSet(selected.exercise_set);
    setExpandedExerciseSets((prev) =>
      prev.includes(setName) ? prev : [...prev, setName],
    );
  }, [exerciseMenuOpen, selectedExerciseId, exerciseSummaries, normalizeExerciseSet]);

  useEffect(() => {
    if (creationFormOpen) {
      cancelExerciseMenuClose();
    }
  }, [creationFormOpen, cancelExerciseMenuClose]);

  const exerciseSetOptions = useMemo(() => {
    const setNames = new Set<string>();
    for (const ex of exerciseSummaries) {
      setNames.add(normalizeExerciseSet(ex.exercise_set));
    }
    return Array.from(setNames).sort((a, b) => a.localeCompare(b));
  }, [exerciseSummaries, normalizeExerciseSet]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const ex of exerciseSummaries) {
      for (const tag of ex.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [exerciseSummaries]);

  const exercisesBySet = useMemo(() => {
    const matchesSet = (setName: string) =>
      activeSetFilters.length === 0 || activeSetFilters.includes(setName);
    const matchesTags = (tags: string[]) => {
      if (activeTagFilters.length === 0) return true;
      if (tagFilterMode === 'AND') {
        return activeTagFilters.every((filter) => tags.includes(filter));
      } else {
        return tags.some((tag) => activeTagFilters.includes(tag));
      }
    };

    const map = new Map<string, ExerciseSummary[]>();
    for (const ex of exerciseSummaries) {
      const setName = normalizeExerciseSet(ex.exercise_set);
      if (!matchesSet(setName) || !matchesTags(ex.tags)) {
        continue;
      }
      const list = map.get(setName) ?? [];
      list.push(ex);
      map.set(setName, list);
    }

    return Array.from(map.entries())
      .map(([setName, exercises]) => ({
        setName,
        exercises: [...exercises].sort((a, b) => a.id - b.id),
      }))
      .sort((a, b) => a.setName.localeCompare(b.setName));
  }, [exerciseSummaries, activeSetFilters, activeTagFilters, tagFilterMode, normalizeExerciseSet]);

  const toggleExpandedSet = useCallback((setName: string) => {
    setExpandedExerciseSets((prev) =>
      prev.includes(setName) ? prev.filter((name) => name !== setName) : [...prev, setName],
    );
  }, []);

  const toggleSetFilter = useCallback((setName: string) => {
    setActiveSetFilters((prev) =>
      prev.includes(setName) ? prev.filter((name) => name !== setName) : [...prev, setName],
    );
  }, []);

  const toggleTagFilter = useCallback((tag: string) => {
    setActiveTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((name) => name !== tag) : [...prev, tag],
    );
  }, []);

  const toggleDeleteSelection = useCallback((id: string) => {
    setSelectedForDeletion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSetForDeletion = useCallback((setName: string) => {
    const exerciseIds = new Set(exercisesBySet
      .find((s) => s.setName === setName)
      ?.exercises.map((e) => `ex-${e.id}`) ?? []);
    const setId = `set-${setName}`;

    setSelectedForDeletion((prev) => {
      const next = new Set(prev);
      const allSelected = exerciseIds.size > 0 && 
        Array.from(exerciseIds).every((id) => next.has(id)) &&
        next.has(setId);

      if (allSelected) {
        next.delete(setId);
        exerciseIds.forEach((id) => next.delete(id));
      } else {
        next.add(setId);
        exerciseIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [exercisesBySet]);

  const handleDeleteSelected = useCallback(async () => {
    const ok = window.confirm(
      `Delete ${selectedForDeletion.size} item${selectedForDeletion.size !== 1 ? 's' : ''}? This cannot be undone.`
    );
    if (!ok) return;

    const exerciseIds = Array.from(selectedForDeletion)
      .filter((id) => id.startsWith('ex-'))
      .map((id) => Number(id.slice(3)));

    const failed: number[] = [];
    
    for (const id of exerciseIds) {
      try {
        await deleteExercise(id);
      } catch (_error) {
        failed.push(id);
      }
    }
    
    setSelectedForDeletion(new Set());
    setDeletionMode(false);
    
    try {
      const updatedSummaries = await fetchExerciseSummaries();
      setExerciseSummaries(updatedSummaries);
      
      if (selectedExerciseId && exerciseIds.includes(selectedExerciseId)) {
        const nextExercise = updatedSummaries.find(s => s.id !== selectedExerciseId);
        if (nextExercise) {
          await selectExerciseById(nextExercise.id);
        } else {
          clearSelectedExercise();
        }
      }
    } catch (error) {
      console.error('Failed to refresh summaries after delete', error);
    }
    
    if (failed.length > 0) {
      const message = `Failed to delete: ${failed.join(', ')}`;
      alert(message);
    }
  }, [selectedForDeletion, selectedExerciseId, selectExerciseById, clearSelectedExercise]);

  const currentPeaks = useMemo<PeakDef[]>(() => {
    if (!selectedExercise) {
    return [];
  }
  
  const h1Peaks: PeakDef[] = selectedExercise.h1_peaks.map((peak) => ({
      //This defines how the 1H table entries are stored
    id: `H${peak.id}`,
    spectrum: '1H',
    ppm: peak.ppm,
    multiplicity: peak.multiplicity,
  }));

  const c13Peaks: PeakDef[] = selectedExercise.c13_peaks.map((peak) => ({
      //This defines how the 13C table entries are stored
    id: `C${peak.id}`,
    spectrum: '13C',
    ppm: peak.ppm,
  }));

  return [...h1Peaks, ...c13Peaks];
 }, [selectedExercise]);

  const linking = useLinking(currentPeaks);
  
  // Link inherritance
  const [linkInheritMode, setLinkInheritMode] = useState<LinkInheritMode>('none'); // Default link inherit option
  const [loadingLinkSettings, setLoadingLinkSettings] = useState(true);

  useEffect(() => {
  fetchUserSettings()
    .then((settings) => {
      setLinkInheritMode(settings.link_inherit_mode as LinkInheritMode);
    })
    .catch((err) => {
      console.error('failed to load settings', err);
    })
    .finally(() => {
      setLoadingLinkSettings(false);
    });
}, []);

const handleChangeLinkInheritMode = useCallback(
  async (mode: LinkInheritMode) => {
    setLinkInheritMode(mode);

    try {
      await updateUserSettings(mode);
    } catch (err) {
      console.error('failed to save settings', err);
    }
  },
  [],
);

const hAxisRange: [number, number] | null =
  selectedExercise?.h1_axis_end != null && selectedExercise?.h1_axis_start != null
    ? [
        Number(selectedExercise.h1_axis_end),
        Number(selectedExercise.h1_axis_start),
      ]
    : null;

const cAxisRange: [number, number] | null =
  selectedExercise?.c13_axis_end != null && selectedExercise?.c13_axis_start != null
    ? [
        Number(selectedExercise.c13_axis_end),
        Number(selectedExercise.c13_axis_start),
      ]
    : null;

  // Process DBE input value
    // Student-entered DBE value currently visible in the input field.
    const [formulaDbeDraft, setFormulaDbeDraft] = useState('');

    // The DBE value that has actually been saved by the student.
    // null means: do not use DBE checking for this exercise.
    const [savedFormulaDbe, setSavedFormulaDbe] = useState<number | null>(null);

    // Whenever the user switches exercises, load the DBE state
    // belonging to that specific exercise from the database.
    useEffect(() => {
      if (selectedExerciseId === null) {
        setFormulaDbeDraft('');
        setSavedFormulaDbe(null);
        return;
      }

      setFormulaDbeDraft('');
      setSavedFormulaDbe(null);

      let cancelled = false;
      fetchExerciseDbe(selectedExerciseId)
        .then((dbe) => {
          if (!cancelled) {
            setSavedFormulaDbe(dbe);
            setFormulaDbeDraft(dbe !== null ? String(dbe) : '');
          }
        })
        .catch((err) => {
          console.error('Failed to load DBE:', err);
          if (!cancelled) {
            setFormulaDbeDraft('');
            setSavedFormulaDbe(null);
          }
        });
        
      return () => { cancelled = true; };
    }, [selectedExerciseId]);

    const parsedFormulaDbeDraft = useMemo(() => {
    const value = formulaDbeDraft.trim();

    if (value === '?' || value === '') {
      return null;
    }

    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      return null;
    }

    if (numberValue * 2 !== Math.round(numberValue * 2)) {
      return null;
    }

    return numberValue;
  }, [formulaDbeDraft]);

  const handleSaveDbe = useCallback(async () => {
    if (selectedExerciseId === null) return;
    setSavedFormulaDbe(parsedFormulaDbeDraft);
    try {
      await saveExerciseDbe(selectedExerciseId, parsedFormulaDbeDraft);
    } catch (err) {
      console.error('Failed to save DBE:', err);
    }
  }, [selectedExerciseId, parsedFormulaDbeDraft]);

  // This sends the linking data and the fragments to the warning hook
  // In copy mode the old fragments and the merged fragment all keep links.
  // That makes the warning checks count the same peaks/fragments twice,
  // so we send empty maps to turn these warnings off.
  const warningLinksByFragment = useMemo(
    () => (linkInheritMode === 'copy' ? new Map<string, string[]>() : linking.linksByFragment),
    [linkInheritMode, linking.linksByFragment],
  );

  const warningLinksByPeak = useMemo(
    () => (linkInheritMode === 'copy' ? new Map<string, string[]>() : linking.linksByPeak),
    [linkInheritMode, linking.linksByPeak],
  );

  useLinkedFragmentWarnings(
    warningLinksByFragment,
    warningLinksByPeak,
    fragments,
    selectedExercise?.molecular_formula ?? undefined,
    savedFormulaDbe,
    selectedExerciseId,
  );

  // Made string ids of currently-active (non-soft-deleted) fragments. Passed
  // to PeakList so chips for deleted fragments don't render.
  const activeFragmentIds = useMemo(
    () => new Set(fragments.map((f) => String(f.id))),
    [fragments],
  );

  const [fragmentDisplayOrder, setFragmentDisplayOrder] = useState<string[]>([]);

  // Keep display order in sync when API adds/removes fragments, but preserve
  // any drag-reordering the user has done within the current session
  useEffect(() => {
  setFragmentDisplayOrder((prev) => {
      const nextIds = fragments.map((f) => String(f.id));

      if (prev.length === 0) {
        return nextIds;
      }

      const nextIdSet = new Set(nextIds);

      // Preserve the existing drag-and-drop order, but remove deleted fragments
      const keptExistingOrder = prev.filter((id) => nextIdSet.has(id));

      const existingIdSet = new Set(keptExistingOrder);

      // Place newly added fragments at the beginning of the list
      const addedIds = nextIds.filter((id) => !existingIdSet.has(id));

      return [...addedIds, ...keptExistingOrder];
    });
  }, [fragments]);

  const fragmentIndexMap = useMemo(() => {
    const order = fragmentDisplayOrder.length > 0
      ? fragmentDisplayOrder
      : fragments.map((f) => String(f.id));
    return new Map(order.map((id, i) => [id, i + 1]));
  }, [fragmentDisplayOrder, fragments]);

  const handleDeleteFragment = useCallback(
    async (id: number) => {
      const snapshot = fragments.find((f) => f.id === id);
      const fragmentId = String(id);

      const removedLinks = history.links.filter(
        (link) => link.fragmentId === fragmentId,
      );

      await rawDeleteFragment(id);

      history.setLinks(
        history.links.filter((link) => link.fragmentId !== fragmentId),
      );

      linking.clearFragmentFocus(fragmentId);

      if (snapshot) {
        history.record({
          kind: 'delete-fragment',
          fragmentId: id,
          fragLabel: snapshot.label,
          removedLinks,
        });
      }
    },
    [fragments, rawDeleteFragment, history, linking],
  );


  // Edit state — set when the user clicks "Edit" on a fragment in WorkingFragmentsStrip
  const [editingFragment, setEditingFragment] = useState<(typeof fragments)[0] | null>(null);

  const handleStartEditFragment = useCallback(
    (id: number) => {
      setEditingFragment(fragments.find((f) => f.id === id) ?? null);
    },
    [fragments],
  );

  // Merge state — shared between WorkingSolutionPanel and WorkingFragmentsStrip
  const [mergeState, setMergeState] = useState<MergeState>({ phase: 'idle' });

  // Stereo dialog, shown when a merge creates new directional double bonds
  const [stereoDialogState, setStereoDialogState] = useState<{
    mergedSmiles: string;
    mergedMolBlock: string;
    newStereoBonds: NewStereoBond[];
    mergeTarget: 'solution' | 'fragment';
    fragmentLabel?: string;
    // For fragment-to-fragment merges only: the merged fragment
    // should inherit peakIds from the source and target fragments.
    inheritedPeakIds?: string[];
    sourceFragmentIds?: number[];
  } | null>(null);

  /** Validate a MOL block via RDKit and derive SMILES + clean MOL block. */
  const validateMolBlock = useCallback(
    (molBlock: string): { smiles: string; cleanMolBlock: string } | null => {
      if (!rdkit) return null;
      const mol = rdkit.get_mol(molBlock);
      if (!mol?.is_valid()) { mol?.delete(); return null; }

      const smiles = mol.get_smiles();
      mol.delete();

      const freshMol = rdkit.get_mol(smiles);
      let cleanMolBlock = molBlock;
      if (freshMol?.is_valid()) {
        cleanMolBlock = freshMol.get_molblock();
        freshMol.delete();
      } else {
        freshMol?.delete();
      }
      return { smiles, cleanMolBlock };
    },
    [rdkit],
  );


/**
 * Re-emit a canonical mol block with atom-map numbers cleared. After a merge,
 * atom-map tags are needed by `detectNewStereoBonds` to identify the new bond, 
 * but should never leak into stored fragments/solutions.
 */
function molBlockWithoutMapNumbers(graph: MolGraph): string {
  return molGraphToMolBlock({
    atoms: graph.atoms.map((a) => {
      const copy = { ...a };
      delete copy.mapNumber;
      return copy;
    }),
    bonds: graph.bonds,
  });
}

  const handleSolutionAtomClick = useCallback(
    async (solutionPointIndex: number) => {
      if (mergeState.phase !== 'picking-merge-target' || !solution) return;

      const fragment = fragments.find((f) => f.id === mergeState.fragmentId);
      if (!fragment) { setMergeState({ phase: 'idle' }); return; }

      try {
        const fragmentGraph = parseMolBlock(fragment.mol_file);
        const solutionGraph = parseMolBlock(solution.mol_file);
        const solutionHeavyAtoms = solutionGraph.atoms.filter((a) => a.symbol !== 'H' && a.symbol !== '*');
        const solutionAtom = solutionHeavyAtoms[solutionPointIndex];
        if (!solutionAtom) { setMergeState({ phase: 'idle' }); return; }

        const mergedGraph = mergeAtAtoms(solutionGraph, solutionAtom.index, fragmentGraph, mergeState.fragmentAtomIndex);
        const mergedMolBlock = molGraphToMolBlock(mergedGraph);

        const result = validateMolBlock(mergedMolBlock);
        if (!result) { setMergeState({ phase: 'idle' }); return; }

        // Check for new stereogenic double bonds (graph-level detection; see stereoDetection.ts)
        const canonicalGraph = parseMolBlock(result.cleanMolBlock);
        const newStereo = detectNewStereoBonds(
          solutionGraph, fragmentGraph, canonicalGraph, result.smiles,
        );

        // Strip atom-map numbers from the stored mol block, the SMILES is
        // already stripped by `detectNewStereoBonds`.
        const cleanedMolBlock = molBlockWithoutMapNumbers(canonicalGraph);

        if (newStereo.bonds.length > 0) {
          setStereoDialogState({
            mergedSmiles: newStereo.smiles,
            mergedMolBlock: cleanedMolBlock,
            newStereoBonds: newStereo.bonds,
            mergeTarget: 'solution',
          });
          return; // don't reset mergeState yet, dialog is pending
        }

        // Re-canonicalize so the stored SMILES drops any `[CHn]` brackets that
        // map-number stripping left behind.
        const polished = validateMolBlock(cleanedMolBlock);
        await setSolution(
          polished?.smiles ?? newStereo.smiles,
          polished?.cleanMolBlock ?? cleanedMolBlock,
        );
        setMergeState({ phase: 'idle' });
      } catch {
        setMergeState({ phase: 'idle' });
      }
    },
    [mergeState, solution, fragments, validateMolBlock, setSolution],
  );

  // Collect the peak ids from both fragments before merging.
  // The selected inherit option decides later if these links are copied,
  // moved, or ignored.
  const collectInheritedPeakIds = useCallback(
    (sourceId: number, targetId: number): string[] => {
      const peaks = new Set<string>();
      (linking.linksByFragment.get(String(sourceId)) ?? []).forEach((p) => peaks.add(p));
      (linking.linksByFragment.get(String(targetId)) ?? []).forEach((p) => peaks.add(p));
      return Array.from(peaks);
    },
    [linking.linksByFragment],
  );

  // Create the merged fragment and update the links depending on the
  // inherit option. We store the full before/after link lists so undo/redo
  // can restore the exact link state.
  const finalizeFragmentMerge = useCallback(
  async (
    label: string,
    smiles: string,
    molFile: string,
    inheritedPeakIds: string[],
    sourceFragmentIds: number[] = [],
  ) => {
    const beforeLinks = history.links;

    const newId = await rawCreateFragment(label, smiles, molFile);
    if (newId === null) return;

    const mergedFragmentId = String(newId);
    const sourceFragmentIdSet = new Set(sourceFragmentIds.map(String));

    const inheritedLinks =
      linkInheritMode === 'none'
        ? []
        : inheritedPeakIds.map((peakId) => ({
            fragmentId: mergedFragmentId,
            peakId,
          }));

    const keptLinks =
      linkInheritMode === 'transfer'
        ? beforeLinks.filter((link) => !sourceFragmentIdSet.has(link.fragmentId))
        : beforeLinks;

    const afterLinks = [...keptLinks, ...inheritedLinks];

    history.setLinks(afterLinks);

    history.record({
      kind: 'merge-fragments',
      createdFragmentId: newId,
      fragLabel: label,
      inheritedPeakIds,
      beforeLinks,
      afterLinks,
    });
  },
  [rawCreateFragment, history, linkInheritMode],
);

  // Fragment-to-fragment merge: called from WorkingFragmentsStrip when target atom is clicked
  const handleFragmentToFragmentMerge = useCallback(
    async (targetFragmentId: number, targetPointIndex: number) => {
      if (mergeState.phase !== 'picking-merge-target') return;

      const sourceFragment = fragments.find((f) => f.id === mergeState.fragmentId);
      const targetFragment = fragments.find((f) => f.id === targetFragmentId);
      if (!sourceFragment || !targetFragment) { setMergeState({ phase: 'idle' }); return; }

      try {
        const sourceGraph = parseMolBlock(sourceFragment.mol_file);
        const targetGraph = parseMolBlock(targetFragment.mol_file);
        const targetHeavyAtoms = targetGraph.atoms.filter((a) => a.symbol !== 'H' && a.symbol !== '*');
        const targetAtom = targetHeavyAtoms[targetPointIndex];
        if (!targetAtom) { setMergeState({ phase: 'idle' }); return; }

        const mergedGraph = mergeAtAtoms(
          sourceGraph, mergeState.fragmentAtomIndex,
          targetGraph, targetAtom.index,
        );
        const mergedMolBlock = molGraphToMolBlock(mergedGraph);

        const result = validateMolBlock(mergedMolBlock);
        if (!result) { setMergeState({ phase: 'idle' }); return; }

        const label = sourceFragment.label;
        const inheritedPeakIds = collectInheritedPeakIds(sourceFragment.id, targetFragment.id);

        // Check for new stereo bonds (graph-level detection)
        const canonicalGraph = parseMolBlock(result.cleanMolBlock);
        const newStereo = detectNewStereoBonds(
          sourceGraph, targetGraph, canonicalGraph, result.smiles,
        );

        const cleanedMolBlock = molBlockWithoutMapNumbers(canonicalGraph);

        if (newStereo.bonds.length > 0) {
          setStereoDialogState({
            mergedSmiles: newStereo.smiles,
            mergedMolBlock: cleanedMolBlock,
            newStereoBonds: newStereo.bonds,
            mergeTarget: 'fragment',
            fragmentLabel: label,
            inheritedPeakIds,
            sourceFragmentIds: [sourceFragment.id, targetFragment.id],
          });
          return; // don't reset mergeState yet
        }

        // Re-canonicalize so the stored SMILES drops any `[CHn]` brackets.
        const polished = validateMolBlock(cleanedMolBlock);
        await finalizeFragmentMerge(
          label,
          polished?.smiles ?? newStereo.smiles,
          polished?.cleanMolBlock ?? cleanedMolBlock,
          inheritedPeakIds,
          [sourceFragment.id, targetFragment.id],
        );
        setMergeState({ phase: 'idle' });
      } catch {
        setMergeState({ phase: 'idle' });
      }
    },
    [mergeState, fragments, validateMolBlock, collectInheritedPeakIds, finalizeFragmentMerge],
  );

  // Stereo dialog callbacks
  const handleStereoConfirm = useCallback(
    async (finalSmiles: string) => {
      if (!stereoDialogState || !rdkit) return;

      const mol = rdkit.get_mol(finalSmiles);
      if (!mol?.is_valid()) { mol?.delete(); setStereoDialogState(null); setMergeState({ phase: 'idle' }); return; }
      // Canonicalize so the stored SMILES drops any `[CHn]` brackets that the
      // map-number stripping in `detectNewStereoBonds` could not remove. The
      // E/Z stereo set via `applyStereoChoice` is preserved through this
      // round-trip.
      const canonicalSmiles = mol.get_smiles();
      const cleanMolBlock = mol.get_molblock();
      mol.delete();

      if (stereoDialogState.mergeTarget === 'solution') {
        await setSolution(canonicalSmiles, cleanMolBlock);
      } else {
      // If this was a fragment merge, continue with the same inherit option
      // after the stereo choice has been made.
        await finalizeFragmentMerge(
          stereoDialogState.fragmentLabel ?? 'Merged',
          canonicalSmiles,
          cleanMolBlock,
          stereoDialogState.inheritedPeakIds ?? [],
          stereoDialogState.sourceFragmentIds ?? [],
        );
      }

      setStereoDialogState(null);
      setMergeState({ phase: 'idle' });
    },
    [stereoDialogState, rdkit, setSolution, finalizeFragmentMerge],
  );

  const handleStereoCancel = useCallback(() => {
    setStereoDialogState(null);
    setMergeState({ phase: 'idle' });
  }, []);

  // Send working solution back to fragment list. Records as a single
  // composite logbook entry so one Undo reverses both halves.
  const handleSendToFragments = useCallback(
    async () => {
      if (!solution) return;
      const previousSolution = solution;
      const newId = await rawCreateFragment('Solution', solution.smiles, solution.mol_file);
      if (newId === null) return;
      await rawClearSolution();
      history.record({
        kind: 'send-to-fragments',
        createdFragmentId: newId,
        fragLabel: 'Solution',
        previousSolution,
      });
    },
    [solution, rawCreateFragment, rawClearSolution, history],
  );

  // Predefined fragment picked → create a working fragment
  const handleAddPredefined = useCallback(
    (_name: string, smiles: string, molFile: string) => {
      createFragment('', smiles, molFile);
    },
    [createFragment],
  );

  const handleResetExercise = useCallback(async () => {
    if (selectedExerciseId === null) return;
    const ok = window.confirm(
      "Reset this exercise? This will delete all your fragments, working solution, links, and logbook entries. " +
        "This cannot be undone.",
    );
    if (!ok) return;
    try {
      await resetExercise(storageExerciseKey);
      setFormulaDbeDraft('');
      setSavedFormulaDbe(null);
      history.clearHistory();
      await refetchFragments();
      await refetchSolution();
    } catch (err) {
      console.error('reset failed', err);
    }
  }, [
    selectedExerciseId,
    storageExerciseKey,
    history,
    refetchFragments,
    refetchSolution,
  ]);

  const handleValidateCasAnswer = useCallback(
    async () => {
      if (selectedExerciseId === null) return;

      const normalizedCas = casAnswerInput.replace(/\s+/g, '');
      setCasAnswerInput(normalizedCas);
      setCasAnswerIsCorrect(null);
      setValidatingCasAnswer(true);

      try {
        const result = await validateExerciseCasAnswer(selectedExerciseId, normalizedCas);
        setCasAnswerIsCorrect(result.is_correct);
        if (result.is_correct) {
          try {
            const statistics = await fetchExerciseStatistics(selectedExerciseId);
            setSelectedExerciseStatistics(statistics);
          } catch (error) {
            console.error('statistics refresh failed', error);
          }
          window.dispatchEvent(new CustomEvent('exercise-completed', { detail: { exerciseId: selectedExerciseId } }));
        }
      } catch {
        setCasAnswerIsCorrect(false);
      } finally {
        setValidatingCasAnswer(false);
      }
    },
    [casAnswerInput, selectedExerciseId, setSelectedExerciseStatistics],
  );
  return (
    <div
      style={{
        height: '100vh',
        width: '100%',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        gap: 10,
        position: 'relative',
      }}
    >
      {/* Cover the page while an exercise is loading */}
      <LoadingExerciseOverlay
        loading={loadingSelectedExercise || loadingExerciseSummaries}
      />
      <PausedExerciseOverlay
        paused={exercisePaused}
        resuming={resumingExercise}
        onResume={() => {
          void handleResumeExercise();
        }}
      />
      {/* Cover the page while a logbook jumpTo is in progress so the
          intermediate state changes aren't visible. */}
      {history.isJumping && (
        <div
          data-testid="jumping-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(255, 255, 255, 0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 600,
            color: '#333',
            backdropFilter: 'blur(2px)',
          }}
        >
          Jumping…
        </div>
      )}
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        {/* Left: icon + current exercise name/formula + additional spectra */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <img
            src={`${import.meta.env.BASE_URL}atom.png`}
            alt="Molecular Merge and Match"
            title="Molecular Merge and Match"
            style={{ width: 36, height: 36, verticalAlign: 'middle' }}
          />
          {selectedExercise ? (
            <div
              aria-label="Current exercise"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16 }}
            >
            {/*  <span style={{ fontWeight: 600 }}>
                {selectedExercise.name ?? `Exercise ${selectedExercise.id}`}
              </span> */}
              {selectedExercise.molecular_formula && (
                <span style={{ fontSize: 24, fontWeight: 700, color: '#555' }}>
                  {formatChemistryText(selectedExercise.molecular_formula.replace(/\[2\]H/g, 'D'))}
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 13, opacity: 0.6 }}>
              {loadingExerciseSummaries
                ? 'Loading exercises...'
                : exerciseSummaries.length === 0
                  ? 'No exercises found'
                  : 'No exercise selected'}
            </span>
          )}
          <AdditionalSpectraPopup spectra={selectedExercise?.additional_spectra ?? []} />
        </div>

        {/* Center: WarningPanel (takes remaining space, centered) */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <WarningPanel />
        </div>

        {/* Right: student answer tools + editor + exercise menu + fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>

          {/* DBE input */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            DBE
            <input
              value={formulaDbeDraft} placeholder='?'
              onChange={(e) => setFormulaDbeDraft(e.target.value)}
              onBlur={() => void handleSaveDbe()}
              onKeyDown={(e) => {if (e.key === 'Enter') e.currentTarget.blur();}}
              title="Enter the calculated double bond equivalent here."
              style={{
                width: 42,
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 12,
                textAlign: 'center',
                background: 'white',
              }}
            />
          </label>

          {/* CAS answer validation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              aria-label="CAS number answer"
              value={casAnswerInput}
              onChange={(event) => setCasAnswerInput(event.target.value)}
              placeholder="CAS number"
              style={{
                width: 120,
                border: '1px solid #ccc',
                borderRadius: 6,
                padding: '4px 8px',
                boxSizing: 'border-box',
                fontSize: 12,
              }}
            />
            <button
              type="button"
              onClick={() => void handleValidateCasAnswer()}
              disabled={validatingCasAnswer || selectedExerciseId === null}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #ccc',
                background: validatingCasAnswer ? '#f2f2f2' : 'white',
                cursor: validatingCasAnswer ? 'default' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {validatingCasAnswer ? 'Validating...' : 'Validate CAS'}
            </button>
            <span
              style={{
                minWidth: 170,
                fontSize: 11,
                color: casAnswerIsCorrect ? '#0f5f0f' : '#b30000',
                whiteSpace: 'nowrap',
                visibility: casAnswerIsCorrect === null ? 'hidden' : 'visible',
              }}
            >
              {casAnswerIsCorrect ? 'CAS answer is correct.' : 'CAS answer is incorrect.'}
            </span>
          </div>

          {/* Molecule editor */}
          <MoleculeEditorPopup
            onCreateFragment={createFragment}
            onUpdateFragment={handleUpdateFragment}
            editingFragment={editingFragment}
            onEditComplete={() => setEditingFragment(null)}
          />

          {/* Exercise menu */}
          <div
            ref={exerciseMenuRef}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              zIndex: 50,
            }}
            onMouseLeave={scheduleExerciseMenuClose}
            onMouseEnter={cancelExerciseMenuClose}
          >
            <button
              type="button"
              onClick={() => setExerciseMenuOpen((open) => !open)}
              onMouseLeave={scheduleExerciseMenuClose}
              onMouseEnter={cancelExerciseMenuClose}
              style={{
                color: '#111',
                width: 200,
                borderRadius: 6,
                height: 36,
                border: '1px solid #111',
                background: 'white',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                whiteSpace: 'nowrap',
                boxShadow: exerciseMenuOpen ? '0 4px 14px rgba(0,0,0,0.08)' : 'none',
              }}
              title={exerciseMenuOpen ? 'Hide exercises' : 'Show exercises'}
              data-testid="exercise-menu-button"
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {loadingExerciseSummaries
                    ? 'Loading…'
                    : (exerciseSummaries.find((e) => e.id === selectedExerciseId)
                        ? getExerciseSummaryLabel(exerciseSummaries.find((e) => e.id === selectedExerciseId)!)
                        : 'Exercises')}
                </span>
                {exerciseSummaries.find((e) => e.id === selectedExerciseId)?.completed === true ? (
                  <span aria-hidden="true" style={{ color: '#16a34a', fontWeight: 700, marginLeft: 8, flexShrink: 0 }}>✓</span>
                ) : null}
              </span>
              <span style={{ fontSize: 12 }}>{exerciseMenuOpen ? '▲' : '▼'}</span>
            </button>
            
            <span
              data-testid="exercise-timer-display"
              title="Total time spent on this exercise"
              style={{
                minWidth: 44,
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 14,
                color: '#222',
              }}
            >
              {formattedDisplayedTimer}
            </span>

            <div
              onMouseEnter={cancelExerciseMenuClose}
              onMouseLeave={scheduleExerciseMenuClose}
              style={{
                position: 'absolute',
                top: 44,
                right: 0,
                width: 680,
                maxWidth: '90vw',
                maxHeight: '85vh',
                overflow: 'auto',
                borderRadius: 12,
                border: '1px solid #ddd',
                background: 'white',
                padding: 12,
                display: exerciseMenuOpen ? 'flex' : 'none',
                flexDirection: 'column',
                gap: 8,
                boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
                zIndex: 60,
                pointerEvents: exerciseMenuOpen ? 'auto' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Exercises</div>
                <button
                  type="button"
                  onClick={() => {
                    setDeletionMode(!deletionMode);
                    setSelectedForDeletion(new Set());
                  }}
                  title={deletionMode ? 'Cancel deletion' : 'Delete exercises'}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 2px',
                    cursor: 'pointer',
                    lineHeight: 1,
                    borderRadius: 4,
                    opacity: deletionMode ? 1 : 0.6,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <img
                    src={`${import.meta.env.BASE_URL}chemisch_afval.svg`}
                    alt="Delete"
                    style={{ width: 16, height: 16 }}
                  />
                </button>
              </div>

              <div
                style={{
                  display: creationFormOpen ? 'none' : 'grid',
                  gridTemplateColumns: '1.2fr 0.8fr',
                  gap: 12,
                }}
              >
                  <div
                    style={{
                      border: '1px solid #e5e5e5',
                      borderRadius: 12,
                      padding: 10,
                      background: '#fafafa',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      minHeight: 0,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Exercise sets</div>
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        maxHeight: '52vh',
                        overflowY: 'auto',
                        paddingRight: 4,
                      }}
                    >
                      {loadingExerciseSummaries ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Loading exercises...</div>
                      ) : exerciseSummariesError ? (
                        <div style={{ fontSize: 12, color: '#b30000' }}>
                          {exerciseSummariesError}
                        </div>
                      ) : exerciseSummaries.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>No exercises found.</div>
                      ) : exercisesBySet.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          No exercises match the current filters.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {exercisesBySet.map(({ setName, exercises }) => {
                            const expanded = expandedExerciseSets.includes(setName);
                            return (
                              <div
                                key={setName}
                                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                  }}
                                >
                                  {deletionMode && (
                                    <input
                                      type="checkbox"
                                      checked={selectedForDeletion.has(`set-${setName}`)}
                                      onChange={() => toggleSetForDeletion(setName)}
                                      style={{ cursor: 'pointer' }}
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (deletionMode) {
                                        toggleSetForDeletion(setName);
                                      } else {
                                        toggleExpandedSet(setName);
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      textAlign: 'left',
                                      padding: '8px 10px',
                                      borderRadius: 8,
                                      border: '1px solid #d8d8d8',
                                      background: 'white',
                                      cursor: 'pointer',
                                      fontSize: 13,
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 8,
                                    }}
                                  >
                                    <span>{setName}</span>
                                    <span style={{ fontSize: 11 }}>
                                      {expanded ? '▲' : '▼'}
                                    </span>
                                  </button>
                                </div>
                                {expanded ? (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 6,
                                      paddingLeft: 10,
                                    }}
                                  >
                                    {exercises.map((ex) => (
                                      <div
                                        key={ex.id}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                        }}
                                      >
                                        {deletionMode && (
                                          <input
                                            type="checkbox"
                                            checked={selectedForDeletion.has(`ex-${ex.id}`)}
                                            onChange={() => toggleDeleteSelection(`ex-${ex.id}`)}
                                            style={{ cursor: 'pointer' }}
                                          />
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (deletionMode) {
                                              toggleDeleteSelection(`ex-${ex.id}`);
                                            } else {
                                              void selectExerciseById(ex.id);
                                            }
                                          }}
                                          style={{
                                            flex: 1,
                                            textAlign: 'left',
                                            padding: '8px 10px',
                                            borderRadius: 8,
                                            border: '1px solid #ccc',
                                            background: selectedExerciseId === ex.id ? '#111' : '#f9f9f9',
                                            color: selectedExerciseId === ex.id ? '#fff' : '#111',
                                            cursor: 'pointer',
                                            fontSize: 13,
                                          }}
                                        >
                                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                            <span>{getExerciseSummaryLabel(ex)}</span>
                                            {ex.completed === true ? (
                                              <span aria-hidden="true" style={{ color: '#22c55e', fontWeight: 700, flexShrink: 0 }}>{'\u2713'}</span>
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
                  <div
                    style={{
                      border: '1px solid #e5e5e5',
                      borderRadius: 12,
                      padding: 10,
                      background: '#fafafa',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Filters</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>Exercise sets</div>
                      {exerciseSetOptions.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>No sets available.</div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            maxHeight: 160,
                            overflowY: 'auto',
                            paddingRight: 4,
                          }}
                        >
                          {exerciseSetOptions.map((setName) => (
                            <label
                              key={`set-${setName}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                            >
                              <input
                                type="checkbox"
                                checked={activeSetFilters.includes(setName)}
                                onChange={() => toggleSetFilter(setName)}
                              />
                              <span>{setName}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Tags</div>
                        <button
                          type="button"
                          onClick={() => setTagFilterMode(tagFilterMode === 'AND' ? 'OR' : 'AND')}
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid #ccc',
                            background: '#f0f0f0',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {tagFilterMode}
                        </button>
                      </div>
                      {tagOptions.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>No tags available.</div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            maxHeight: 220,
                            overflowY: 'auto',
                            paddingRight: 4,
                          }}
                        >
                          {tagOptions.map((tag) => (
                            <label
                              key={`tag-${tag}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                            >
                              <input
                                type="checkbox"
                                checked={activeTagFilters.includes(tag)}
                                onChange={() => toggleTagFilter(tag)}
                              />
                              <span>{tag}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: creationFormOpen ? 0 : 8,
                    borderTop: creationFormOpen ? 'none' : '1px solid #eee',
                    paddingTop: creationFormOpen ? 0 : 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {deletionMode && selectedForDeletion.size > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteSelected()}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #ccc',
                        background: '#ff6b6b',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Delete {selectedForDeletion.size} item{selectedForDeletion.size !== 1 ? 's' : ''}
                    </button>
                  )}

                  <div style={{ display: creationFormOpen ? 'none' : 'block' }}>
                    <ExerciseZipImport
                    onImported={loadExerciseSummaries}
                    onImportingChange={(isImporting) => { zipImportingRef.current = isImporting; }}
                    />
                  </div>


                  <button
                    type="button"
                    onClick={() => setCreationFormOpen((open) => !open)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #ccc',
                      background: '#f9f9f9',
                      color: '#111',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {creationFormOpen
                      ? 'Hide exercise creation form'
                      : 'Create new exercise'}
                  </button>

                {creationFormOpen ? (
                  <div
                    style={{
                      maxHeight: '70vh',
                      overflow: 'auto',
                      border: '1px solid #eee',
                      borderRadius: 8,
                      padding: 8,
                      background: '#fcfcfc',
                    }}
                  >
                    <ExerciseCreationForm onCreated={loadExerciseSummaries} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void handlePauseExercise();
            }}
            onMouseEnter={() => setPauseButtonHovered(true)}
            onMouseLeave={() => setPauseButtonHovered(false)}
            disabled={
              selectedExerciseId === null ||
              exercisePaused ||
              pausingExercise ||
              resumingExercise
            }
            title={exercisePaused ? 'Exercise is paused' : (selectedExercise?.completed === true ? 'Pause view' : 'Pause exercise')}
            data-testid="pause-exercise-button"
            style={{
              width: 28,
              height: 28,
              padding: 0,
              borderRadius: 6,
              border: '1px solid #ccc',
              background: pauseButtonHovered ? '#ff6b6b' : 'white',
              color: pauseButtonHovered ? '#fff' : '#111',
              cursor: 'pointer',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="currentColor"
            >
              <rect x="3" y="2" width="3" height="10" rx="1" />
              <rect x="8" y="2" width="3" height="10" rx="1" />
            </svg>
          </button>



          {/* Fullscreen toggle */}
          <FullscreenButton />

        </div>
      </div>

      {loadingSelectedExercise && (
        <div
            style={{
              position: 'fixed',
              top: 70,
              right: 20,
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.9)',
              border: '1px solid #ddd',
              zIndex: 1000,
            }}
          >
          </div>
        )}

       {selectedExerciseError && (
         <div
            style={{
              position: 'fixed',
              top: 110,
              right: 20,
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 8,
              background: '#fff5f5',
              border: '1px solid #f0c7c7',
              color: '#b30000',
              zIndex: 1000,
            }}
          >
            {selectedExerciseError}
          </div>
        )}


      {/* Main grid: 3 columns x 2 rows */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1.3fr 0.25fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gridTemplateAreas: `
            "h1spec  h1peaks  solution"
            "c13spec c13peaks solution"
          `,
          gap: 0,
        }}
      >
        {/* Left-top: 1H spectrum */}
        {hAxisRange && (
          <div style={{ gridArea: 'h1spec', minHeight: 0, overflow: 'hidden' }}>
            <SpectrumViewer
              src={selectedExercise?.h1_svg_url ?? ''}
              height="100%"
              type="H"
              solvent={selectedExercise?.h1_solvent ?? null}
              frequencyMhz={selectedExercise?.h1_frequency_mhz ?? null}
              peaks={currentPeaks
                .filter(p => p.spectrum === '1H')
                .map(p => ({ id: p.id, ppm: p.ppm }))}
              axisRange={hAxisRange}
              onHoverPeak={linking.setHoverPeakId}
              onSelectPeak={linking.selectPeak}
              isHighlighted={linking.peakIsHighlighted}
            />
          </div>
        )}

        {/* Left-bottom: 13C spectrum */}
        {cAxisRange && (
          <div style={{ gridArea: 'c13spec', minHeight: 0, overflow: 'hidden' }}>
            <SpectrumViewer
              src={selectedExercise?.c13_svg_url ?? ''}
              height="100%"
              type="C"
              solvent={selectedExercise?.c13_solvent ?? null}
              frequencyMhz={selectedExercise?.c13_frequency_mhz ?? null}
              apt={selectedExercise?.c13_apt ?? false}
              peaks={currentPeaks
                .filter(p => p.spectrum === '13C')
                .map(p => ({ id: p.id, ppm: p.ppm }))}
              axisRange={cAxisRange}
              onHoverPeak={linking.setHoverPeakId}
              onSelectPeak={linking.selectPeak}
              isHighlighted={linking.peakIsHighlighted}
            />
          </div>
        )}

        {/* 1H peak list (beside 1H spectrum) */}
        <div
          style={{
            gridArea: 'h1peaks',
            borderRadius: 12,
            border: '0px solid #ddd',
            background: 'white',
            padding: 10,
            minHeight: 0,
            overflow: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>¹H peaks (ppm)</div>
          <PeakList
            peaks={linking.peaks1H}
            linksByPeak={linking.linksByPeak}
            selectedPeakId={linking.selectedPeakId}
            onSelectPeak={linking.selectPeak}
            onHoverPeak={linking.setHoverPeakId}
            isHighlighted={linking.peakIsHighlighted}
            dimNonHighlighted={linking.hasFocus}
            activeFragmentIds={activeFragmentIds}
            fragmentIndexMap={fragmentIndexMap}
          />
        </div>

        {/* 13C peak list (beside 13C spectrum) */}
        <div
          style={{
            gridArea: 'c13peaks',
            borderRadius: 12,
            border: '0px solid #ddd',
            background: 'white',
            padding: 10,
            minHeight: 0,
            overflow: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>¹³C peaks (ppm)</div>
          <PeakList
            peaks={linking.peaks13C}
            linksByPeak={linking.linksByPeak}
            selectedPeakId={linking.selectedPeakId}
            onSelectPeak={linking.selectPeak}
            onHoverPeak={linking.setHoverPeakId}
            isHighlighted={linking.peakIsHighlighted}
            activeFragmentIds={activeFragmentIds}
            dimNonHighlighted={linking.hasFocus}
            fragmentIndexMap={fragmentIndexMap}
          />
        </div>

        {/* Right-top: solution panel */}
        <div
          style={{
            gridArea: 'solution',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}
        >
          <WorkingSolutionPanel
            exerciseId={selectedExerciseId}
            solution={solution}
            clearSolution={clearSolution}
            mergeState={mergeState}
            onSolutionAtomClick={handleSolutionAtomClick}
            onSendToFragments={handleSendToFragments}
            formulaDbe={savedFormulaDbe}
          />

          {/* fragment space */}
        <div
        style={{
          flex: 1,  
          minHeight: 0,
          borderRadius: 12,
          border: '0px solid #ddd',
          background: 'white',
          paddingTop: 6,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
          <WorkingFragmentsStrip
            userFragments={fragments}
            onDeleteFragment={handleDeleteFragment}
            onEditFragment={handleStartEditFragment}
            peaks={currentPeaks}
            selectedPeakId={linking.selectedPeakId}
            selectedFragmentId={linking.selectedFragmentId}
            selectFragment={linking.selectFragment}
            isLinked={linking.isLinked}
            unlink={linking.unlink}
            linksByFragment={linking.linksByFragment}
            setHoverFragmentId={linking.setHoverFragmentId}
            fragmentIsHighlighted={linking.fragmentIsHighlighted}
            hasFocus={linking.hasFocus}
            solution={solution}
            setSolution={setSolution}
            mergeState={mergeState}
            setMergeState={setMergeState}
            onFragmentToFragmentMerge={handleFragmentToFragmentMerge}
            onFragmentOrderChange={setFragmentDisplayOrder}
            fragmentIndexMap={fragmentIndexMap}
            headerExtra={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PredefinedFragmentMenu onAdd={handleAddPredefined} />

                {!loadingLinkSettings && (
                  <LinkInheritOptionsPopup
                    value={linkInheritMode}
                    onChange={handleChangeLinkInheritMode}
                  />
                )}

                <button
                  onClick={linking.clearLinks}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    background: 'white',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                  type="button"
                >
                  Clear links
                </button>

                {/* The button to reset the exercise */}
                <button
                  type="button"
                  onClick={() => void handleResetExercise()}
                  title="Reset this exercise"
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    background: 'white',
                    fontSize: 12,
                    cursor: 'pointer',
                    
                  }}
                > Reset&nbsp;&nbsp;
                  <span style={{lineHeight: 1, color: '#b33'}}>{'\u21BA'}</span>
                </button>
              </div>
            }
          />

         </div>

          <LogbookPanel />
        </div>

        

      </div>

      {/* Cis/trans stereo choice dialog */}
      {stereoDialogState && (
        <StereoChoiceDialog
          mergedSmiles={stereoDialogState.mergedSmiles}
          newStereoBonds={stereoDialogState.newStereoBonds}
          onConfirm={handleStereoConfirm}
          onCancel={handleStereoCancel}
        />
      )}
    </div>
  );
}
