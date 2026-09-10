const BASE_URL = '/api/v1/tags/';

export type Tag = {
  id: number;
  tag_name: string;
  description: string | null;
  is_persistent: boolean;
  is_hideable: boolean;
  is_hidden: boolean;
  is_cheat: boolean;
  tag_count: number;
  user_tag: boolean;
  progression_use: boolean;
};

export async function fetchTags(): Promise<Tag[]> {
  const res = await fetch(BASE_URL);
  if (!res.ok) throw new Error('Failed to fetch tags');
  return res.json() as Promise<Tag[]>;
}

export async function deleteTag(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete tag');
}

export async function restoreTag(id: number): Promise<void> {
  const res = await fetch(`${BASE_URL}${id}/restore`, { method: 'PUT' });
  if (!res.ok) throw new Error('Failed to restore tag');
}

export async function setTagHidden(id: number, hidden: boolean) {
  const res = await fetch(`${BASE_URL}${id}/hide`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_hidden: hidden }),
  });
  if (!res.ok) throw new Error('Failed to set tag hidden');
  return res.json() as Promise<Tag>;
}
