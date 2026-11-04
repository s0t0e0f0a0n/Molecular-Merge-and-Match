export type NMRiumDraftSpectrum = {
  id: string;
  dimension: number;
  nucleus: string | string[];
  info: Record<string, unknown>;
  label?: string;
  isPrimary?: boolean;
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

export type NMRiumSvgExport = {
  id: string;
  name: string;
  nucleus: string;
  file_name: string;
  url: string;
  selected: boolean;
  dimension?: number;
  ppmRange: [number, number];
  secondPpmRange?: [number, number];
  integralVerticalPosition: number;
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
  svgExports?: NMRiumSvgExport[];
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

function getErrorDetail(detail: unknown): string | undefined {
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (!item || typeof item !== 'object') return [];
      const error = item as Record<string, unknown>;
      const message =
        typeof error.msg === 'string'
          ? error.msg
          : typeof error.message === 'string'
            ? error.message
            : undefined;
      if (!message) return [];
      const location = Array.isArray(error.loc)
        ? error.loc.filter((part) => typeof part === 'string' || typeof part === 'number').join(' → ')
        : '';
      return [location ? `${location}: ${message}` : message];
    });
    if (messages.length > 0) return messages.join('; ');
  }
  if (detail && typeof detail === 'object') {
    const error = detail as Record<string, unknown>;
    for (const key of ['message', 'msg', 'error']) {
      const message = getErrorDetail(error[key]);
      if (message) return message;
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function readDraftResponse(response: Response): Promise<ExerciseCreationDraft> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: unknown; message?: unknown }
      | null;
    throw new ExerciseCreationDraftError(
      getErrorDetail(body?.detail) ??
        getErrorDetail(body?.message) ??
        `Exercise draft request failed (${response.status}).`,
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

export async function storeTemporaryNMRiumSvgs(
  draftId: string,
  spectra: Array<{
    id: string;
    name: string;
    nucleus: string;
    svg_text: string;
  }>,
): Promise<Array<Omit<NMRiumSvgExport, 'selected'>>> {
  const response = await fetch('/api/v1/nmrium-svg-exports/temp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft_id: draftId, spectra }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: unknown; message?: unknown }
      | null;
    throw new ExerciseCreationDraftError(
      getErrorDetail(body?.detail) ??
        getErrorDetail(body?.message) ??
        `Could not store the temporary SVG exports (${response.status}).`,
      response.status,
    );
  }
  return (await response.json()) as Array<Omit<NMRiumSvgExport, 'selected'>>;
}
