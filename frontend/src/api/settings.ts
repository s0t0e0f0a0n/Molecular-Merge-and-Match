const BASE_URL = '/api/v1/settings/';

export type UserSettings = {
  link_inherit_mode: string;
  theme: string;
  cheats: string;
  show_CAS?: boolean;
  show_timer?: boolean;
  show_warnings?: boolean;
  show_solvent?: boolean;
  show_exchange?: boolean;
  show_formula?: boolean;
  show_integral_curves?: boolean;
  show_missing?: boolean;
  show_creation?: boolean;
  show_apt?: boolean;
  show_source?: boolean;
  show_tags?: boolean;
  enable_delete?: boolean;
  SR_mode?: boolean;
  active_preset?: string;
  available_presets?: string[];
};

export type UpdateUserSettingsRequest = {
  link_inherit_mode?: string;
  theme?: string;
  cheats?: string;
  exercise_id?: number;
  show_CAS?: boolean;
  show_timer?: boolean;
  show_warnings?: boolean;
  show_solvent?: boolean;
  show_exchange?: boolean;
  show_formula?: boolean;
  show_integral_curves?: boolean;
  show_missing?: boolean;
  show_creation?: boolean;
  show_apt?: boolean;
  show_source?: boolean;
  show_tags?: boolean;
  enable_delete?: boolean;
  SR_mode?: boolean;
};

export async function fetchUserSettings(): Promise<UserSettings> {
  const response = await fetch(BASE_URL);

  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }

  return response.json() as Promise<UserSettings>;
}

export async function updateUserSettings(payload: UpdateUserSettingsRequest): Promise<UserSettings> {
  const response = await fetch(BASE_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to update settings');
  }

  return response.json() as Promise<UserSettings>;
}

export async function applySettingsPreset(presetName: string, exerciseId?: number | null): Promise<UserSettings> {
  const query = exerciseId == null ? '' : `?exercise_id=${encodeURIComponent(exerciseId)}`;
  const response = await fetch(`${BASE_URL}presets/${encodeURIComponent(presetName)}/apply${query}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to apply settings preset');
  }

  return response.json() as Promise<UserSettings>;
}