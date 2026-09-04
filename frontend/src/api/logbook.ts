export type ApiLogbookState = {
  entries_json: string;
  cursor: number;
  links_json: string;
};

export async function fetchLogbook(exerciseKey: string): Promise<ApiLogbookState> {
  const response = await fetch(
    `/api/v1/logbook/?exercise_id=${encodeURIComponent(exerciseKey)}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load logbook (${response.status})`);
  }
  return (await response.json()) as ApiLogbookState;
}

export async function saveLogbook(
  exerciseKey: string,
  body: ApiLogbookState,
): Promise<void> {
  const response = await fetch(
    `/api/v1/logbook/?exercise_id=${encodeURIComponent(exerciseKey)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to save logbook (${response.status})`);
  }
}

export async function clearLogbook(exerciseKey: string): Promise<void> {
  const response = await fetch(
    `/api/v1/logbook/?exercise_id=${encodeURIComponent(exerciseKey)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error(`Failed to clear logbook (${response.status})`);
  }
}