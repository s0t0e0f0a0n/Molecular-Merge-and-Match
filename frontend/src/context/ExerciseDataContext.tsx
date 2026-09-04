import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchExerciseDetail,
  type ExerciseDetail,
} from '../api/exercises';

type ExerciseDataContextValue = {
  selectedExerciseId: number | null; //The id of the currently saved exercise
  selectedExercise: ExerciseDetail | null;
  loadingSelectedExercise: boolean;
  selectedExerciseError: string | null;
  selectExerciseById: (exerciseId: number) => Promise<void>;
  clearSelectedExercise: () => void;
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
  const [loadingSelectedExercise, setLoadingSelectedExercise] = useState(false);
  const [selectedExerciseError, setSelectedExerciseError] = useState<string | null>(null);

  const selectExerciseById = useCallback(async (exerciseId: number) => {
    setLoadingSelectedExercise(true);  //Start loading the exercise
    setSelectedExerciseError(null);

    try {
      const detail = await fetchExerciseDetail(exerciseId); //Here the actual fetching happens
      setSelectedExerciseId(exerciseId);
      setSelectedExercise(detail); //Here the data is stored
    } catch (error) {
        setSelectedExerciseError(
          error instanceof Error ? error.message : 'Failed to load exercise detail.',
        );

    } finally {
      setLoadingSelectedExercise(false); //End of loading an exercise, so loading state is false
    }
  }, []);

  const clearSelectedExercise = useCallback(() => { // If other parts of the code call this context, this is the information those parts get.
    setSelectedExerciseId(null);
    setSelectedExercise(null);
    setSelectedExerciseError(null);
    setLoadingSelectedExercise(false);
  }, []);

  return (
    <ExerciseDataContext.Provider
      value={{
        selectedExerciseId,
        selectedExercise,  //The actual exercise data is stored here
        loadingSelectedExercise,
        selectedExerciseError,
        selectExerciseById,
        clearSelectedExercise,
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