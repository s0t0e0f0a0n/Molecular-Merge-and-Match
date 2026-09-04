import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RDKitModule } from '@rdkit/rdkit';

type RDKitContextValue = {
  rdkit: RDKitModule | null;
  loading: boolean;
  error: string | null;
};

const RDKitContext = createContext<RDKitContextValue>({
  rdkit: null,
  loading: true,
  error: null,
});

export function RDKitProvider({ children }: { children: ReactNode }) {
  const [rdkit, setRdkit] = useState<RDKitModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Avoid loading twice
    if (rdkit) return;

    const script = document.createElement('script');
    script.src = './RDKit_minimal.js';
    script.onload = () => {
      window
        .initRDKitModule!({ locateFile: () => './RDKit_minimal.wasm' })
        .then((mod) => {
          setRdkit(mod);
          setLoading(false);
        })
        .catch((e) => {
          setError('Failed to load RDKit: ' + e.message);
          setLoading(false);
        });
    };
    script.onerror = () => {
      setError('Failed to load RDKit script');
      setLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <RDKitContext.Provider value={{ rdkit, loading, error }}>
      {children}
    </RDKitContext.Provider>
  );
}

export function useRDKit(): RDKitContextValue {
  return useContext(RDKitContext);
}
