import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { WorkingSolution } from '../hooks/useWorkingSolution';
import { useExerciseData } from './ExerciseDataContext';
import { clearLogbook, fetchLogbook, saveLogbook } from '../api/logbook';
import { fetchExerciseStatistics } from '../api/exercises';

export type Link = { fragmentId: string; peakId: string };

type Common = { id: string; ts: number };

export type LogbookEntry = Common &
  (
    | { kind: 'create-fragment'; fragmentId: number; fragLabel: string }
    | { kind: 'delete-fragment'; fragmentId: number; fragLabel: string; removedLinks?: Link[]; }
    | {
        kind: 'edit-fragment';
        fragmentId: number;
        fragLabel: string;
        before: { smiles: string; mol_file: string };
        after: { smiles: string; mol_file: string };
      }
    | { kind: 'set-solution'; before: WorkingSolution | null; after: WorkingSolution }
    | { kind: 'set-dbe'; before: number | null; after: number | null }
    | { kind: 'clear-solution'; before: WorkingSolution }
    | {
        kind: 'send-to-fragments';
        createdFragmentId: number;
        fragLabel: string;
        previousSolution: WorkingSolution;
      }
    | {
        kind: 'merge-fragments';
        createdFragmentId: number;
        fragLabel: string;
        inheritedPeakIds: string[];
        beforeLinks: Link[];
        afterLinks: Link[];
      }
    | { kind: 'link'; fragmentId: string; peakId: string }
    | { kind: 'unlink'; fragmentId: string; peakId: string }
    | { kind: 'clear-links'; before: Link[] }
  );

export function describeEntry(entry: LogbookEntry): string {
  switch (entry.kind) {
    case 'create-fragment':
      return `Created fragment "${entry.fragLabel}"`;
    case 'delete-fragment':
      return `Deleted fragment "${entry.fragLabel}"`;
    case 'edit-fragment':
      return `Edited fragment "${entry.fragLabel}"`;
    case 'set-solution':
      return entry.before ? 'Updated working solution' : 'Set working solution';
    case 'set-dbe':
      return `Set DBE to ${entry.after ?? 'unset'}`;
    case 'clear-solution':
      return 'Cleared working solution';
    case 'send-to-fragments':
      return 'Sent working solution to fragments';
    case 'merge-fragments':
      return `Merged into "${entry.fragLabel}"`;
    case 'link':
      return `Linked peak ${entry.peakId} to a fragment`;
    case 'unlink':
      return `Unlinked peak ${entry.peakId} from a fragment`;
    case 'clear-links':
      return `Cleared all links (${entry.before.length})`;
  }
}

type ExerciseHistory = {
  entries: LogbookEntry[];
  cursor: number;
  links: Link[];
};

const emptyHistory: ExerciseHistory = { entries: [], cursor: 0, links: [] };

type HistoryHandlers = {
  deleteFragment: (id: number) => Promise<void>;
  restoreFragment: (id: number) => Promise<void>;
  updateFragment: (id: number, smiles: string, molFile: string) => Promise<void>;
  setSolution: (smiles: string, molFile: string) => Promise<void>;
  clearSolution: () => Promise<void>;
  setDbe: (value: number | null) => Promise<void>;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EntryInput = DistributiveOmit<LogbookEntry, 'id' | 'ts'>;

type HistoryContextValue = {
  entries: LogbookEntry[];
  cursor: number;
  links: Link[];
  canUndo: boolean;
  canRedo: boolean;
  isJumping: boolean;
  record: (entry: EntryInput) => void;
  setLinks: (links: Link[]) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  jumpTo: (cursor: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  registerHandlers: (handlers: HistoryHandlers) => void;
};

const HistoryContext = createContext<HistoryContextValue | undefined>(undefined);

const SAVE_DEBOUNCE_MS = 70;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const { selectedExerciseId, setSelectedExerciseStatistics } = useExerciseData();
  const selectedExerciseIdRef = useRef(selectedExerciseId);
  selectedExerciseIdRef.current = selectedExerciseId;
  const exerciseKey = selectedExerciseId !== null ? `exercise-${selectedExerciseId}` : 'none';

  const [allHistories, setAllHistories] = useState<Record<string, ExerciseHistory>>({});
  const [isJumping, setIsJumping] = useState(false);
  const [saveErrorExerciseKey, setSaveErrorExerciseKey] = useState<string | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const handlersRef = useRef<HistoryHandlers | null>(null);
  const applyingHistoryRef = useRef(false);

  const loadedRef = useRef<Set<string>>(new Set());
  const dirtyRef = useRef<Set<string>>(new Set());
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const latestHistoriesRef = useRef(allHistories);
  latestHistoriesRef.current = allHistories;

  useEffect(() => {
    const handleExerciseReset = (event: Event) => {
      const detail = (event as CustomEvent<{ exerciseIds?: number[] }>).detail;
      if (!Array.isArray(detail?.exerciseIds)) return;

      const keys = detail.exerciseIds.flatMap((id) => [String(id), `exercise-${id}`]);
      for (const key of keys) {
        loadedRef.current.delete(key);
        dirtyRef.current.delete(key);
        const timer = saveTimersRef.current.get(key);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          saveTimersRef.current.delete(key);
        }
      }
      const selectedKey = selectedExerciseIdRef.current === null
        ? null
        : `exercise-${selectedExerciseIdRef.current}`;
      if (selectedKey && keys.includes(selectedKey)) {
        setResetVersion((version) => version + 1);
      }
      setSaveErrorExerciseKey((current) => current && keys.includes(current) ? null : current);
      setAllHistories((previous) => {
        const next = { ...previous };
        let changed = false;
        for (const key of keys) {
          if (Object.hasOwn(next, key)) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : previous;
      });
    };

    window.addEventListener('exercise-reset', handleExerciseReset);
    return () => window.removeEventListener('exercise-reset', handleExerciseReset);
  }, []);

  useEffect(() => () => {
    for (const timer of saveTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    saveTimersRef.current.clear();
  }, []);

  // Load the logbook for the current exercise (once).
  useEffect(() => {
    // Skip loading if no valid exercise is selected or if the logbook is already loaded.
    if (exerciseKey === 'none' || loadedRef.current.has(exerciseKey)) return;

    let cancelled = false;

    fetchLogbook(exerciseKey).then((remote) => {
      if (cancelled) return;
      const parseArray = <T,>(value: unknown): T[] => {
        if (typeof value !== 'string') return [];
        try {
          const parsed: unknown = JSON.parse(value);
          return Array.isArray(parsed) ? parsed as T[] : [];
        } catch {
          return [];
        }
      };
      const next: ExerciseHistory = {
        entries: parseArray<LogbookEntry>(remote.entries_json),
        cursor: typeof remote.cursor === 'number' ? remote.cursor : 0,
        links: parseArray<Link>(remote.links_json),
      };
      loadedRef.current.add(exerciseKey);

      // The entries that were typed during loading should be kept
      setAllHistories((prev) => prev[exerciseKey] !== undefined
        ? { ...prev }
        : { ...prev, [exerciseKey]: next });
    }).catch((err) => console.error('logbook load failed', err));
    return () => { cancelled = true; };
  }, [exerciseKey, resetVersion]);

  // Persist only histories changed by an explicit logbook operation.
  useEffect(() => {
    if (isJumping) return;

    for (const key of dirtyRef.current) {
      if (!loadedRef.current.has(key) || !latestHistoriesRef.current[key] || saveTimersRef.current.has(key)) {
        continue;
      }
      const timer = window.setTimeout(() => {
        saveTimersRef.current.delete(key);
        if (!dirtyRef.current.delete(key)) return;
        const state = latestHistoriesRef.current[key];
        if (!state) return;

        saveLogbook(key, {
          entries_json: JSON.stringify(state.entries),
          cursor: state.cursor,
          links_json: JSON.stringify(state.links),
        }).then((savedState) => {
          setSaveErrorExerciseKey((current) => current === key ? null : current);
          const exerciseId = Number(key.replace(/^exercise-/, ''));
          if (savedState.timer_checkpointed && exerciseId === selectedExerciseIdRef.current) {
            fetchExerciseStatistics(exerciseId)
              .then(setSelectedExerciseStatistics)
              .catch((err) => console.error('logbook statistics refresh failed', err));
          }
        }, (err) => {
          console.error('logbook save failed', err);
          setSaveErrorExerciseKey(key);
        });
      }, SAVE_DEBOUNCE_MS);
      saveTimersRef.current.set(key, timer);
    }
  }, [allHistories, isJumping, setSelectedExerciseStatistics]);

  const current = allHistories[exerciseKey] ?? emptyHistory;

  const registerHandlers = useCallback((handlers: HistoryHandlers) => {
    handlersRef.current = handlers;
  }, []);

  const record = useCallback(
  (entry: EntryInput) => {
    if (applyingHistoryRef.current) return;

    dirtyRef.current.add(exerciseKey);
    setAllHistories((prev) => {
        const prior = prev[exerciseKey] ?? emptyHistory;
        const truncated = prior.entries.slice(0, prior.cursor);
        const newEntry = { ...entry, id: makeId(), ts: Date.now() } as LogbookEntry;
        return {
          ...prev,
          [exerciseKey]: {
            entries: [...truncated, newEntry],
            cursor: truncated.length + 1,
            links: prior.links,
          },
        };
      });
    },
    [exerciseKey],
  );


  const setLinks = useCallback(
    (links: Link[]) => {
      dirtyRef.current.add(exerciseKey);
      setAllHistories((prev) => {
        const prior = prev[exerciseKey] ?? emptyHistory;
        return { ...prev, [exerciseKey]: { ...prior, links } };
      });
    },
    [exerciseKey],
  );


  const clearHistory = useCallback(async () => {
    try {
      await clearLogbook(exerciseKey);

      setAllHistories((prev) => ({
        ...prev,
        [exerciseKey]: { entries: [], cursor: 0, links: [] },
      }));
    } catch (err) {
      console.error('clear logbook failed', err);
    }
  }, [exerciseKey]);

  // Reverse an action in the logbook (undo).
  const applyReverse = useCallback(async (entry: LogbookEntry): Promise<LogbookEntry> => {
    const h = handlersRef.current;

    if (!h) return entry;
    switch (entry.kind) {
      case 'create-fragment':
        await h.deleteFragment(entry.fragmentId);
        return entry;

      case 'delete-fragment': {
          await h.restoreFragment(entry.fragmentId);

          // Restore the links as well
          if (entry.removedLinks && entry.removedLinks.length > 0) {
            dirtyRef.current.add(exerciseKey);
            setAllHistories((prev) => {
              const prior = prev[exerciseKey] ?? emptyHistory;

              const linksToRestore = entry.removedLinks!.filter(
                (link) =>
                  !prior.links.some(
                    (existing) =>
                      existing.fragmentId === link.fragmentId &&
                      existing.peakId === link.peakId,
                  ),
              );

              return {
                ...prev,
                [exerciseKey]: {
                  ...prior,
                  links: [...prior.links, ...linksToRestore],
                },
              };
            });
          }

          return entry;
        }
      case 'edit-fragment':
        await h.updateFragment(entry.fragmentId, entry.before.smiles, entry.before.mol_file);
        return entry;
      case 'set-solution':
        if (entry.before) await h.setSolution(entry.before.smiles, entry.before.mol_file);
        else await h.clearSolution();
        return entry;
      case 'set-dbe':
        await h.setDbe(entry.before);
        return entry;
      case 'clear-solution':
        await h.setSolution(entry.before.smiles, entry.before.mol_file);
        return entry;
      case 'send-to-fragments':
        await h.deleteFragment(entry.createdFragmentId);
        await h.setSolution(entry.previousSolution.smiles, entry.previousSolution.mol_file);
        return entry;
      case 'merge-fragments': {
        await h.deleteFragment(entry.createdFragmentId);

        dirtyRef.current.add(exerciseKey);
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          return {
            ...prev,
            [exerciseKey]: {
              ...prior,
              links: entry.beforeLinks,
            },
          };
        });

        return entry;
      }
      case 'link':
        dirtyRef.current.add(exerciseKey);
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          const links = prior.links.filter(
            (l) => !(l.fragmentId === entry.fragmentId && l.peakId === entry.peakId),
          );
          return { ...prev, [exerciseKey]: { ...prior, links } };
        });
        return entry;
      case 'unlink':
        dirtyRef.current.add(exerciseKey);
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          if (prior.links.some((l) => l.fragmentId === entry.fragmentId && l.peakId === entry.peakId)) {
            return prev;
          }
          const links = [...prior.links, { fragmentId: entry.fragmentId, peakId: entry.peakId }];
          return { ...prev, [exerciseKey]: { ...prior, links } };
        });
        return entry;
      case 'clear-links':
        dirtyRef.current.add(exerciseKey);
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          return { ...prev, [exerciseKey]: { ...prior, links: entry.before } };
        });
        return entry;
    }
  }, [exerciseKey]);


  // Redo
  const applyForward = useCallback(async (entry: LogbookEntry): Promise<LogbookEntry> => {
    const h = handlersRef.current;

    if (!h) return entry;

    switch (entry.kind) {
      case 'create-fragment':
        await h.restoreFragment(entry.fragmentId);
        return entry;

      case 'delete-fragment': {
          await h.deleteFragment(entry.fragmentId);

          const fragmentId = String(entry.fragmentId);

          dirtyRef.current.add(exerciseKey);
          setAllHistories((prev) => {
            const prior = prev[exerciseKey] ?? emptyHistory;

            return {
              ...prev,
              [exerciseKey]: {
                ...prior,
                links: prior.links.filter((link) => link.fragmentId !== fragmentId),
              },
            };
          });

          return entry;
        }
      case 'edit-fragment':
        await h.updateFragment(entry.fragmentId, entry.after.smiles, entry.after.mol_file);
        return entry;
      case 'set-solution':
        await h.setSolution(entry.after.smiles, entry.after.mol_file);
        return entry;
      case 'set-dbe':
        await h.setDbe(entry.after);
        return entry;
      case 'clear-solution':
        await h.clearSolution();
        return entry;
      case 'send-to-fragments':
        await h.restoreFragment(entry.createdFragmentId);
        await h.clearSolution();
        return entry;
      case 'merge-fragments': {
        await h.restoreFragment(entry.createdFragmentId);

        dirtyRef.current.add(exerciseKey);
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          return {
            ...prev,
            [exerciseKey]: {
              ...prior,
              links: entry.afterLinks,
            },
          };
        });

        return entry;
      }
      case 'link':
        dirtyRef.current.add(exerciseKey);
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          if (prior.links.some((l) => l.fragmentId === entry.fragmentId && l.peakId === entry.peakId)) {
            return prev;
          }
          const links = [...prior.links, { fragmentId: entry.fragmentId, peakId: entry.peakId }];
          return { ...prev, [exerciseKey]: { ...prior, links } };
        });
        return entry;
      case 'unlink':
        dirtyRef.current.add(exerciseKey);
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          const links = prior.links.filter(
            (l) => !(l.fragmentId === entry.fragmentId && l.peakId === entry.peakId),
          );
          return { ...prev, [exerciseKey]: { ...prior, links } };
        });
        return entry;
      case 'clear-links':
        dirtyRef.current.add(exerciseKey);
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          return { ...prev, [exerciseKey]: { ...prior, links: [] } };
        });
        return entry;
    }
  }, [exerciseKey]);

  const undo = useCallback(async () => {
    if (applyingHistoryRef.current) return;
    applyingHistoryRef.current = true;
    try {
      const state = allHistories[exerciseKey] ?? emptyHistory;
      if (state.cursor === 0) return;
      const entry = state.entries[state.cursor - 1];
      const updated = await applyReverse(entry);
      dirtyRef.current.add(exerciseKey);
      setAllHistories((prev) => {
        const prior = prev[exerciseKey] ?? emptyHistory;
        const entries = [...prior.entries];
        entries[state.cursor - 1] = updated;
        return { ...prev, [exerciseKey]: { ...prior, entries, cursor: state.cursor - 1 } };
      });
    } finally {
      applyingHistoryRef.current = false;
    }
  }, [allHistories, exerciseKey, applyReverse]);

  const redo = useCallback(async () => {
    if (applyingHistoryRef.current) return;
    applyingHistoryRef.current = true;
    try {
      const state = allHistories[exerciseKey] ?? emptyHistory;
      if (state.cursor >= state.entries.length) return;
      const entry = state.entries[state.cursor];
      const updated = await applyForward(entry);
      dirtyRef.current.add(exerciseKey);
      setAllHistories((prev) => {
        const prior = prev[exerciseKey] ?? emptyHistory;
        const entries = [...prior.entries];
        entries[state.cursor] = updated;
        return { ...prev, [exerciseKey]: { ...prior, entries, cursor: state.cursor + 1 } };
      });
    } finally {
      applyingHistoryRef.current = false;
    }
  }, [allHistories, exerciseKey, applyForward]);

  const jumpTo = useCallback(
  async (target: number) => {
    if (applyingHistoryRef.current) return;
    applyingHistoryRef.current = true;

    try {
      const initialState = allHistories[exerciseKey] ?? emptyHistory;
      const clamped = Math.max(0, Math.min(target, initialState.entries.length));
      if (clamped === initialState.cursor) return;

      // When isJumping is True, the intermediate states are not visible.
      setIsJumping(true);
      try {
        // Walk through entries with a locally-tracked cursor.
        let cursor = initialState.cursor;
        while (cursor !== clamped) {
          if (clamped < cursor) {
            const entry = initialState.entries[cursor - 1];
            await applyReverse(entry);
            cursor -= 1;
          } else {
            const entry = initialState.entries[cursor];
            await applyForward(entry);
            cursor += 1;
          }
        }

        // Update the cursor in the logbook's state.
        dirtyRef.current.add(exerciseKey);
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          return { ...prev, [exerciseKey]: { ...prior, cursor } };
        });
      } finally {
        setIsJumping(false);
      }
    } finally {
      applyingHistoryRef.current = false;
    }
    },
    [allHistories, exerciseKey, applyReverse, applyForward],
  );
  
  
  useEffect(() => {
    function isTextFocused(): boolean {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    }

    function handler(e: KeyboardEvent) {
      const modifier = e.ctrlKey || e.metaKey;
      if (!modifier) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      if (isTextFocused()) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) void redo();
      else void undo();
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const value = useMemo<HistoryContextValue>(
    () => ({
      entries: current.entries,
      cursor: current.cursor,
      links: current.links,
      canUndo: current.cursor > 0,
      canRedo: current.cursor < current.entries.length,
      isJumping,
      record,
      setLinks,
      undo,
      redo,
      jumpTo,
      clearHistory,
      registerHandlers,
    }),
    [current, isJumping, record, setLinks, undo, redo, jumpTo, clearHistory, registerHandlers],
  );

  return (
    <HistoryContext.Provider value={value}>
      {saveErrorExerciseKey === exerciseKey ? (
        <div className="logbook-save-error" role="alert">
          Logbook save failed. Your recent changes may not be saved.
        </div>
      ) : null}
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within a HistoryProvider');
  return ctx;
}
