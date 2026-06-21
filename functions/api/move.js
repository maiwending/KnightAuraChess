import KnightJumpChess from '../../src/KnightJumpChess.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-idempotency-key',
};

const OAUTH_TOKEN_SAFETY_WINDOW_MS = 60_000;
const AUTH_CACHE_MAX_MS = 15 * 60_000;
const RATE_WINDOW_FAST_MS = 10_000;
const RATE_WINDOW_SLOW_MS = 60_000;
const RATE_LIMIT_FAST = 8;
const RATE_LIMIT_SLOW = 24;
const TOKEN_CLOCK_SKEW_SEC = 30;

const oauthTokenCache = {
  accessToken: null,
  expiresAt: 0,
  inFlight: null,
};

const idTokenCache = new Map();
const perGameRateBucket = new Map();
const perUserRateBucket = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function nowMs() {
  return Date.now();
}

function createRequestId() {
  return `mv_${nowMs().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function logEvent(level, event, meta = {}) {
  const payload = { ts: new Date().toISOString(), event, ...meta };
  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload));
}

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem) {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwtRS256(payload, email, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getGoogleAccessToken(env) {
  const now = nowMs();
  if (
    oauthTokenCache.accessToken &&
    oauthTokenCache.expiresAt - OAUTH_TOKEN_SAFETY_WINDOW_MS > now
  ) {
    return oauthTokenCache.accessToken;
  }

  if (oauthTokenCache.inFlight) {
    return oauthTokenCache.inFlight;
  }

  oauthTokenCache.inFlight = (async () => {
  const email = env.FIREBASE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKeyRaw) {
    throw new ApiError('NOT_CONFIGURED', 'Service account credentials are missing', 503);
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    iss: email,
    sub: email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  };
  const assertion = await signJwtRS256(payload, email, privateKey);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Failed to obtain service token', 503);
  }
    const expiresInSec = Number.isFinite(data.expires_in) ? data.expires_in : 3600;
    oauthTokenCache.accessToken = data.access_token;
    oauthTokenCache.expiresAt = nowMs() + (expiresInSec * 1000);
    return oauthTokenCache.accessToken;
  })();

  try {
    return await oauthTokenCache.inFlight;
  } finally {
    oauthTokenCache.inFlight = null;
  }
}

function decodeJwtPayload(idToken) {
  const [, payload] = idToken.split('.');
  if (!payload) return null;
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  const decoded = atob(padded);
  return JSON.parse(decoded);
}

async function verifyFirebaseIdToken(idToken, env) {
  const claims = decodeJwtPayload(idToken);
  const nowSec = Math.floor(nowMs() / 1000);
  if (claims?.exp && nowSec > Number(claims.exp) + TOKEN_CLOCK_SKEW_SEC) {
    throw new ApiError('UNAUTHENTICATED', 'Token expired', 401);
  }
  if (claims?.iat && nowSec + TOKEN_CLOCK_SKEW_SEC < Number(claims.iat)) {
    throw new ApiError('UNAUTHENTICATED', 'Token issued in the future', 401);
  }

  const cached = idTokenCache.get(idToken);
  if (cached && cached.expiresAt > nowMs()) {
    return cached.uid;
  }

  const apiKey = env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new ApiError('NOT_CONFIGURED', 'FIREBASE_WEB_API_KEY is missing', 503);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const data = await response.json();
  if (!response.ok || !Array.isArray(data?.users) || !data.users[0]?.localId) {
    throw new ApiError('UNAUTHENTICATED', 'Invalid ID token', 401);
  }
  const uid = data.users[0].localId;
  const jwtExpMs = claims?.exp ? (Number(claims.exp) * 1000) : (nowMs() + AUTH_CACHE_MAX_MS);
  const expiresAt = Math.min(jwtExpMs - (TOKEN_CLOCK_SKEW_SEC * 1000), nowMs() + AUTH_CACHE_MAX_MS);
  idTokenCache.set(idToken, { uid, expiresAt });
  return uid;
}

function docName(projectId, path) {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function fromFsValue(value) {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    const out = {};
    Object.keys(fields).forEach((k) => { out[k] = fromFsValue(fields[k]); });
    return out;
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(fromFsValue);
  }
  return null;
}

function toFsValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFsValue) } };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'object') {
    const fields = {};
    Object.keys(value).forEach((k) => { fields[k] = toFsValue(value[k]); });
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function parseFsDocument(document) {
  const fields = document?.fields || {};
  const out = {};
  Object.keys(fields).forEach((k) => { out[k] = fromFsValue(fields[k]); });
  return out;
}

function toFsDocumentFields(data) {
  const fields = {};
  Object.keys(data).forEach((k) => { fields[k] = toFsValue(data[k]); });
  return fields;
}

async function firestoreGet(projectId, path, accessToken) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/${docName(projectId, path)}`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError('SERVICE_UNAVAILABLE', 'Failed to read Firestore document', 503);
  return response.json();
}

function formatTurn(turn) {
  return turn === 'w' ? 'White' : 'Black';
}

function calculateElo(playerRating, opponentRating, score, kFactor = 32) {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(playerRating + kFactor * (score - expected));
}

class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Missing JSON payload';
  const { gameId, from, to, expectedMoveSeq } = payload;
  if (!gameId || typeof gameId !== 'string') return 'gameId is required';
  if (!/^[a-h][1-8]$/.test(from || '')) return 'from must be a square (e.g. e2)';
  if (!/^[a-h][1-8]$/.test(to || '')) return 'to must be a square (e.g. e4)';
  if (!Number.isInteger(expectedMoveSeq) || expectedMoveSeq < 0) return 'expectedMoveSeq must be a non-negative integer';
  return null;
}

function pruneBucket(bucket, now, windowMs) {
  while (bucket.length && now - bucket[0] > windowMs) bucket.shift();
}

function enforceRateLimit(uid, gameId, now) {
  const perGameKey = `${uid}:${gameId}`;
  const gameBucket = perGameRateBucket.get(perGameKey) || [];
  pruneBucket(gameBucket, now, RATE_WINDOW_FAST_MS);
  if (gameBucket.length >= RATE_LIMIT_FAST) {
    throw new ApiError('RATE_LIMITED', 'Too many move requests for this game', 429);
  }
  gameBucket.push(now);
  perGameRateBucket.set(perGameKey, gameBucket);

  const userBucket = perUserRateBucket.get(uid) || [];
  pruneBucket(userBucket, now, RATE_WINDOW_SLOW_MS);
  if (userBucket.length >= RATE_LIMIT_SLOW) {
    throw new ApiError('RATE_LIMITED', 'Too many move requests', 429);
  }
  userBucket.push(now);
  perUserRateBucket.set(uid, userBucket);
}

function cleanupCaches(now) {
  for (const [token, entry] of idTokenCache.entries()) {
    if (entry.expiresAt <= now) idTokenCache.delete(token);
  }
  for (const [key, bucket] of perGameRateBucket.entries()) {
    pruneBucket(bucket, now, RATE_WINDOW_FAST_MS);
    if (bucket.length === 0) perGameRateBucket.delete(key);
  }
  for (const [key, bucket] of perUserRateBucket.entries()) {
    pruneBucket(bucket, now, RATE_WINDOW_SLOW_MS);
    if (bucket.length === 0) perUserRateBucket.delete(key);
  }
}

async function commitWrites(projectId, accessToken, writes) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    }
  );
  if (response.ok) return response.json();
  const data = await response.json().catch(() => null);
  const message = data?.error?.message || 'Failed to commit move';
  if (message.includes('ALREADY_EXISTS')) throw new ApiError('DUPLICATE_REQUEST', 'Duplicate idempotency key', 409);
  if (message.includes('FAILED_PRECONDITION')) throw new ApiError('STALE_MOVE_SEQ', 'Move sequence is stale', 409);
  throw new ApiError('SERVICE_UNAVAILABLE', message, 503);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
  const requestStartedAt = nowMs();
  const requestId = context.request.headers.get('x-request-id') || createRequestId();
  let uidHash = null;
  let gameId = null;
  try {
    cleanupCaches(requestStartedAt);
    const projectId = context.env.FIREBASE_PROJECT_ID;
    if (!projectId) throw new ApiError('NOT_CONFIGURED', 'FIREBASE_PROJECT_ID is missing', 503);

    const authHeader = context.request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!idToken) throw new ApiError('UNAUTHENTICATED', 'Missing bearer token', 401);

    let payload = null;
    try {
      payload = await context.request.json();
    } catch {
      throw new ApiError('INVALID_JSON', 'Invalid JSON body', 400);
    }
    const payloadError = validatePayload(payload);
    if (payloadError) throw new ApiError('INVALID_PAYLOAD', payloadError, 400);
    gameId = payload.gameId;

    logEvent('info', 'move_request_received', {
      requestId,
      gameId,
      expectedMoveSeq: payload.expectedMoveSeq,
      from: payload.from,
      to: payload.to,
      idempotency: Boolean(context.request.headers.get('x-idempotency-key')),
    });

    const uid = await verifyFirebaseIdToken(idToken, context.env);
    uidHash = stableHash(uid);
    enforceRateLimit(uid, payload.gameId, requestStartedAt);
    const accessToken = await getGoogleAccessToken(context.env);

    const gamePath = `games/${payload.gameId}`;
    const gameDoc = await firestoreGet(projectId, gamePath, accessToken);
    if (!gameDoc) throw new ApiError('NOT_FOUND', 'Game not found', 404);
    const game = parseFsDocument(gameDoc);

    if (game.status !== 'active') throw new ApiError('GAME_NOT_ACTIVE', 'Game is not active', 409);
    const playerColor = game.whiteId === uid ? 'w' : game.blackId === uid ? 'b' : null;
    if (!playerColor) throw new ApiError('FORBIDDEN', 'Not a game participant', 403);
    if ((game.moveSeq || 0) !== payload.expectedMoveSeq) {
      throw new ApiError('STALE_MOVE_SEQ', 'Move sequence is stale', 409);
    }
    if (!game.lastMoveAt) throw new ApiError('INVALID_STATE', 'Game clock is not initialized', 409);
    if (Date.now() - Date.parse(game.lastMoveAt) < 200) throw new ApiError('RATE_LIMITED', 'Move rate limited', 429);

    const engine = new KnightJumpChess(game.fen, game.variantRules);
    if (engine.turn() !== playerColor) throw new ApiError('NOT_YOUR_TURN', 'Not your turn', 409);
    const legal = engine.move({
      from: payload.from,
      to: payload.to,
      promotion: payload.promotion || 'q',
    });
    if (!legal) throw new ApiError('ILLEGAL_MOVE', 'Illegal move', 409);

    const nowIso = new Date().toISOString();
    const elapsed = Math.max(0, (Date.now() - Date.parse(game.lastMoveAt)) / 1000);
    const timeControl = game.timeControl || 300;
    let whiteTimeLeft = game.whiteTimeLeft ?? timeControl;
    let blackTimeLeft = game.blackTimeLeft ?? timeControl;
    if (playerColor === 'w') whiteTimeLeft = Math.max(0, whiteTimeLeft - elapsed);
    else blackTimeLeft = Math.max(0, blackTimeLeft - elapsed);

    let status = 'active';
    let winner = null;
    let result = null;

    if (whiteTimeLeft <= 0) {
      status = 'completed'; winner = 'b'; result = 'Black wins on time';
    } else if (blackTimeLeft <= 0) {
      status = 'completed'; winner = 'w'; result = 'White wins on time';
    }

    if (status === 'active') {
      const boardFen = engine.fen().split(' ')[0];
      if (!boardFen.includes('K')) {
        status = 'completed'; winner = 'b'; result = 'Black wins by king capture';
      } else if (!boardFen.includes('k')) {
        status = 'completed'; winner = 'w'; result = 'White wins by king capture';
      } else if (engine.isCheckmateRider()) {
        winner = engine.turn() === 'w' ? 'b' : 'w';
        status = 'completed';
        result = `${formatTurn(winner)} wins by checkmate`;
      } else if (engine.isStalemateRider() || engine.isDraw()) {
        status = 'draw';
        winner = null;
        result = 'Draw';
      }
    }

    const nextSeq = (game.moveSeq || 0) + 1;
    const moveHistory = [...(Array.isArray(game.moveHistory) ? game.moveHistory : []), legal.san || `${payload.from}-${payload.to}`];

    let whiteRatingAfter = game.whiteRating ?? 1200;
    let blackRatingAfter = game.blackRating ?? 1200;
    const writes = [];

    const idempotencyKey = context.request.headers.get('x-idempotency-key');
    if (idempotencyKey && idempotencyKey.length <= 120) {
      writes.push({
        update: {
          name: docName(projectId, `moveRequests/${payload.gameId}_${uid}_${idempotencyKey.replace(/[^a-zA-Z0-9:_-]/g, '')}`),
          fields: toFsDocumentFields({
            gameId: payload.gameId,
            uid,
            expectedMoveSeq: payload.expectedMoveSeq,
            createdAt: nowIso,
          }),
        },
        currentDocument: { exists: false },
      });
    }

    if ((status === 'completed' || status === 'draw') && game.whiteId && game.blackId) {
      const whiteScore = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
      const blackScore = 1 - whiteScore;
      whiteRatingAfter = calculateElo(game.whiteRating ?? 1200, game.blackRating ?? 1200, whiteScore);
      blackRatingAfter = calculateElo(game.blackRating ?? 1200, game.whiteRating ?? 1200, blackScore);

      const whiteDoc = await firestoreGet(projectId, `users/${game.whiteId}`, accessToken);
      const blackDoc = await firestoreGet(projectId, `users/${game.blackId}`, accessToken);
      const whiteUser = parseFsDocument(whiteDoc || { fields: {} });
      const blackUser = parseFsDocument(blackDoc || { fields: {} });

      writes.push({
        update: {
          name: docName(projectId, `users/${game.whiteId}`),
          fields: toFsDocumentFields({
            uid: game.whiteId,
            displayName: game.whiteName || whiteUser.displayName || 'White',
            rating: whiteRatingAfter,
            wins: (whiteUser.wins || 0) + (whiteScore === 1 ? 1 : 0),
            losses: (whiteUser.losses || 0) + (whiteScore === 0 ? 1 : 0),
            draws: (whiteUser.draws || 0) + (whiteScore === 0.5 ? 1 : 0),
            updatedAt: nowIso,
          }),
        },
        updateMask: { fieldPaths: ['uid', 'displayName', 'rating', 'wins', 'losses', 'draws', 'updatedAt'] },
      });

      writes.push({
        update: {
          name: docName(projectId, `users/${game.blackId}`),
          fields: toFsDocumentFields({
            uid: game.blackId,
            displayName: game.blackName || blackUser.displayName || 'Black',
            rating: blackRatingAfter,
            wins: (blackUser.wins || 0) + (blackScore === 1 ? 1 : 0),
            losses: (blackUser.losses || 0) + (blackScore === 0 ? 1 : 0),
            draws: (blackUser.draws || 0) + (blackScore === 0.5 ? 1 : 0),
            updatedAt: nowIso,
          }),
        },
        updateMask: { fieldPaths: ['uid', 'displayName', 'rating', 'wins', 'losses', 'draws', 'updatedAt'] },
      });
    }

    writes.push({
      update: {
        name: gameDoc.name,
        fields: toFsDocumentFields({
          fen: engine.fen(),
          moveHistory,
          moveSeq: nextSeq,
          lastMove: {
            from: payload.from,
            to: payload.to,
            san: legal.san || null,
            by: uid,
            seq: nextSeq,
          },
          status,
          winner,
          result,
          whiteTimeLeft,
          blackTimeLeft,
          lastMoveAt: nowIso,
          whiteRatingAfter: status === 'active' ? null : whiteRatingAfter,
          blackRatingAfter: status === 'active' ? null : blackRatingAfter,
          updatedAt: nowIso,
        }),
      },
      updateMask: {
        fieldPaths: [
          'fen',
          'moveHistory',
          'moveSeq',
          'lastMove',
          'status',
          'winner',
          'result',
          'whiteTimeLeft',
          'blackTimeLeft',
          'lastMoveAt',
          'whiteRatingAfter',
          'blackRatingAfter',
          'updatedAt',
        ],
      },
      currentDocument: { updateTime: gameDoc.updateTime },
    });

    await commitWrites(projectId, accessToken, writes);
    const response = json({
      ok: true,
      gameId: payload.gameId,
      moveSeq: nextSeq,
      status,
      winner,
      result,
      requestId,
    });
    logEvent('info', 'move_request_accepted', {
      requestId,
      uidHash,
      gameId: payload.gameId,
      nextSeq,
      status,
      durationMs: nowMs() - requestStartedAt,
    });
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      logEvent('error', 'move_request_rejected', {
        requestId,
        uidHash,
        gameId,
        code: error.code,
        status: error.status,
        durationMs: nowMs() - requestStartedAt,
      });
      return json({ ok: false, code: error.code, message: error.message, requestId }, error.status);
    }
    logEvent('error', 'move_request_failed', {
      requestId,
      uidHash,
      gameId,
      code: 'SERVICE_UNAVAILABLE',
      durationMs: nowMs() - requestStartedAt,
    });
    return json({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'Move service failure', requestId }, 503);
  }
}
