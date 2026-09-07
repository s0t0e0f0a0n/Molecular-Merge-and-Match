import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
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
import { DEFAULT_CHEATS, normalizeCheatBits, useCheating } from '../../hooks/useCheating';
import { useRDKit } from '../../context/RDKitContext';
import { parseMolBlock, molGraphToMolBlock } from '../../utils/molParser';
import { mergeAtAtoms } from '../../utils/mergeFragments';
import type { MolGraph } from '../../types/molecule';
import { ExerciseCreationForm } from '../exercises/ExerciseCreationForm';
import { ExerciseZipImport } from '../exercises/ExerciseZipImport';
import {
  fetchExerciseStatistics,
  fetchExerciseSummaries,
  resetExercise,
  validateExerciseCasAnswer,
  fetchExerciseDbe,
  saveExerciseDbe,
  deleteExercise,
  type ApiC13Coupling,
  type ApiC13Peak,
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
import { applySettingsPreset, fetchUserSettings, updateUserSettings, type UpdateUserSettingsRequest, type UserSettings } from '../../api/settings';
import {
  fetchSolventPreferences,
  updateSolventPreference,
  type SolventPreference,
} from '../../api/solvents';
import { fetchTags, type Tag } from '../../api/tags';
import { SettingsPanel } from '../settings/SettingsPanel';
import {
  ExerciseTimerDisplay,
  PauseExerciseButton,
  useExerciseTimingState,
} from '../statistics/TimingPanel';

function toRegularC13DisplayPeaks(c13Peaks: ApiC13Peak[]): PeakDef[] {
  return c13Peaks.map((peak) => ({
    id: `C${peak.id}`,
    spectrum: '13C',
    ppm: peak.ppm,
  }));
}

function sortPeaksByPpmDescending(peaks: PeakDef[]): PeakDef[] {
  return [...peaks].sort((a, b) => {
    if (b.ppm !== a.ppm) return b.ppm - a.ppm;
    return a.id.localeCompare(b.id);
  });
}

function toAltC13DisplayPeaks(
  c13Peaks: ApiC13Peak[],
  c13Couplings: ApiC13Coupling[],
  includeJValuesInMultiplicity: boolean,
): PeakDef[] {
  const formatAltMultiplicity = (coupling: ApiC13Coupling | undefined): string | null => {
    const multiplicity = coupling?.multiplicity ?? null;
    if (!multiplicity) return null;
    if (!includeJValuesInMultiplicity) return multiplicity;

    const rawJValues = coupling?.j_values_hz_csv;
    if (!rawJValues) return multiplicity;

    const values = rawJValues
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (values.length === 0) return multiplicity;
    return `${multiplicity}, J = ${values.join(', ')} Hz`;
  };

  const couplingsByTag = new Map<number, ApiC13Coupling>();
  const untaggedCouplings: ApiC13Coupling[] = [];

  for (const coupling of c13Couplings) {
    if (typeof coupling.atom_tag === 'number') {
      if (!couplingsByTag.has(coupling.atom_tag)) {
        couplingsByTag.set(coupling.atom_tag, coupling);
      }
      continue;
    }
    untaggedCouplings.push(coupling);
  }

  const groupedByTag = new Map<number, ApiC13Peak[]>();
  const orderedTags: number[] = [];
  const untaggedRegularPeaks: ApiC13Peak[] = [];

  for (const peak of c13Peaks) {
    if (typeof peak.atom_tag === 'number') {
      if (!groupedByTag.has(peak.atom_tag)) {
        groupedByTag.set(peak.atom_tag, []);
        orderedTags.push(peak.atom_tag);
      }
      groupedByTag.get(peak.atom_tag)?.push(peak);
      continue;
    }
    untaggedRegularPeaks.push(peak);
  }

  const displayPeaks: PeakDef[] = [];

  for (const atomTag of orderedTags) {
    const regularGroup = groupedByTag.get(atomTag);
    if (!regularGroup || regularGroup.length === 0) {
      continue;
    }

    const representative = regularGroup[0];
    const alt = couplingsByTag.get(atomTag);

    displayPeaks.push({
      id: `C${representative.id}`,
      spectrum: '13C',
      ppm: alt?.ppm ?? representative.ppm,
      multiplicity: formatAltMultiplicity(alt),
    });
  }

  // Keep untagged peaks and replace ppm/multiplicity from alt couplings when available.
  for (let i = 0; i < untaggedRegularPeaks.length; i += 1) {
    const representative = untaggedRegularPeaks[i];
    const alt = untaggedCouplings[i];
    displayPeaks.push({
      id: `C${representative.id}`,
      spectrum: '13C',
      ppm: alt?.ppm ?? representative.ppm,
      multiplicity: formatAltMultiplicity(alt),
    });
  }

  return displayPeaks;
}

function formatH1Multiplicity(
  multiplicity: string | null,
  jValuesHzCsv: string | null,
  protonCount: number | null,
  includeJValues: boolean,
  includeAtomCount: boolean,
): string | null {
  const formattedMultiplicity = (() => {
    if (!multiplicity) return null;
    if (!includeJValues) return multiplicity;
    if (!jValuesHzCsv) return multiplicity;

    const values = jValuesHzCsv
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (values.length === 0) return multiplicity;
    return `${multiplicity}, J = ${values.join(', ')} Hz`;
  })();

  const countLabel = includeAtomCount && protonCount != null ? `${protonCount}H` : null;
  const parts = [countLabel, formattedMultiplicity].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  if (parts.length === 0) return null;
  return parts.join(', ');
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

function renderSuperscriptNucleus(nucleus: string): string {
  return nucleus.replace(/\d/g, (digit) => SUPERSCRIPT_DIGITS[digit] ?? digit);
}

function formatAltNucleusDisplayLabel(nucleus: string): string {
  return renderSuperscriptNucleus(nucleus);
}

function formatAltNucleusMultiplicity(
  atomCount: number | null,
  multiplicity: string | null,
  jValuesHzCsv: string | null,
): string | null {
  const parts: string[] = [];

  if (atomCount != null) {
    parts.push(String(atomCount));
  }

  if (multiplicity) {
    parts.push(multiplicity);
  }

  if (jValuesHzCsv) {
    const values = jValuesHzCsv
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (values.length > 0) {
      parts.push(`J = ${values.join(', ')} Hz`);
    }
  }

  if (parts.length === 0) return null;
  return parts.join(', ');
}

type AltNucleusTable = {
  key: string;
  title: ReactNode;
  peaks: Array<{ id: string; ppm: number; multiplicity: string | null }>;
};


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
  const [cheatBits, setCheatBits] = useState(DEFAULT_CHEATS);
  const [settingsHover, setSettingsHover] = useState(false);
  const [showCASValidation, setShowCASValidation] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showSolventText, setShowSolventText] = useState(true);
  const [showExchangeText, setShowExchangeText] = useState(true);
  const [showMissingText, setShowMissingText] = useState(true);
  const [showCreation, setShowCreation] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState('Light');
  const [selectedPreset, setSelectedPreset] = useState('User');
  const [availablePresets, setAvailablePresets] = useState<string[]>(['Default', 'Beginner', 'Exam', 'User']);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [solvents, setSolvents] = useState<SolventPreference[]>([]);
  const [solventsLoading, setSolventsLoading] = useState(false);
  const cheating = useCheating(cheatBits);

  const {
    exercisePaused,
    resumingExercise,
    formattedDisplayedTimer,
    handlePauseExercise,
    handleResumeExercise,
    pauseButtonDisabled,
    pauseButtonTitle,
  } = useExerciseTimingState({
    selectedExerciseId,
    isExerciseCompleted: selectedExercise?.completed === true,
    selectedExerciseStatistics,
    setSelectedExerciseStatistics,
  });

  useEffect(() => {
    setCasAnswerInput('');
    setCasAnswerIsCorrect(null);
    setValidatingCasAnswer(false);
  }, [selectedExerciseId]);

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
  const [activeTags, setActiveTags] = useState<Tag[]>([]);
  const [loadingExerciseSummaries, setLoadingExerciseSummaries] = useState(false);
  const [exerciseSummariesError, setExerciseSummariesError] = useState<string | null>(null);

  const getExerciseSummaryLabel = useCallback((exercise: ExerciseSummary) => exercise.name ?? `Exercise ${exercise.id}`, []);

  const normalizeExerciseSet = useCallback((value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : 'Unassigned';
  }, []);

  const loadActiveTags = useCallback(async () => {
    try {
      setActiveTags(await fetchTags());
    } catch (error) {
      console.error('failed to load tags', error);
      setActiveTags([]);
    }
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
  void loadActiveTags();

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
}, [selectExerciseById, initialUrlId, loadActiveTags]);

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

  useEffect(() => {
    if (!showCreation && creationFormOpen) {
      setCreationFormOpen(false);
    }
  }, [showCreation, creationFormOpen]);

  const exerciseSetOptions = useMemo(() => {
    const setNames = new Set<string>();
    for (const ex of exerciseSummaries) {
      setNames.add(normalizeExerciseSet(ex.exercise_set));
    }
    return Array.from(setNames).sort((a, b) => a.localeCompare(b));
  }, [exerciseSummaries, normalizeExerciseSet]);

  const showCheatTags = normalizeCheatBits(cheatBits).padEnd(DEFAULT_CHEATS.length, '0')[8] === '1';

  const tagOptions = useMemo(() => {
    const activeTagNames = new Set(activeTags.map((tag) => tag.tag_name.toLocaleLowerCase()));
    const cheatTagNames = new Set(activeTags.filter((tag) => tag.is_cheat).map((tag) => tag.tag_name.toLocaleLowerCase()));
    const tags = new Set<string>();
    for (const ex of exerciseSummaries) {
      for (const tag of ex.tags) {
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
        .filter((tag) => showCheatTags || !tag.is_cheat)
        .map((tag) => tag.tag_name.toLocaleLowerCase()),
    );
    setActiveTagFilters((previous) =>
      previous.filter((tag) => allowedTagNames.has(tag.toLocaleLowerCase())),
    );
  }, [activeTags, showCheatTags]);

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

  const loadSolventPreferences = useCallback(async () => {
    setSolventsLoading(true);
    try {
      const rows = await fetchSolventPreferences();
      setSolvents(rows);
    } catch (err) {
      console.error('failed to load solvent preferences', err);
      setSolvents([]);
    } finally {
      setSolventsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSolventPreferences();
  }, [loadSolventPreferences]);

  const handleExercisesMutated = useCallback(async () => {
    await Promise.all([
      loadExerciseSummaries(),
      loadSolventPreferences(),
    ]);
  }, [loadExerciseSummaries, loadSolventPreferences]);

  const handleTagsUpdated = useCallback(() => {
    void loadExerciseSummaries();
    void loadActiveTags();
  }, [loadActiveTags, loadExerciseSummaries]);

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
      await loadSolventPreferences();
      
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
  }, [selectedForDeletion, selectedExerciseId, selectExerciseById, clearSelectedExercise, loadSolventPreferences]);

  const currentPeaks = useMemo<PeakDef[]>(() => {
    if (!selectedExercise) {
    return [];
  }

  const useAltC13Display =
    cheating.useAltC13Display
    && Boolean(selectedExercise.c13_alt_text?.trim());
  const showAltC13JValues = cheating.showAltC13JValues;
  const showH1JValues = cheating.showH1JValues;
  const showAtomCount = cheating.showAtomCount;
  
  const h1Peaks: PeakDef[] = selectedExercise.h1_peaks.map((peak) => ({
      //This defines how the 1H table entries are stored
    id: `H${peak.id}`,
    spectrum: '1H',
    ppm: peak.ppm,
    multiplicity: formatH1Multiplicity(
      peak.multiplicity,
      peak.j_values_hz_csv,
      peak.proton_count,
      showH1JValues,
      showAtomCount,
    ),
  }));

  const c13Peaks: PeakDef[] = useAltC13Display
    ? toAltC13DisplayPeaks(
      selectedExercise.c13_peaks,
      selectedExercise.c13_couplings,
      showAltC13JValues,
    )
    : toRegularC13DisplayPeaks(selectedExercise.c13_peaks);

  const atomCountByC13PeakId = new Map<string, number>(
    selectedExercise.c13_peaks.map((peak) => [`C${peak.id}`, peak.atom_count]),
  );

  const c13PeaksWithCount: PeakDef[] = c13Peaks.map((peak) => {
    if (!showAtomCount) return peak;

    const atomCount = atomCountByC13PeakId.get(peak.id);
    const countLabel = atomCount != null ? `${atomCount}C` : null;
    const multiplicityText = peak.multiplicity ?? null;
    const parts = [countLabel, multiplicityText].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    return {
      ...peak,
      multiplicity: parts.length > 0 ? parts.join(', ') : null,
    };
  });

  const altNucleusPeaks: PeakDef[] = sortPeaksByPpmDescending(
    (selectedExercise.alt_nuclei ?? []).map((peak) => ({
      id: `N${peak.id}`,
      spectrum: 'alt' as const,
      ppm: peak.ppm,
      multiplicity: null,
      displayLabel: formatAltNucleusDisplayLabel(peak.nucleus),
    })),
  );

  return [
    ...sortPeaksByPpmDescending(h1Peaks),
    ...sortPeaksByPpmDescending(c13PeaksWithCount),
    ...altNucleusPeaks,
  ];
 }, [
  selectedExercise,
  cheating.useAltC13Display,
  cheating.showAltC13JValues,
  cheating.showH1JValues,
  cheating.showAtomCount,
]);

  const c13SpectrumPeaks = useMemo<{ id: string; ppm: number }[]>(() => {
    if (!selectedExercise) return [];

    return sortPeaksByPpmDescending(
      selectedExercise.c13_peaks.map((peak) => ({
        id: `C${peak.id}`,
        spectrum: '13C' as const,
        ppm: peak.ppm,
      })),
    ).map((peak) => ({ id: peak.id, ppm: peak.ppm }));
  }, [selectedExercise]);

  const c13SpectrumToDisplayPeakId = useMemo(() => {
    const map = new Map<string, string>();
    if (!selectedExercise) return map;

    const useAltC13Display =
      cheating.useAltC13Display
      && Boolean(selectedExercise.c13_alt_text?.trim());

    if (!useAltC13Display) {
      for (const peak of selectedExercise.c13_peaks) {
        const id = `C${peak.id}`;
        map.set(id, id);
      }
      return map;
    }

    const representativeByTag = new Map<number, string>();
    for (const peak of selectedExercise.c13_peaks) {
      if (typeof peak.atom_tag === 'number' && !representativeByTag.has(peak.atom_tag)) {
        representativeByTag.set(peak.atom_tag, `C${peak.id}`);
      }
    }

    for (const peak of selectedExercise.c13_peaks) {
      const sourceId = `C${peak.id}`;
      if (typeof peak.atom_tag === 'number') {
        map.set(sourceId, representativeByTag.get(peak.atom_tag) ?? sourceId);
      } else {
        map.set(sourceId, sourceId);
      }
    }

    return map;
  }, [selectedExercise, cheating.useAltC13Display]);

  const linking = useLinking(currentPeaks);
  
  // Link inherritance
  const [linkInheritMode, setLinkInheritMode] = useState<LinkInheritMode>('none'); // Default link inherit option
  const [loadingLinkSettings, setLoadingLinkSettings] = useState(true);

  const applyIncomingSettings = useCallback((settings: UserSettings) => {
    const mode = settings.link_inherit_mode;
    setLinkInheritMode(
      mode === 'none' || mode === 'transfer' || mode === 'copy' ? mode : 'none',
    );
    setCheatBits(normalizeCheatBits(settings.cheats));
    setShowCASValidation(settings.show_CAS ?? true);
    setShowTimer(settings.show_timer ?? true);
    setShowWarnings(settings.show_warnings ?? true);
    setShowSolventText(settings.show_solvent ?? true);
    setShowExchangeText(settings.show_exchange ?? true);
    setShowMissingText(settings.show_missing ?? true);
    setShowCreation(settings.show_creation ?? true);
    setSelectedTheme(settings.theme ?? 'Light');

    if (settings.active_preset) {
      setSelectedPreset(settings.active_preset);
    }

    const presetOptions = (settings.available_presets ?? []).filter(Boolean);
    if (presetOptions.length > 0) {
      setAvailablePresets(presetOptions);
    }
  }, []);

  const persistUserSettings = useCallback(
    async (overrides: UpdateUserSettingsRequest) => {
      // Only send keys that were explicitly overridden so the backend
      // receives a minimal payload (tests expect single-key updates).
      const payload: UpdateUserSettingsRequest = {};
      if (overrides.link_inherit_mode !== undefined) payload.link_inherit_mode = overrides.link_inherit_mode;
      if (overrides.theme !== undefined) payload.theme = overrides.theme;
      if (overrides.cheats !== undefined) payload.cheats = overrides.cheats;
      if (overrides.show_CAS !== undefined) payload.show_CAS = overrides.show_CAS;
      if (overrides.show_timer !== undefined) payload.show_timer = overrides.show_timer;
      if (overrides.show_warnings !== undefined) payload.show_warnings = overrides.show_warnings;
      if (overrides.show_solvent !== undefined) payload.show_solvent = overrides.show_solvent;
      if (overrides.show_exchange !== undefined) payload.show_exchange = overrides.show_exchange;
      if (overrides.show_missing !== undefined) payload.show_missing = overrides.show_missing;
      if (overrides.show_creation !== undefined) payload.show_creation = overrides.show_creation;

      try {
        const saved = await updateUserSettings(payload);
        applyIncomingSettings(saved);
      } catch (err) {
        console.error('failed to save settings', err);
      }
    },
    [
      linkInheritMode,
      selectedTheme,
      cheatBits,
      showCASValidation,
      showTimer,
      showWarnings,
      showSolventText,
      showExchangeText,
      showMissingText,
      showCreation,
      applyIncomingSettings,
    ],
  );

  useEffect(() => {
    fetchUserSettings()
      .then((settings) => {
        applyIncomingSettings(settings);
      })
      .catch((err) => {
        console.error('failed to load settings', err);
        setCheatBits(DEFAULT_CHEATS);
        setShowCASValidation(true);
        setShowTimer(true);
        setShowWarnings(true);
        setShowSolventText(true);
        setShowExchangeText(true);
        setShowMissingText(true);
        setShowCreation(true);
        setSelectedTheme('Light');
        setSelectedPreset('User');
      })
      .finally(() => {
        setLoadingLinkSettings(false);
      });
  }, [applyIncomingSettings]);

  const handleSolventPreferenceChange = useCallback(
    async (solventId: number, preference: number) => {
      const prev = solvents;
      setSolvents((current) => current.map((item) => (
        item.id === solventId ? { ...item, preference, selected_name: item.options[preference] ?? item.selected_name } : item
      )));

      try {
        const updated = await updateSolventPreference(solventId, preference);
        setSolvents((current) => current
          .map((item) => {
            if (item.id !== solventId) return item;
            // Merge only the fields that are expected to change locally (do not
            // overwrite `match` or `display` which the user may edit manually).
            return {
              ...item,
              preference: updated.preference,
              selected_name: updated.selected_name,
              count: updated.count,
            };
          })
          .sort((a, b) => (b.count - a.count) || (a.id - b.id)));

        if (selectedExerciseId !== null) {
          void selectExerciseById(selectedExerciseId);
        }
      } catch (err) {
        console.error('failed to update solvent preference', err);
        setSolvents(prev);
      }
    },
    [solvents, selectedExerciseId, selectExerciseById],
  );

const handleChangeLinkInheritMode = useCallback(
  async (mode: LinkInheritMode) => {
    setLinkInheritMode(mode);
    setSelectedPreset('User');
    void persistUserSettings({ link_inherit_mode: mode });
  },
  [persistUserSettings],
);

const handleApplyPreset = useCallback(
  async (presetName: string) => {
    setSelectedPreset(presetName);

    try {
      const applied = await applySettingsPreset(presetName);
      applyIncomingSettings(applied);
    } catch (err) {
      console.error('failed to apply settings preset', err);
    }
  },
  [applyIncomingSettings],
);

const handleThemeChange = useCallback(
  (theme: string) => {
    setSelectedTheme(theme);
    setSelectedPreset('User');
    void persistUserSettings({ theme });
  },
  [persistUserSettings],
);

const handleShowCASValidationChange = useCallback(
  (value: boolean) => {
    setShowCASValidation(value);
    setSelectedPreset('User');
    void persistUserSettings({ show_CAS: value });
  },
  [persistUserSettings],
);

const handleShowTimerChange = useCallback(
  (value: boolean) => {
    setShowTimer(value);
    setSelectedPreset('User');
    void persistUserSettings({ show_timer: value });
  },
  [persistUserSettings],
);

const handleShowWarningsChange = useCallback(
  (value: boolean) => {
    setShowWarnings(value);
    setSelectedPreset('User');
    void persistUserSettings({ show_warnings: value });
  },
  [persistUserSettings],
);

const handleShowSolventTextChange = useCallback(
  (value: boolean) => {
    setShowSolventText(value);
    setSelectedPreset('User');
    void persistUserSettings({ show_solvent: value });
  },
  [persistUserSettings],
);

const handleShowExchangeTextChange = useCallback(
  (value: boolean) => {
    setShowExchangeText(value);
    setSelectedPreset('User');
    void persistUserSettings({ show_exchange: value });
  },
  [persistUserSettings],
);

const handleShowMissingTextChange = useCallback(
  (value: boolean) => {
    setShowMissingText(value);
    setSelectedPreset('User');
    void persistUserSettings({ show_missing: value });
  },
  [persistUserSettings],
);

const handleShowCreationChange = useCallback(
  (value: boolean) => {
    setShowCreation(value);
    setSelectedPreset('User');
    void persistUserSettings({ show_creation: value });
  },
  [persistUserSettings],
);

const handleCheatBitsChange = useCallback(
  (bits: string) => {
    const normalized = normalizeCheatBits(bits);
    setCheatBits(normalized);
    setSelectedPreset('User');
    void persistUserSettings({ cheats: normalized });
  },
  [persistUserSettings],
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

  const showCorrectDbeCheat = cheating.showCorrectDbe;
  const showAltNucleiTablesCheat = cheating.showAltNucleiTables;
  const exerciseDbeValue = selectedExercise?.dbe ?? null;
  const effectiveFormulaDbe = showCorrectDbeCheat ? exerciseDbeValue : savedFormulaDbe;
  const displayedFormulaDbe = showCorrectDbeCheat
    ? (exerciseDbeValue === null ? '' : String(exerciseDbeValue))
    : formulaDbeDraft;

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
    effectiveFormulaDbe,
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

  const altNucleusTables = useMemo<AltNucleusTable[]>(() => {
    if (!showAltNucleiTablesCheat || !selectedExercise) {
      return [];
    }

    const rows = Array.isArray(selectedExercise.alt_nuclei)
      ? selectedExercise.alt_nuclei
      : [];

    if (rows.length === 0) {
      return [];
    }

    const grouped = new Map<string, { nucleus: string; rows: typeof rows }>();

    for (const row of rows) {
      const nucleus = row.nucleus?.trim() || '?';
      const key = nucleus;
      const existing = grouped.get(key);

      if (existing) {
        existing.rows.push(row);
      } else {
        grouped.set(key, { nucleus, rows: [row] });
      }
    }

    return Array.from(grouped.entries()).map(([key, group]) => {
      const peaks = [...group.rows]
        .sort((a, b) => b.ppm - a.ppm)
        .map((row) => ({
          id: `N${row.id}`,
          ppm: row.ppm,
          multiplicity: formatAltNucleusMultiplicity(
            row.atom_count,
            row.multiplicity,
            row.j_values_hz_csv,
          ),
        }));

      return {
        key,
        title: `${renderSuperscriptNucleus(group.nucleus)} peaks (ppm)`,
        peaks,
      };
    });
  }, [selectedExercise, showAltNucleiTablesCheat]);

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
          <button
            type="button"
            onClick={() => setSettingsPanelOpen(true)}
            title="Open settings"
            aria-label="Open settings"
            onMouseEnter={() => setSettingsHover(true)}
            onMouseLeave={() => setSettingsHover(false)}
            style={{
              width: 36,
              height: 36,
              padding: 1,
              border: 'none',
              background: 'white',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
          <svg style={{ verticalAlign: 'middle', position: 'absolute', transition: 'all 0.7s ease-in-out', opacity: settingsHover ? 0 : 1 }} 
          	width="32px" height="32px" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" fill="none"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g><path fill="#555" d="m80.16 29.054-5.958-.709 5.958.71Zm31.68 0-5.958.71 5.958-.71Zm34.217 19.756-2.365-5.515 2.365 5.514Zm10.081 3.352 5.196-3-5.196 3Zm7.896 13.676 5.196-3-5.196 3Zm-2.137 10.407-3.594-4.805 3.594 4.805Zm0 39.51 3.593-4.805-3.593 4.805Zm2.137 10.407 5.196 3-5.196-3Zm-7.896 13.676-5.196-3 5.196 3Zm-10.081 3.353 2.364-5.515-2.364 5.515Zm-34.217 19.755 5.958.709-5.958-.709Zm-31.68 0-5.958.709 5.958-.709Zm-34.217-19.755-2.364-5.515 2.364 5.515Zm-10.08-3.353-5.197 3 5.196-3Zm-7.897-13.676 5.196-3-5.196 3Zm2.137-10.407 3.594 4.805-3.594-4.805Zm0-39.51L26.51 81.05l3.593-4.805Zm-2.137-10.407 5.196 3-5.196-3Zm7.896-13.676-5.196-3 5.196 3Zm10.081-3.352-2.364 5.514 2.364-5.514Zm7.85 3.365-2.365 5.515 2.364-5.515Zm0 87.65 2.364 5.514-2.365-5.514ZM36.235 111.17l-3.594-4.805 3.594 4.805Zm76.823 41.535 5.958.71-5.958-.71Zm39.854-69.742-3.593-4.805 3.593 4.805Zm-16.369-30.074 2.364 5.514-2.364-5.514Zm-23.485-13.594-5.958.709 5.958-.71ZM88.104 16a14 14 0 0 0-13.902 12.345l11.916 1.419A2 2 0 0 1 88.104 28V16Zm15.792 0H88.104v12h15.792V16Zm13.902 12.345A14 14 0 0 0 103.896 16v12a2 2 0 0 1 1.986 1.764l11.916-1.419Zm1.219 10.24-1.219-10.24-11.916 1.419 1.219 10.24 11.916-1.419Zm24.675 4.71-9.513 4.08 4.729 11.028 9.513-4.08-4.729-11.028Zm17.642 5.867a14 14 0 0 0-17.642-5.867l4.729 11.029a2 2 0 0 1 2.521.838l10.392-6Zm7.896 13.676-7.896-13.676-10.392 6 7.896 13.676 10.392-6Zm-3.74 18.212a14 14 0 0 0 3.74-18.212l-10.392 6a2 2 0 0 1-.535 2.602l7.187 9.61Zm-8.984 6.718 8.984-6.718-7.187-9.61-8.983 6.718 7.186 9.61Zm8.984 23.182-8.984-6.718-7.186 9.61 8.983 6.718 7.187-9.61Zm3.74 18.212a14 14 0 0 0-3.74-18.212l-7.187 9.61a2 2 0 0 1 .535 2.602l10.392 6Zm-7.896 13.676 7.896-13.676-10.392-6-7.896 13.676 10.392 6Zm-17.642 5.867a14 14 0 0 0 17.642-5.867l-10.392-6a2.001 2.001 0 0 1-2.521.838l-4.729 11.029Zm-9.513-4.08 9.513 4.08 4.729-11.029-9.512-4.079-4.73 11.028Zm-16.381 19.03 1.219-10.24-11.916-1.419-1.219 10.24 11.916 1.419ZM103.896 176a14 14 0 0 0 13.902-12.345l-11.916-1.419a2 2 0 0 1-1.986 1.764v12Zm-15.792 0h15.792v-12H88.104v12Zm-13.902-12.345A14 14 0 0 0 88.104 176v-12a2 2 0 0 1-1.986-1.764l-11.916 1.419Zm-1.012-8.504 1.012 8.504 11.916-1.419-1.012-8.504-11.916 1.419ZM51.428 134.31l-7.85 3.366 4.73 11.029 7.849-3.366-4.73-11.029Zm-7.85 3.366a2 2 0 0 1-2.52-.838l-10.392 6a14 14 0 0 0 17.642 5.867l-4.73-11.029Zm-2.52-.838-7.896-13.676-10.392 6 7.896 13.676 10.392-6Zm-7.896-13.676a2 2 0 0 1 .535-2.602l-7.187-9.61a14 14 0 0 0-3.74 18.212l10.392-6Zm.535-2.602 6.132-4.585-7.187-9.61-6.132 4.585 7.187 9.61ZM26.51 81.05l6.132 4.586 7.187-9.61-6.132-4.586-7.187 9.61Zm-3.74-18.212a14 14 0 0 0 3.74 18.212l7.187-9.61a2 2 0 0 1-.535-2.602l-10.392-6Zm7.896-13.676L22.77 62.838l10.392 6 7.896-13.676-10.392-6Zm17.642-5.867a14 14 0 0 0-17.642 5.867l10.392 6a2 2 0 0 1 2.52-.838l4.73-11.029Zm7.849 3.366-7.85-3.366-4.729 11.029 7.85 3.366 4.729-11.029Zm18.045-18.316-1.012 8.504 11.916 1.419 1.012-8.504-11.916-1.419Zm-1.754 27.552c6.078-3.426 11.69-9.502 12.658-17.63L73.19 36.85c-.382 3.209-2.769 6.415-6.635 8.595l5.893 10.453Zm-21.02 1.793c7.284 3.124 15.055 1.57 21.02-1.793l-5.893-10.453c-3.704 2.088-7.481 2.468-10.398 1.217l-4.73 11.029ZM49 96c0-7.1-2.548-15.022-9.171-19.975l-7.187 9.61C35.36 87.668 37 91.438 37 96h12Zm23.448 40.103c-5.965-3.363-13.736-4.917-21.02-1.793l4.729 11.029c2.917-1.251 6.694-.871 10.398 1.218l5.893-10.454Zm-32.62-20.128C46.452 111.022 49 103.1 49 96H37c0 4.563-1.64 8.333-4.358 10.365l7.187 9.61Zm78.679 19.575c-5.536 3.298-10.517 8.982-11.406 16.446l11.916 1.419c.329-2.765 2.318-5.582 5.632-7.557l-6.142-10.308Zm20.402-1.953c-7.094-3.042-14.669-1.463-20.402 1.953l6.142 10.308c3.382-2.015 6.872-2.372 9.53-1.233l4.73-11.028Zm-53.803 20.135c-.968-8.127-6.58-14.202-12.658-17.629l-5.893 10.454c3.866 2.179 6.253 5.385 6.635 8.594l11.916-1.419ZM141 96c0 6.389 2.398 13.414 8.32 17.842l7.186-9.61C154.374 102.638 153 99.668 153 96h-12Zm8.32-17.842C143.398 82.586 141 89.61 141 96h12c0-3.668 1.374-6.638 3.506-8.232l-7.186-9.61ZM118.507 56.45c5.733 3.416 13.308 4.995 20.401 1.953l-4.729-11.029c-2.658 1.14-6.148.782-9.53-1.233l-6.142 10.31Zm-11.406-16.446c.889 7.464 5.87 13.148 11.406 16.446l6.142-10.309c-3.314-1.974-5.303-4.79-5.632-7.556l-11.916 1.419Z"></path><path stroke="#555" stroke-linecap="round" stroke-linejoin="round" stroke-width="12" d="M96 120c13.255 0 24-10.745 24-24s-10.745-24-24-24-24 10.745-24 24 10.745 24 24 24Z"></path></g></svg>
          <svg style={{ verticalAlign: 'middle', position: 'absolute', transition: 'all 0.7s ease-in-out', opacity: settingsHover ? 1 : 0, transform: 'rotate(90deg)' }} 
          width="32px" height="32px" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" fill="none"><g stroke-width="0"></g><g stroke-linecap="round" stroke-linejoin="round"></g><g><path fill="#555" d="m80.16 29.054-5.958-.709 5.958.71Zm31.68 0-5.958.71 5.958-.71Zm34.217 19.756-2.365-5.515 2.365 5.514Zm10.081 3.352 5.196-3-5.196 3Zm7.896 13.676 5.196-3-5.196 3Zm-2.137 10.407-3.594-4.805 3.594 4.805Zm0 39.51 3.593-4.805-3.593 4.805Zm2.137 10.407 5.196 3-5.196-3Zm-7.896 13.676-5.196-3 5.196 3Zm-10.081 3.353 2.364-5.515-2.364 5.515Zm-34.217 19.755 5.958.709-5.958-.709Zm-31.68 0-5.958.709 5.958-.709Zm-34.217-19.755-2.364-5.515 2.364 5.515Zm-10.08-3.353-5.197 3 5.196-3Zm-7.897-13.676 5.196-3-5.196 3Zm2.137-10.407 3.594 4.805-3.594-4.805Zm0-39.51L26.51 81.05l3.593-4.805Zm-2.137-10.407 5.196 3-5.196-3Zm7.896-13.676-5.196-3 5.196 3Zm10.081-3.352-2.364 5.514 2.364-5.514Zm7.85 3.365-2.365 5.515 2.364-5.515Zm0 87.65 2.364 5.514-2.365-5.514ZM36.235 111.17l-3.594-4.805 3.594 4.805Zm76.823 41.535 5.958.71-5.958-.71Zm39.854-69.742-3.593-4.805 3.593 4.805Zm-16.369-30.074 2.364 5.514-2.364-5.514Zm-23.485-13.594-5.958.709 5.958-.71ZM88.104 16a14 14 0 0 0-13.902 12.345l11.916 1.419A2 2 0 0 1 88.104 28V16Zm15.792 0H88.104v12h15.792V16Zm13.902 12.345A14 14 0 0 0 103.896 16v12a2 2 0 0 1 1.986 1.764l11.916-1.419Zm1.219 10.24-1.219-10.24-11.916 1.419 1.219 10.24 11.916-1.419Zm24.675 4.71-9.513 4.08 4.729 11.028 9.513-4.08-4.729-11.028Zm17.642 5.867a14 14 0 0 0-17.642-5.867l4.729 11.029a2 2 0 0 1 2.521.838l10.392-6Zm7.896 13.676-7.896-13.676-10.392 6 7.896 13.676 10.392-6Zm-3.74 18.212a14 14 0 0 0 3.74-18.212l-10.392 6a2 2 0 0 1-.535 2.602l7.187 9.61Zm-8.984 6.718 8.984-6.718-7.187-9.61-8.983 6.718 7.186 9.61Zm8.984 23.182-8.984-6.718-7.186 9.61 8.983 6.718 7.187-9.61Zm3.74 18.212a14 14 0 0 0-3.74-18.212l-7.187 9.61a2 2 0 0 1 .535 2.602l10.392 6Zm-7.896 13.676 7.896-13.676-10.392-6-7.896 13.676 10.392 6Zm-17.642 5.867a14 14 0 0 0 17.642-5.867l-10.392-6a2.001 2.001 0 0 1-2.521.838l-4.729 11.029Zm-9.513-4.08 9.513 4.08 4.729-11.029-9.512-4.079-4.73 11.028Zm-16.381 19.03 1.219-10.24-11.916-1.419-1.219 10.24 11.916 1.419ZM103.896 176a14 14 0 0 0 13.902-12.345l-11.916-1.419a2 2 0 0 1-1.986 1.764v12Zm-15.792 0h15.792v-12H88.104v12Zm-13.902-12.345A14 14 0 0 0 88.104 176v-12a2 2 0 0 1-1.986-1.764l-11.916 1.419Zm-1.012-8.504 1.012 8.504 11.916-1.419-1.012-8.504-11.916 1.419ZM51.428 134.31l-7.85 3.366 4.73 11.029 7.849-3.366-4.73-11.029Zm-7.85 3.366a2 2 0 0 1-2.52-.838l-10.392 6a14 14 0 0 0 17.642 5.867l-4.73-11.029Zm-2.52-.838-7.896-13.676-10.392 6 7.896 13.676 10.392-6Zm-7.896-13.676a2 2 0 0 1 .535-2.602l-7.187-9.61a14 14 0 0 0-3.74 18.212l10.392-6Zm.535-2.602 6.132-4.585-7.187-9.61-6.132 4.585 7.187 9.61ZM26.51 81.05l6.132 4.586 7.187-9.61-6.132-4.586-7.187 9.61Zm-3.74-18.212a14 14 0 0 0 3.74 18.212l7.187-9.61a2 2 0 0 1-.535-2.602l-10.392-6Zm7.896-13.676L22.77 62.838l10.392 6 7.896-13.676-10.392-6Zm17.642-5.867a14 14 0 0 0-17.642 5.867l10.392 6a2 2 0 0 1 2.52-.838l4.73-11.029Zm7.849 3.366-7.85-3.366-4.729 11.029 7.85 3.366 4.729-11.029Zm18.045-18.316-1.012 8.504 11.916 1.419 1.012-8.504-11.916-1.419Zm-1.754 27.552c6.078-3.426 11.69-9.502 12.658-17.63L73.19 36.85c-.382 3.209-2.769 6.415-6.635 8.595l5.893 10.453Zm-21.02 1.793c7.284 3.124 15.055 1.57 21.02-1.793l-5.893-10.453c-3.704 2.088-7.481 2.468-10.398 1.217l-4.73 11.029ZM49 96c0-7.1-2.548-15.022-9.171-19.975l-7.187 9.61C35.36 87.668 37 91.438 37 96h12Zm23.448 40.103c-5.965-3.363-13.736-4.917-21.02-1.793l4.729 11.029c2.917-1.251 6.694-.871 10.398 1.218l5.893-10.454Zm-32.62-20.128C46.452 111.022 49 103.1 49 96H37c0 4.563-1.64 8.333-4.358 10.365l7.187 9.61Zm78.679 19.575c-5.536 3.298-10.517 8.982-11.406 16.446l11.916 1.419c.329-2.765 2.318-5.582 5.632-7.557l-6.142-10.308Zm20.402-1.953c-7.094-3.042-14.669-1.463-20.402 1.953l6.142 10.308c3.382-2.015 6.872-2.372 9.53-1.233l4.73-11.028Zm-53.803 20.135c-.968-8.127-6.58-14.202-12.658-17.629l-5.893 10.454c3.866 2.179 6.253 5.385 6.635 8.594l11.916-1.419ZM141 96c0 6.389 2.398 13.414 8.32 17.842l7.186-9.61C154.374 102.638 153 99.668 153 96h-12Zm8.32-17.842C143.398 82.586 141 89.61 141 96h12c0-3.668 1.374-6.638 3.506-8.232l-7.186-9.61ZM118.507 56.45c5.733 3.416 13.308 4.995 20.401 1.953l-4.729-11.029c-2.658 1.14-6.148.782-9.53-1.233l-6.142 10.31Zm-11.406-16.446c.889 7.464 5.87 13.148 11.406 16.446l6.142-10.309c-3.314-1.974-5.303-4.79-5.632-7.556l-11.916 1.419Z"></path><path stroke="#555" stroke-linecap="round" stroke-linejoin="round" stroke-width="12" d="M96 120c13.255 0 24-10.745 24-24s-10.745-24-24-24-24 10.745-24 24 10.745 24 24 24Z"></path></g></svg>
          
          </button>
          {selectedExercise ? (
            <div
              aria-label="Current exercise"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16 }}
            >
            {/*  <span style={{ fontWeight: 600 }}>
                {selectedExercise.name ?? `Exercise ${selectedExercise.id}`}
              </span> */}
              {selectedExercise.molecular_formula && (
                <span style={{ fontSize: 20, fontWeight: 700, color: '#555' }}>
                  {formatChemistryText(selectedExercise.molecular_formula.replace(/\[2\]H/g, 'D'))}
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 13, opacity: 0.6 }}>
              {loadingSelectedExercise
                ? 'Loading exercise...'
                : loadingExerciseSummaries
                ? 'Loading exercises...'
                : exerciseSummaries.length === 0
                  ? 'No exercises found'
                  : 'No exercise selected'}
            </span>
          )}
          <AdditionalSpectraPopup spectra={selectedExercise?.additional_spectra ?? []} />
          {cheating.isEnabled(1) && (
            <span
              title="Cheats are enabled for this exercise."
              style={{ cursor: 'help', display: 'inline-flex' }}
            >
              <img
                src={`${import.meta.env.BASE_URL}use_cheats.svg`}
                alt="Cheats enabled"
                style={{ width: 32, height: 32 }}
              />
            </span>
          )}
        </div>

        {/* Center: WarningPanel (takes remaining space, centered) */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {showWarnings && selectedExercise && !loadingSelectedExercise && (
            <WarningPanel />
          )}
        </div>

        {/* Right: student answer tools + editor + exercise menu + fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>

          {/* DBE input */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            DBE
            <input
              value={displayedFormulaDbe} placeholder='?'
              onChange={(e) => {
                if (!showCorrectDbeCheat) {
                  setFormulaDbeDraft(e.target.value);
                }
              }}
              onBlur={() => {
                if (!showCorrectDbeCheat) {
                  void handleSaveDbe();
                }
              }}
              onKeyDown={(e) => {
                if (!showCorrectDbeCheat && e.key === 'Enter') e.currentTarget.blur();
              }}
              disabled={showCorrectDbeCheat}
              title={showCorrectDbeCheat
                ? 'Cheat mode: showing the exercise DBE value from the exercises table.'
                : 'Enter the calculated double bond equivalent here.'}
              style={{
                width: 42,
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: showCorrectDbeCheat ? '#FF9800' : '#ccc',
                fontSize: 12,
                textAlign: 'center',
                fontWeight: showCorrectDbeCheat ? 700 : 400,
                background: showCorrectDbeCheat ? '#FFF3E0' : 'white',
              }}
            />
          </label>


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
                borderRadius: 12,
                height: 36,
                border: '1px solid #111',
                background: 'white',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0px 12px',
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

            {/* The button to reset the exercise */}
            <button
              type="button"
              onClick={() => void handleResetExercise()}
              title="Reset this exercise"
              style={{
                background: 'none',
                border: 'none',
                padding: '1px 3px',
                cursor: 'pointer',
                fontSize: 14,
                color: '#b33',
                lineHeight: 1,
                borderRadius: 4,
              }}
            >
              {'\u21BA'}
            </button>

            {showTimer && (
              <ExerciseTimerDisplay formattedDisplayedTimer={formattedDisplayedTimer} />
            )}

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
                    onImported={handleExercisesMutated}
                    onImportingChange={(isImporting) => { zipImportingRef.current = isImporting; }}
                    />
                  </div>

                  {showCreation ? (
                    <>
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
                          <ExerciseCreationForm onCreated={handleExercisesMutated} />
                        </div>
                      ) : null}
                    </>
                  ) : null}
              </div>
            </div>
          </div>

          <PauseExerciseButton
            onPause={() => {
              void handlePauseExercise();
            }}
            disabled={pauseButtonDisabled}
            title={pauseButtonTitle}
          />



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
              showCheatSegmentsOverlay={cheating.showSpectrumSegmentsOverlay}
              showSpectrumDataSource={cheating.showSpectrumDataSources}
              dataSource={selectedExercise?.h1_data_source ?? null}
              showSolventText={showSolventText}
              showExchangeText={showExchangeText}
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
              showCheatSegmentsOverlay={cheating.showSpectrumSegmentsOverlay}
              showSpectrumDataSource={cheating.showSpectrumDataSources}
              dataSource={selectedExercise?.c13_data_source ?? null}
              showSolventText={showSolventText}
              showExchangeText={showExchangeText}
              solvent={selectedExercise?.c13_solvent ?? null}
              frequencyMhz={selectedExercise?.c13_frequency_mhz ?? null}
              apt={selectedExercise?.c13_apt ?? false}
              peaks={c13SpectrumPeaks}
              axisRange={cAxisRange}
              onHoverPeak={(peakId) => {
                if (peakId === null) {
                  linking.setHoverPeakId(null);
                  return;
                }
                linking.setHoverPeakId(c13SpectrumToDisplayPeakId.get(peakId) ?? peakId);
              }}
              onSelectPeak={(peakId) => {
                linking.selectPeak(c13SpectrumToDisplayPeakId.get(peakId) ?? peakId);
              }}
              isHighlighted={(peakId) => {
                return linking.peakIsHighlighted(c13SpectrumToDisplayPeakId.get(peakId) ?? peakId);
              }}
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

          {altNucleusTables.map((table) => (
            <div key={table.key} style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{table.title}</div>
              <PeakList
                peaks={table.peaks}
                linksByPeak={linking.linksByPeak}
                selectedPeakId={linking.selectedPeakId}
                onSelectPeak={linking.selectPeak}
                onHoverPeak={linking.setHoverPeakId}
                isHighlighted={linking.peakIsHighlighted}
                dimNonHighlighted={linking.hasFocus}
                fragmentIndexMap={fragmentIndexMap}
                activeFragmentIds={activeFragmentIds}
              />
            </div>
          ))}
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
            overflowX: 'hidden',
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
            formulaDbe={effectiveFormulaDbe}
            showMissingText={showMissingText}
          />

          {/* CAS answer validation */}
          {showCASValidation && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 5 }}>
              <span
                style={{
                  width: 200,
                  fontSize: 12,
                  color: casAnswerIsCorrect ? '#0f5f0f' : '#b30000',
                  whiteSpace: 'nowrap',
                  visibility: casAnswerIsCorrect === null ? 'hidden' : 'visible',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                {casAnswerIsCorrect ? 'CAS answer is correct.' : 'CAS answer is incorrect.'}
              </span>

              <span style={{ justifyContent: 'center', whiteSpace: 'nowrap', alignItems: 'center', fontSize: 12 }}>Manual validation:</span>
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
              
            </div>
          )}

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
              </div>
            }
          />

         </div>

          <LogbookPanel />
        </div>

        

      </div>
      {/* Settingspanel dialog */}

      <SettingsPanel
        isOpen={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        linkInheritMode={linkInheritMode}
        onLinkInheritModeChange={handleChangeLinkInheritMode}
        selectedTheme={selectedTheme}
        availableThemes={['Light']}
        onThemeChange={handleThemeChange}
        selectedPreset={selectedPreset}
        availablePresets={availablePresets}
        onPresetChange={handleApplyPreset}
        showTimer={showTimer}
        onShowTimerChange={handleShowTimerChange}
        showCASValidation={showCASValidation}
        onShowCASValidationChange={handleShowCASValidationChange}
        showWarnings={showWarnings}
        onShowWarningsChange={handleShowWarningsChange}
        showSolventText={showSolventText}
        onShowSolventTextChange={handleShowSolventTextChange}
        showExchangeText={showExchangeText}
        onShowExchangeTextChange={handleShowExchangeTextChange}
        showMissingText={showMissingText}
        onShowMissingTextChange={handleShowMissingTextChange}
        showCreation={showCreation}
        onShowCreationChange={handleShowCreationChange}
        cheatBits={cheatBits}
        onCheatBitsChange={handleCheatBitsChange}
        solvents={solvents}
        solventsLoading={solventsLoading}
        onSolventPreferenceChange={handleSolventPreferenceChange}
        onTagsUpdated={handleTagsUpdated}
      />
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
