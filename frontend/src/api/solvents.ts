const BASE_URL = '/api/v1/solvents/';

export type SolventPreference = {
  id: number;
  match: string;
  display: string;
  names: string;
  options: string[];
  preference: number;
  count: number;
  selected_name: string;
};

export async function fetchSolventPreferences(): Promise<SolventPreference[]> {
  const response = await fetch(BASE_URL);
  if (!response.ok) {
    throw new Error('Failed to fetch solvent preferences');
  }
  return response.json() as Promise<SolventPreference[]>;
}

export async function updateSolventPreference(
  solventId: number,
  preference: number,
): Promise<SolventPreference> {
  const response = await fetch(`${BASE_URL}${solventId}/preference`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ preference }),
  });

  if (!response.ok) {
    throw new Error('Failed to update solvent preference');
  }

  return response.json() as Promise<SolventPreference>;
}
