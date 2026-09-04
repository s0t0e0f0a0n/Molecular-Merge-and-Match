const BASE_URL = '/api/v1/settings/';

export async function fetchUserSettings(): Promise<{
  link_inherit_mode: string;
}> {
  const response = await fetch(BASE_URL);

  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }

  return response.json();
}

export async function updateUserSettings(linkInheritMode: string): Promise<void> {
  const response = await fetch(BASE_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      link_inherit_mode: linkInheritMode,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to update settings');
  }
}