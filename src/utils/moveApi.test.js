import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { submitAuthoritativeMove } from './moveApi.js';

describe('submitAuthoritativeMove', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends payload with auth and idempotency headers', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, moveSeq: 2 }),
    });

    const result = await submitAuthoritativeMove({
      gameId: 'game-1',
      from: 'e2',
      to: 'e4',
      promotion: null,
      expectedMoveSeq: 1,
      idToken: 'token-1',
      idempotencyKey: 'idem-1',
    });

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, options] = fetch.mock.calls[0];
    expect(options.headers.authorization).toBe('Bearer token-1');
    expect(options.headers['x-idempotency-key']).toBe('idem-1');
  });

  it('throws with API code on non-ok response', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 'STALE_MOVE_SEQ', message: 'stale' }),
    });

    await expect(
      submitAuthoritativeMove({
        gameId: 'game-1',
        from: 'e2',
        to: 'e4',
        expectedMoveSeq: 2,
      })
    ).rejects.toMatchObject({ code: 'STALE_MOVE_SEQ' });
  });

  it('throws when the response body is not valid JSON', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });

    await expect(
      submitAuthoritativeMove({
        gameId: 'game-1',
        from: 'e2',
        to: 'e4',
        expectedMoveSeq: 2,
      })
    ).rejects.toMatchObject({ code: 'INVALID_JSON' });
  });
});
