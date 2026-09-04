import { useCallback, useEffect, useState } from 'react';

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

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`${API}/?exercise_id=${encodeURIComponent(exerciseId)}`);
      if (res.ok) setFragments(await res.json());
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

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

  return { fragments, loading, createFragment, updateFragment, deleteFragment, restoreFragment, refetch };
}
