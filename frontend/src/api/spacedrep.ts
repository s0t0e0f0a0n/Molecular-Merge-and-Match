export async function deferExerciseAfterSkip(exerciseId: number): Promise<void> {
  const response = await fetch(`/api/v1/spacedrep/${exerciseId}/skip`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to defer exercise.');
  }
}