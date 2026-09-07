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
  const { selectedExerciseId } = useExerciseData();
  const exerciseKey = selectedExerciseId !== null ? `exercise-${selectedExerciseId}` : 'none';

  const [allHistories, setAllHistories] = useState<Record<string, ExerciseHistory>>({});
  const [isJumping, setIsJumping] = useState(false);
  const handlersRef = useRef<HistoryHandlers | null>(null);
  const applyingHistoryRef = useRef(false);

  const loadedRef = useRef<Set<string>>(new Set());

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
      setAllHistories((prev) => {
        if (prev[exerciseKey] !== undefined) return prev;
        return { ...prev, [exerciseKey]: next };
      });
    }).catch((err) => console.error('logbook load failed', err));
    return () => { cancelled = true; };
  }, [exerciseKey]);

  // Save very time the logbook changes
  useEffect(() => {
    const state = allHistories[exerciseKey];
    if (!state || !loadedRef.current.has(exerciseKey)) return;
    
    // Saves should not be fired during undo/redo steps
    if (isJumping) return;
    
    const t = window.setTimeout(() => {
      saveLogbook(exerciseKey, {
        entries_json: JSON.stringify(state.entries),
        cursor: state.cursor,
        links_json: JSON.stringify(state.links),
      }).catch((err) => console.error('logbook save failed', err));
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [allHistories, exerciseKey, isJumping]);

  const current = allHistories[exerciseKey] ?? emptyHistory;

  const registerHandlers = useCallback((handlers: HistoryHandlers) => {
    handlersRef.current = handlers;
  }, []);

  const record = useCallback(
  (entry: EntryInput) => {
    if (applyingHistoryRef.current) return;

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
      case 'clear-solution':
        await h.setSolution(entry.before.smiles, entry.before.mol_file);
        return entry;
      case 'send-to-fragments':
        await h.deleteFragment(entry.createdFragmentId);
        await h.setSolution(entry.previousSolution.smiles, entry.previousSolution.mol_file);
        return entry;
      case 'merge-fragments': {
        await h.deleteFragment(entry.createdFragmentId);

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
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          const links = prior.links.filter(
            (l) => !(l.fragmentId === entry.fragmentId && l.peakId === entry.peakId),
          );
          return { ...prev, [exerciseKey]: { ...prior, links } };
        });
        return entry;
      case 'unlink':
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
      case 'clear-solution':
        await h.clearSolution();
        return entry;
      case 'send-to-fragments':
        await h.restoreFragment(entry.createdFragmentId);
        await h.clearSolution();
        return entry;
      case 'merge-fragments': {
        await h.restoreFragment(entry.createdFragmentId);

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
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          const links = prior.links.filter(
            (l) => !(l.fragmentId === entry.fragmentId && l.peakId === entry.peakId),
          );
          return { ...prev, [exerciseKey]: { ...prior, links } };
        });
        return entry;
      case 'clear-links':
        setAllHistories((prev) => {
          const prior = prev[exerciseKey] ?? emptyHistory;
          return { ...prev, [exerciseKey]: { ...prior, links: [] } };
        });
        return entry;
    }
  }, [exerciseKey]);

  const undo = useCallback(async () => {
    const state = allHistories[exerciseKey] ?? emptyHistory;
    if (state.cursor === 0) return;
    const entry = state.entries[state.cursor - 1];
    const updated = await applyReverse(entry);
    setAllHistories((prev) => {
      const prior = prev[exerciseKey] ?? emptyHistory;
      const entries = [...prior.entries];
      entries[state.cursor - 1] = updated;
      return { ...prev, [exerciseKey]: { ...prior, entries, cursor: state.cursor - 1 } };
    });
  }, [allHistories, exerciseKey, applyReverse]);

  const redo = useCallback(async () => {
    const state = allHistories[exerciseKey] ?? emptyHistory;
    if (state.cursor >= state.entries.length) return;
    const entry = state.entries[state.cursor];
    const updated = await applyForward(entry);
    setAllHistories((prev) => {
      const prior = prev[exerciseKey] ?? emptyHistory;
      const entries = [...prior.entries];
      entries[state.cursor] = updated;
      return { ...prev, [exerciseKey]: { ...prior, entries, cursor: state.cursor + 1 } };
    });
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

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within a HistoryProvider');
  return ctx;
}
