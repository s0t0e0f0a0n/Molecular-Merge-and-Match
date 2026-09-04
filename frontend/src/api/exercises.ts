export type ExerciseSummary = {
  id: number;
  name: string | null;
  exercise_set: string | null;
  tags: string[];
  completed?: boolean | null;
};

export type ApiH1Peak = {
  id: number;
  ppm: number;
  multiplicity: string | null;
  j_values_hz_csv: string | null;
  proton_count: number | null;
  extra_info: string | null;
};

export type ApiC13Peak = {
  id: number;
  ppm: number;
  atom_count: number;
  extra_info: string | null;
};

export type ApiAdditionalSpectrum = {
  id: number;
  file_path: string;
  label: string | null;
  priority: number;
};

export type ExerciseDetail = {
  id: number;
  name: string | null;
  molecular_formula: string | null;
  exercise_set: string | null;
  tags: string[];
  completed?: boolean | null;

  h1_svg_path: string;
  h1_svg_url: string;
  h1_axis_start: number;
  h1_axis_end: number;
  h1_nmr_text: string;
  h1_frequency_mhz: number | null;
  h1_solvent: string | null;
  h1_peaks: ApiH1Peak[];

  c13_svg_path: string;
  c13_svg_url: string;
  c13_axis_start: number;
  c13_axis_end: number;
  c13_nmr_text: string;
  c13_frequency_mhz: number | null;
  c13_solvent: string | null;
  /**
   * APT flag for 13C. When true the spectrum title shows an "APT" badge. 
   * Optional because the backend column does not exist yet.
   */
  c13_apt?: boolean | null;
  c13_peaks: ApiC13Peak[];

  additional_spectra: ApiAdditionalSpectrum[];
};

export type CasAnswerValidationResponse = {
  is_correct: boolean;
};

export type SolutionValidationResponse = {
  is_correct: boolean;
};

export type ExerciseStatistics = {
  exercise_id: string;
  incorrect_count: number;
  start_counting: string | null;
  stop_counting: string | null;
  timer_total: number;
  started_at: string | null;
  completed_at: string | null;
};

// This fetches the exercise names, which is used to list the exercises, for the user to choose one from.
export async function fetchExerciseSummaries(): Promise<ExerciseSummary[]> {
  const response = await fetch(`/api/v1/exercises/summaries`);

  if (!response.ok) {
    throw new Error(`Failed to load exercise summaries (${response.status})`);
  }

  return (await response.json()) as ExerciseSummary[];
}

// This fetches all the data of one specific exercise.
export async function fetchExerciseDetail(
  exerciseId: number,
): Promise<ExerciseDetail> {
  const response = await fetch(`/api/v1/exercises/${exerciseId}`);

  if (!response.ok) {
    throw new Error(`Failed to load exercise ${exerciseId} (${response.status})`);
  }

  const data = (await response.json()) as ExerciseDetail;

  const formatAssetUrl = (path: string | null | undefined) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('api://v1/')) return path;
    
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    // In packaged Electron apps, use the custom api:// protocol
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
      return `api://v1${cleanPath}`;
    }
    
    // In local development, use the raw relative path so Vite's proxy catches it
    return cleanPath;
  };

  data.h1_svg_url = formatAssetUrl(data.h1_svg_path);
  data.c13_svg_url = formatAssetUrl(data.c13_svg_path);
  
  if (data.additional_spectra) {
    data.additional_spectra = data.additional_spectra.map(spec => ({
      ...spec,
      file_path: formatAssetUrl(spec.file_path)
    }));
  }

  return data;
}

export async function validateExerciseCasAnswer(
  exerciseId: number,
  casNumber: string,
): Promise<CasAnswerValidationResponse> {
  const response = await fetch(`/api/v1/exercises/${exerciseId}/validate-cas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cas_number: casNumber }),
  });

  const payload = (await response.json().catch(() => null)) as
    | CasAnswerValidationResponse
    | { detail?: string }
    | null;

  if (!response.ok) {
    const detail =
      payload && "detail" in payload && typeof payload.detail === "string"
        ? payload.detail
        : "Failed to validate CAS answer.";
    throw new Error(detail);
  }

  return payload as CasAnswerValidationResponse;
}

export async function resetExercise(exerciseKey: string): Promise<void> {
  const response = await fetch(
    `/api/v1/exercises/reset?exercise_id=${encodeURIComponent(exerciseKey)}`,
    { method: 'POST' },
  );
  if (!response.ok) {
    throw new Error(`Failed to reset exercise (${response.status})`);
  }
}

export async function validateExerciseSolutionHash(
  exerciseId: number,
  solutionHash: string,
): Promise<SolutionValidationResponse> {
  const response = await fetch(`/api/v1/exercises/${exerciseId}/validate-solution`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solution_hash: solutionHash }),
  });

  const payload = (await response.json().catch(() => null)) as
    | SolutionValidationResponse
    | { detail?: string }
    | null;

  if (!response.ok) {
    const detail =
      payload && "detail" in payload && typeof payload.detail === "string"
        ? payload.detail
        : "Failed to validate solution.";
    throw new Error(detail);
  }

  return payload as SolutionValidationResponse;
}

export async function fetchExerciseDbe(
  exerciseId: number
): Promise<number | null> {
  const r = await fetch(`/api/v1/exercises/${exerciseId}/dbe`);
  if (!r.ok) throw new Error('Failed to fetch DBE');
  const data = await r.json();
  return data.dbe;
}

export async function saveExerciseDbe(
  exerciseId: number,
  dbe: number | null
): Promise<void> {
  const r = await fetch(`/api/v1/exercises/${exerciseId}/dbe`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dbe }),
  });
  if (!r.ok) throw new Error('Failed to save DBE');
}

export async function fetchExerciseStatistics(
  exerciseId: number,
): Promise<ExerciseStatistics> {
  const response = await fetch(
    `/api/v1/statistics/?exercise_id=${encodeURIComponent(String(exerciseId))}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load exercise statistics (${response.status})`);
  }
  return (await response.json()) as ExerciseStatistics;
}

export async function stopExerciseTimer(exerciseId: number): Promise<ExerciseStatistics> {
  const r = await fetch(`/api/v1/statistics/stop?exercise_id=${encodeURIComponent(String(exerciseId))}`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error('Failed to stop exercise timer');
  return (await r.json()) as ExerciseStatistics;
}

export async function pauseExerciseTimer(exerciseId: number): Promise<ExerciseStatistics> {
  const r = await fetch(`/api/v1/statistics/pause?exercise_id=${encodeURIComponent(String(exerciseId))}`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error('Failed to pause exercise timer');
  return (await r.json()) as ExerciseStatistics;
}

export async function resumeExerciseTimer(exerciseId: number): Promise<ExerciseStatistics> {
  const r = await fetch(`/api/v1/statistics/resume?exercise_id=${encodeURIComponent(String(exerciseId))}`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error('Failed to resume exercise timer');
  return (await r.json()) as ExerciseStatistics;
}

export async function deleteExercise(exerciseId: number): Promise<void> {
  const r = await fetch(`/api/v1/exercises/${exerciseId}`, {
    method: 'DELETE',
  });
  if (!r.ok) throw new Error('Failed to delete exercise');
}
