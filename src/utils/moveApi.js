const DEFAULT_MOVE_API_URL = '/api/move';

export const moveApiEnabled = import.meta.env.VITE_MOVE_API_ENABLED === 'true';
export const moveApiStrict = import.meta.env.VITE_MOVE_API_STRICT === 'true';
export const moveApiUrl = import.meta.env.VITE_MOVE_API_URL || DEFAULT_MOVE_API_URL;

export async function submitAuthoritativeMove({
  gameId,
  from,
  to,
  promotion = null,
  expectedMoveSeq,
  idToken,
  idempotencyKey,
}) {
  const response = await fetch(moveApiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      gameId,
      from,
      to,
      promotion,
      expectedMoveSeq,
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (!response.ok) {
      const err = new Error(`Move API request failed with HTTP ${response.status}`);
      err.code = `HTTP_${response.status}`;
      throw err;
    }

    const err = new Error('Move API returned invalid JSON');
    err.code = 'INVALID_JSON';
    err.cause = error;
    throw err;
  }

  if (!response.ok) {
    const err = new Error(data?.message || 'Move API request failed');
    err.code = data?.code || `HTTP_${response.status}`;
    throw err;
  }

  return data || { ok: true };
}
