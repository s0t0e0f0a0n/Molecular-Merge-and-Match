import { useCallback, useEffect, useState } from 'react';

export type PredefinedFragment = {
    id: number;
    name: string;
    smiles: string;
    keywords: string;
};

const API = `/api/v1/predefined-fragments`;

export function usePredefinedFragments() {
    const [fragments, setFragments] = useState<PredefinedFragment[]>([]);
    const [loading, setLoading] = useState(true);

    const refetch = useCallback(async (search?: string) => {
        try {
            const url = search ? `${API}/?search=${encodeURIComponent(search)}` : `${API}/`;
            const res = await fetch(url);
            if (res.ok) setFragments(await res.json());
        }
        finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
      refetch();
    }, [refetch]);

    return { fragments, loading, refetch };
}