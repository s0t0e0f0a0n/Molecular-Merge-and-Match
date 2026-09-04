import { useCallback, useEffect, useState } from 'react';

export type WorkingSolution = {
  smiles: string;
  mol_file: string;
};

const API = `/api/v1/working-solution`;

export function useWorkingSolution(exerciseId: string) {
  const [solution, setSolutionState] = useState<WorkingSolution | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`${API}/?exercise_id=${encodeURIComponent(exerciseId)}`);
      if (res.ok) {
        const data = await res.json();
        setSolutionState(data);
      }
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

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
    if (res.ok) {
      setSolutionState(null);
    }
  }, [exerciseId]);

  return { solution, loading, setSolution, clearSolution, refetch };
}
