import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  selectedExerciseId: number | null; //The id of the currently saved exercise
  selectedExercise: ExerciseDetail | null;
  selectedExerciseStatistics: ExerciseStatistics | null;
  loadingSelectedExercise: boolean;
  selectedExerciseError: string | null;
  selectExerciseById: (exerciseId: number) => Promise<void>;
  clearSelectedExercise: () => Promise<void>;
  setSelectedExerciseStatistics: (statistics: ExerciseStatistics | null) => void;
};

const ExerciseDataContext = createContext<ExerciseDataContextValue | undefined>(  //An empty context to begin with
  undefined,
);

export function ExerciseDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseDetail | null>(null); //This is where the data (send by the backend) is stored
  const [selectedExerciseStatistics, setSelectedExerciseStatistics] = useState<ExerciseStatistics | null>(null);
  const [loadingSelectedExercise, setLoadingSelectedExercise] = useState(false);
  const [selectedExerciseError, setSelectedExerciseError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (selectedExerciseId !== null && selectedExercise?.completed !== true) {
        void stopExerciseTimer(selectedExerciseId).catch(() => undefined);
      }
    };
  }, [selectedExerciseId, selectedExercise?.completed]);

  const selectExerciseById = useCallback(async (exerciseId: number) => {
    setLoadingSelectedExercise(true);  //Start loading the exercise
    setSelectedExerciseError(null);

    try {
      const detail = await fetchExerciseDetail(exerciseId); // Here the actual fetching happens
      let statistics: ExerciseStatistics | null = null;

      try {
        statistics = await fetchExerciseStatistics(exerciseId);
      } catch {
        statistics = null;
      }

      setSelectedExerciseId(exerciseId);
      setSelectedExercise(detail); //Here the data is stored
      setSelectedExerciseStatistics(statistics);
    } catch (error) {
      setSelectedExerciseError(
        error instanceof Error ? error.message : 'Failed to load exercise detail.',
      );
    } finally {
      setLoadingSelectedExercise(false); // End of loading the exercise, so loading state is false (the [selectedExerciseID] was [] before AI)
    }
  }, []);

  const clearSelectedExercise = useCallback(async () => {
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
        selectedExercise,  //The actual exercise data is stored here
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