import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExerciseCreationDraft } from './exerciseCreation';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exercise creation API errors', () => {
  it('formats structured validation details instead of displaying [object Object]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: [
              {
                loc: ['body', 'nmrium_data', 'spectra', 0],
                msg: 'Input should be a valid object',
              },
            ],
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      createExerciseCreationDraft({ spectra: [] }),
    ).rejects.toThrow(
      'body → nmrium_data → spectra → 0: Input should be a valid object',
    );
  });
});
