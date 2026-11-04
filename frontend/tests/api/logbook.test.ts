import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveLogbook } from '../../src/api/logbook';

describe('saveLogbook', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not use keepalive for bodies larger than 64 KiB', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ entries_json: '', cursor: 0, links_json: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await saveLogbook('exercise-1', {
      entries_json: 'x'.repeat(65 * 1024),
      cursor: 1,
      links_json: '[]',
    });

    const request = fetchMock.mock.calls[0]?.[1];
    if (!request || typeof request.body !== 'string') {
      throw new Error('Expected saveLogbook to send a serialized request body');
    }

    expect(new TextEncoder().encode(request.body).byteLength).toBeGreaterThan(64 * 1024);
    expect(request.keepalive).toBeUndefined();
  });
});
