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
  show_missing?: boolean;
  show_creation?: boolean;
  active_preset?: string;
  available_presets?: string[];
};

export type UpdateUserSettingsRequest = {
  link_inherit_mode?: string;
  theme?: string;
  cheats?: string;
  show_CAS?: boolean;
  show_timer?: boolean;
  show_warnings?: boolean;
  show_solvent?: boolean;
  show_exchange?: boolean;
  show_missing?: boolean;
  show_creation?: boolean;
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

export async function applySettingsPreset(presetName: string): Promise<UserSettings> {
  const response = await fetch(`${BASE_URL}presets/${encodeURIComponent(presetName)}/apply`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to apply settings preset');
  }

  return response.json() as Promise<UserSettings>;
}