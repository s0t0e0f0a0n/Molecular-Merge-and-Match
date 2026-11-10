import { useCallback, useEffect, useRef, useState } from 'react';

export type WorkingSolution = {
  smiles: string;
  mol_file: string;
};

const API = `/api/v1/working-solution`;

export function useWorkingSolution(exerciseId: string) {
  const [solution, setSolutionState] = useState<WorkingSolution | null>(null);
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
      if (!res.ok) throw new Error(`Failed to load working solution (${res.status})`);
      const data: WorkingSolution | null = await res.json();
      if (
        signal?.aborted ||
        requestId !== requestIdRef.current ||
        currentExerciseIdRef.current !== exerciseId
      ) {
        return;
      }
      setSolutionState(data);
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      if (
        requestId === requestIdRef.current &&
        currentExerciseIdRef.current === exerciseId
      ) {
        const fetchError = err instanceof Error ? err : new Error(String(err));
        setError(fetchError);
        console.error('Failed to load working solution', fetchError);
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
    // Removed setSolutionState(null) to prevent flickering of WorkingFragmentsStrip
    // during exercise transitions - let the old solution fade out smoothly instead
    // setSolutionState(null);
    setError(null);
    if (exerciseId === 'exercise-none') {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    void refetch(controller.signal);
    return () => controller.abort();
  }, [exerciseId, refetch]);

  const setSolution = useCallback(
    async (smiles: string, molFile: string) => {
      const res = await fetch(`${API}/?exercise_id=${encodeURIComponent(exerciseId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles, mol_file: molFile }),
      });
      if (res.ok) await refetch();
    },
    [exerciseId, refetch],
  );

  const clearSolution = useCallback(async () => {
    const res = await fetch(`${API}/?exercise_id=${encodeURIComponent(exerciseId)}`, {
      method: 'DELETE',
    });
    if (res.ok && currentExerciseIdRef.current === exerciseId) {
      setSolutionState(null);
    }
  }, [exerciseId]);

  return { solution, loading, error, setSolution, clearSolution, refetch };
}
