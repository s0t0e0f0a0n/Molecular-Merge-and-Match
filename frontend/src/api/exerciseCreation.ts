export type NMRiumDraftSpectrum = {
  id: string;
  dimension: number;
  nucleus: string | string[];
  info: Record<string, unknown>;
  peaks: unknown[];
  multiplets: unknown[];
  spectrometer: string | null;
  sourceSession: string | null;
  experimentNumber: string | null;
  dataSource: string | null;
  solvent?: string | null;
};

export type NMRiumDraftMolecule = {
  molfile: string;
};

export type ExerciseDraftStructure = {
  smiles: string;
  inchi: string;
  molfile: string;
};

export type ExerciseDraftAssignment = {
  exerciseSet: string;
  exerciseName: string;
  exerciseNumber: number;
  casNumber: string;
  tags: string[];
  spacedRepetitionPriority: number;
};

export type NMRiumDraftData = {
  spectra: NMRiumDraftSpectrum[];
  molecules?: NMRiumDraftMolecule[];
  structure?: ExerciseDraftStructure;
  assignment?: ExerciseDraftAssignment;
  sourcePaths?: string[];
  sourceMetadata?: unknown[];
};

export type ExerciseCreationDraft = {
  id: string;
  stage: string;
  nmrium_data: NMRiumDraftData;
  created_at: string;
  updated_at: string;
};

export class ExerciseCreationDraftError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ExerciseCreationDraftError';
  }
}

async function readDraftResponse(response: Response): Promise<ExerciseCreationDraft> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    throw new ExerciseCreationDraftError(
      body?.detail ?? `Exercise draft request failed (${response.status}).`,
      response.status,
    );
  }
  return (await response.json()) as ExerciseCreationDraft;
}

export async function createExerciseCreationDraft(
  nmriumData: NMRiumDraftData,
): Promise<ExerciseCreationDraft> {
  const response = await fetch('/api/v1/exercise-creation/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nmrium_data: nmriumData }),
  });
  return readDraftResponse(response);
}

export async function updateExerciseCreationDraft(
  draftId: string,
  nmriumData: NMRiumDraftData,
): Promise<ExerciseCreationDraft> {
  const response = await fetch(
    `/api/v1/exercise-creation/drafts/${encodeURIComponent(draftId)}/nmrium`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nmrium_data: nmriumData }),
    },
  );
  return readDraftResponse(response);
}

export async function fetchExerciseCreationDraft(
  draftId: string,
): Promise<ExerciseCreationDraft> {
  const response = await fetch(
    `/api/v1/exercise-creation/drafts/${encodeURIComponent(draftId)}`,
  );
  return readDraftResponse(response);
}
