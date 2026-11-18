import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFragments, type BackendFragment } from '../../src/hooks/useFragments';

function fragment(id: number, exerciseId: string): BackendFragment {
  return {
    id,
    exercise_id: exerciseId,
    label: `Fragment ${id}`,
    smiles: 'C',
    mol_file: '',
  };
}

describe('useFragments', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does not GET the fragment list after creating a fragment', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fragment(1, 'exercise-1'),
      } as Response);

    const { result } = renderHook(() => useFragments('exercise-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.createFragment('New fragment', 'CC', 'mol')).resolves.toBe(1);
    });

    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe('/api/v1/fragments/');
    expect(vi.mocked(fetch).mock.calls[1][1]?.method).toBe('POST');
    expect(result.current.fragments).toEqual([fragment(1, 'exercise-1')]);
  });

  it('ignores a response from the previous exercise after switching ids', async () => {
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    const { result, rerender } = renderHook(
      ({ exerciseId }) => useFragments(exerciseId),
      { initialProps: { exerciseId: 'exercise-1' } },
    );

    rerender({ exerciseId: 'exercise-2' });
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);

    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => [fragment(2, 'exercise-2')],
      } as Response);
    });
    await waitFor(() => expect(result.current.fragments).toEqual([fragment(2, 'exercise-2')]));

    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => [fragment(1, 'exercise-1')],
      } as Response);
    });

    expect(result.current.fragments).toEqual([fragment(2, 'exercise-2')]);
  });
});
