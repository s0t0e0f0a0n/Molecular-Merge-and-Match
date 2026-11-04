import { useCallback, useEffect, useRef, useState } from 'react';

export type BackendFragment = {
  id: number;
  exercise_id: string;
  label: string;
  smiles: string;
  mol_file: string;
};

const API = `/api/v1/fragments`;

export function useFragments(exerciseId: string) {
  const [fragments, setFragments] = useState<BackendFragment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const currentExerciseIdRef = useRef(exerciseId);
  const requestIdRef = useRef(0);
  currentExerciseIdRef.current = exerciseId;

  const refetch = useCallback(async (signal?: AbortSignal) => {
    if (exerciseId === 'exercise-none') return;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/?exercise_id=${encodeURIComponent(exerciseId)}`, { signal });
      if (!res.ok) throw new Error(`Failed to load fragments (${res.status})`);
      const data: BackendFragment[] = await res.json();
      if (
        signal?.aborted ||
        requestId !== requestIdRef.current ||
        currentExerciseIdRef.current !== exerciseId
      ) {
        return;
      }
      setFragments(data);
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      if (
        requestId === requestIdRef.current &&
        currentExerciseIdRef.current === exerciseId
      ) {
        const fetchError = err instanceof Error ? err : new Error(String(err));
        setError(fetchError);
        console.error('Failed to load fragments', fetchError);
      }
    } finally {
      if (
        !signal?.aborted &&
        requestId === requestIdRef.current &&
        currentExerciseIdRef.current === exerciseId
      ) {
        setLoading(false);
      }
    }
  }, [exerciseId]);

  useEffect(() => {
    const controller = new AbortController();
    setFragments([]);
    setError(null);
    if (exerciseId === 'exercise-none') {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    void refetch(controller.signal);
    return () => controller.abort();
  }, [exerciseId, refetch]);

  const createFragment = useCallback(
    async (label: string, smiles: string, molFile: string): Promise<number | null> => {
      const res = await fetch(`${API}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_id: exerciseId, label, smiles, mol_file: molFile }),
      });
      if (!res.ok) return null;
      const created = (await res.json().catch(() => null)) as BackendFragment | null;
      await refetch();
      return created?.id ?? null;
    },
    [exerciseId, refetch],
  );

  const updateFragment = useCallback(
    async (id: number, smiles: string, molFile: string): Promise<boolean> => {
      const res = await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles, mol_file: molFile }),
      });
      if (!res.ok) return false;
      await refetch();
      return true;
    },
    [refetch],
  );

  const deleteFragment = useCallback(
    async (id: number) => {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (res.ok) await refetch();
      return res.ok;
    },
    [refetch],
  );

  const restoreFragment = useCallback(
    async (id: number) => {
      const res = await fetch(`${API}/${id}/restore`, { method: 'POST' });
      if (res.ok) await refetch();
    },
    [refetch],
  );

  return { fragments, loading, error, createFragment, updateFragment, deleteFragment, restoreFragment, refetch };
}
