import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchExerciseStatistics,
  fetchExerciseDetail,
  stopExerciseTimer,
  type ExerciseStatistics,
  type ExerciseDetail,
} from '../api/exercises';

type ExerciseDataContextValue = {
  selectedExerciseId: number | null; 
  selectedExercise: ExerciseDetail | null;
  selectedExerciseStatistics: ExerciseStatistics | null;
  loadingSelectedExercise: boolean;
  selectedExerciseError: string | null;
  selectExerciseById: (exerciseId: number) => Promise<void>;
  clearSelectedExercise: () => Promise<void>;
  setSelectedExerciseStatistics: (statistics: ExerciseStatistics | null) => void;
};

const ExerciseDataContext = createContext<ExerciseDataContextValue | undefined>(undefined);

export function ExerciseDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseDetail | null>(null); 
  const [selectedExerciseStatistics, setSelectedExerciseStatistics] = useState<ExerciseStatistics | null>(null);
  const [loadingSelectedExercise, setLoadingSelectedExercise] = useState(false);
  const [selectedExerciseError, setSelectedExerciseError] = useState<string | null>(null);
  
  const selectRequestIdRef = useRef(0);

  // Keep a persistent mutable reference of the current state values
  const trackingRef = useRef({ id: selectedExerciseId, completed: selectedExercise?.completed });
  
  // Update the mutable ref on every render cycle so it is always current
  trackingRef.current = {
    id: selectedExerciseId,
    completed: selectedExercise?.completed
  };

  // This handles the Unmount lifecycle cleanly (e.g., leaving the app or closing the module)
  useEffect(() => {
    return () => {
      const { id, completed } = trackingRef.current;
      if (id !== null && completed !== true) {
        void stopExerciseTimer(id).catch(() => undefined);
      }
    };
  }, []); // Run strictly once on component destruction

  const selectExerciseById = useCallback(async (exerciseId: number) => {
    const requestId = ++selectRequestIdRef.current;

    // FIX FOR SWITCHING: Stop the timer for the active exercise BEFORE clearing state
    const previousId = trackingRef.current.id;
    const previousCompleted = trackingRef.current.completed;
    
    if (previousId !== null && previousCompleted !== true && previousId !== exerciseId) {
      void stopExerciseTimer(previousId).catch(() => undefined);
    }

    setLoadingSelectedExercise(true);  
    setSelectedExerciseError(null);
    setSelectedExerciseId(exerciseId);
    setSelectedExercise(null); // Keeps your flash/warning symbol fix fully functional
    setSelectedExerciseStatistics(null);

    try {
      const detail = await fetchExerciseDetail(exerciseId); 
      let statistics: ExerciseStatistics | null = null;

      try {
        statistics = await fetchExerciseStatistics(exerciseId);
      } catch {
        statistics = null;
      }

      if (requestId !== selectRequestIdRef.current) {
        return;
      }

      setSelectedExercise(detail); 
      setSelectedExerciseStatistics(statistics);
    } catch (error) {
      if (requestId !== selectRequestIdRef.current) {
        return;
      }

      setSelectedExerciseError(
        error instanceof Error ? error.message : 'Failed to load exercise detail.',
      );
    } finally {
      if (requestId === selectRequestIdRef.current) {
        setLoadingSelectedExercise(false); 
      }
    }
  }, []);

  const clearSelectedExercise = useCallback(async () => {
    selectRequestIdRef.current += 1;

    // Handles intentional Pause or manual backing out
    if (selectedExercise?.completed !== true && selectedExerciseId !== null) {
      void stopExerciseTimer(selectedExerciseId).catch(() => undefined);
    }

    setSelectedExerciseId(null);
    setSelectedExercise(null);
    setSelectedExerciseStatistics(null);
    setSelectedExerciseError(null);
    setLoadingSelectedExercise(false);
  }, [selectedExercise?.completed, selectedExerciseId]);

  return (
    <ExerciseDataContext.Provider
      value={{
        selectedExerciseId,
        selectedExercise,  
        selectedExerciseStatistics,
        loadingSelectedExercise,
        selectedExerciseError,
        selectExerciseById,
        clearSelectedExercise,
        setSelectedExerciseStatistics,
      }}
    >
      {children}
    </ExerciseDataContext.Provider>
  );
}

export function useExerciseData() {
  const context = useContext(ExerciseDataContext);

  if (!context) {
    throw new Error('useExerciseData must be used within an ExerciseDataProvider');
  }

  return context;
}
