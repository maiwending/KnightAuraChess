/**
 * Knight-Aura Chess AI Engine — Web Worker v2
 *
 * Improvements over v1:
 *   - Negamax framework (cleaner, enables TT integration)
 *   - Transposition table (depth-preferred replacement, up to 500k entries)
 *   - Quiescence search with delta pruning (eliminates horizon effect)
 *   - Late Move Reduction (LMR) — reduces depth for likely-bad quiet moves
 *   - Killer move heuristic — better move ordering from quiet cutoffs
 *   - Knight-Aura aware evaluation — rewards pieces inside friendly aura
 *   - Endgame king activity table
 *   - Bishop pair bonus
 *   - Expert searches depth 8–10 instead of depth 4
 *
 * Messages IN:  { type: 'search', fen, difficulty, id }
 * Messages OUT: { type: 'result', from, to, promotion, san, score, depth, nodes, timeMs, id }
 *               { type: 'error', message, id }
 */

import KnightJumpChess from '../KnightJumpChess.js';

// ── Piece values ─────────────────────────────────────────────────
const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// ── Piece-square tables (White perspective, index 0 = a8 rank 8 file a) ──
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  // King middlegame: castle and stay safe
  k: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
  ],
  // King endgame: centralise and be active
  ke: [
   -50,-40,-30,-20,-20,-30,-40,-50,
   -30,-20,-10,  0,  0,-10,-20,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-30,  0,  0,  0,  0,-30,-30,
   -50,-30,-30,-30,-30,-30,-30,-50,
  ],
};

function mirrorIndex(i) {
  return (7 - Math.floor(i / 8)) * 8 + (i % 8);
}

// ── Transposition Table ──────────────────────────────────────────
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;
const TT_MAX = 500_000;
const TT = new Map();

function ttProbe(fen) { return TT.get(fen) ?? null; }

function ttStore(fen, depth, score, flag, bestMoveKey) {
  const ex = TT.get(fen);
  if (ex && ex.depth > depth) return; // keep deeper entry
  if (TT.size >= TT_MAX && !ex) {
    // Evict oldest (insertion-order) to cap memory
    TT.delete(TT.keys().next().value);
  }
  TT.set(fen, { depth, score, flag, bestMoveKey });
}

// ── Killer moves [ply][slot 0..1] ────────────────────────────────
const MAX_PLY = 64;
const killers = Array.from({ length: MAX_PLY }, () => [null, null]);

function storeKiller(ply, key) {
  if (!key || killers[ply][0] === key) return;
  killers[ply][1] = killers[ply][0];
  killers[ply][0] = key;
}

// ── Knight-Aura helpers ──────────────────────────────────────────
const ADJ_D  = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const LEAP_D = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];

/** Adds squares around a knight at (ri, fi) to the provided aura Set using flat indices. */
function addKnightToAura(ri, fi, auraSet) {
  for (const [dr, dc] of ADJ_D) {
    const r = ri + dr, f = fi + dc;
    if (r >= 0 && r < 8 && f >= 0 && f < 8) {
      auraSet.add(r * 8 + f);
    }
  }
  for (const [dr, dc] of LEAP_D) {
    const r = ri + dr, f = fi + dc;
    if (r >= 0 && r < 8 && f >= 0 && f < 8) {
      auraSet.add(r * 8 + f);
    }
  }
}

// ── Static evaluation (White perspective, positive = good for White) ──
function evaluate(game) {
  let score = 0;
  let wKing = false, bKing = false;
  let wBishops = 0, bBishops = 0;
  let wMinorMaterial = 0, bMinorMaterial = 0;

  const board = game.board(); // Get 8x8 array once
  const pieces = [];
  const wKnightCoords = [];
  const bKnightCoords = [];

  // Single pass: collect pieces and detect knight positions for aura
  for (let ri = 0; ri < 8; ri++) {
    for (let fi = 0; fi < 8; fi++) {
      const p = board[ri][fi];
      if (!p) continue;
      pieces.push({ p, ri, fi, idx: ri * 8 + fi });
      if (p.type !== 'p' && p.type !== 'k') {
        if (p.color === 'w') wMinorMaterial += PIECE_VALUE[p.type];
        else bMinorMaterial += PIECE_VALUE[p.type];
      }
      if (p.type === 'n') {
        if (p.color === 'w') wKnightCoords.push([ri, fi]);
        else bKnightCoords.push([ri, fi]);
      }
    }
  }

  const isEndgame = (wMinorMaterial + bMinorMaterial) < 1800;
  const wAura = new Set();
  const bAura = new Set();
  for (const [r, f] of wKnightCoords) addKnightToAura(r, f, wAura);
  for (const [r, f] of bKnightCoords) addKnightToAura(r, f, bAura);

  // Second pass: score every piece
  for (const { p, idx } of pieces) {
    const val = PIECE_VALUE[p.type];

    // Choose PST (king switches to endgame table when material is low)
    let table;
    if (p.type === 'k') {
      table = isEndgame ? PST.ke : PST.k;
    } else {
      table = PST[p.type];
    }
    const pst = p.color === 'w' ? table[idx] : table[mirrorIndex(idx)];

    // Knight-Aura bonus: non-king pieces inside friendly aura gain mobility
    let auraBonus = 0;
    if (p.type !== 'k') {
      if (p.color === 'w' && wAura.has(idx)) auraBonus = 18;
      else if (p.color === 'b' && bAura.has(idx)) auraBonus = 18;
    }

    if (p.type === 'k') { if (p.color === 'w') wKing = true; else bKing = true; }
    if (p.type === 'b') { if (p.color === 'w') wBishops++; else bBishops++; }

    if (p.color === 'w') score += val + pst + auraBonus;
    else                 score -= val + pst + auraBonus;
  }

  // Terminal: missing king = captured (variant rule)
  if (!wKing) return -90000;
  if (!bKing) return  90000;

  // Bishop pair bonus
  if (wBishops >= 2) score += 30;
  if (bBishops >= 2) score -= 30;

  return score;
}

/** Score from the perspective of whichever side is to move. */
function evalNegamax(game) {
  const s = evaluate(game);
  return game.turn() === 'w' ? s : -s;
}

// ── Move ordering ────────────────────────────────────────────────
function scoreMoveForOrdering(m, ttMoveKey, ply) {
  const key = m.from + m.to;
  if (ttMoveKey && key === ttMoveKey) return 10_000_000;          // TT move first
  if (m.captured) {
    // MVV-LVA: capture most-valuable victim with least-valuable attacker
    return 1_000_000 + PIECE_VALUE[m.captured] * 10 - PIECE_VALUE[m.piece];
  }
  if (m.promotion) return 900_000 + PIECE_VALUE[m.promotion];
  if (ply < MAX_PLY && killers[ply][0] === key) return 800_000;   // killer 1
  if (ply < MAX_PLY && killers[ply][1] === key) return 700_000;   // killer 2
  if (m.flags && m.flags.includes('j')) return 300;               // aura jump
  return 0;
}

function orderMoves(moves, ttMoveKey, ply) {
  return moves
    .map(m => ({ m, s: scoreMoveForOrdering(m, ttMoveKey, ply) }))
    .sort((a, b) => b.s - a.s)
    .map(x => x.m);
}

// ── Quiescence search (negamax) ──────────────────────────────────
let searchDeadline = 0;
let nodesSearched  = 0;

function qsearch(game, alpha, beta, qdepth) {
  nodesSearched++;
  if ((nodesSearched & 1023) === 0 && performance.now() > searchDeadline) {
    return evalNegamax(game);
  }

  // Stand-pat: assume we can always "do nothing" and keep the current eval
  const standPat = evalNegamax(game);
  if (standPat >= beta)  return beta;   // fail-hard cutoff
  if (standPat > alpha)  alpha = standPat;
  if (qdepth >= 6)       return alpha;  // max quiescence depth

  const allMoves = game.moves({ verbose: true });
  const captures = allMoves.filter(m => m.captured || m.promotion);
  if (captures.length === 0) return alpha;

  // Order captures: highest-value victim first
  captures.sort((a, b) =>
    (PIECE_VALUE[b.captured] || 0) - (PIECE_VALUE[a.captured] || 0)
  );

  const fen = game.fen();
  for (const move of captures) {
    // Delta pruning: skip hopeless captures (can't raise alpha even with optimism margin)
    if (standPat + (PIECE_VALUE[move.captured] || 200) + 150 < alpha) continue;

    const child = new KnightJumpChess(fen, game.getVariantRules());
    child.move(move);
    const score = -qsearch(child, -beta, -alpha, qdepth + 1);

    if (score >= beta)   return beta;
    if (score > alpha)   alpha = score;
  }

  return alpha;
}

// ── Alpha-beta (negamax) ─────────────────────────────────────────
function alphaBeta(game, depth, alpha, beta, ply, useQSearch) {
  nodesSearched++;
  if ((nodesSearched & 511) === 0 && performance.now() > searchDeadline) {
    return evalNegamax(game);
  }

  const fen = game.fen();

  // ── Transposition table probe ──
  const tt = ttProbe(fen);
  let ttMoveKey = null;
  if (tt) {
    ttMoveKey = tt.bestMoveKey;
    if (tt.depth >= depth) {
      if (tt.flag === TT_EXACT) return tt.score;
      if (tt.flag === TT_LOWER && tt.score > alpha) alpha = tt.score;
      if (tt.flag === TT_UPPER && tt.score < beta)  beta  = tt.score;
      if (alpha >= beta) return tt.score;
    }
  }

  // ── Leaf node ──
  if (depth <= 0) {
    return useQSearch ? qsearch(game, alpha, beta, 0) : evalNegamax(game);
  }

  const moves = game.moves({ verbose: true });

  // ── No moves: terminal position ──
  if (moves.length === 0) {
    const raw = evaluate(game);
    if (Math.abs(raw) > 50000) {
      // King captured (variant win condition)
      return game.turn() === 'w' ? raw : -raw;
    }
    if (game.isCheckmateRider()) return -80000 - depth; // checkmate: bad for side to move
    return 0; // stalemate
  }

  const ordered = orderMoves(moves, ttMoveKey, ply);
  const origAlpha = alpha;
  let bestScore   = -Infinity;
  let bestMoveKey = null;

  for (let i = 0; i < ordered.length; i++) {
    const move  = ordered[i];
    const child = new KnightJumpChess(fen, game.getVariantRules());
    child.move(move);

    let score;

    // ── Late Move Reduction (LMR) ──
    // Reduce depth for quiet, late moves that are unlikely to be best.
    // Only at sufficient depth and after the first few moves.
    const isQuiet = !move.captured && !move.promotion;
    if (i >= 4 && depth >= 3 && isQuiet && ply > 0) {
      const reduction = i >= 8 ? 2 : 1;
      // Reduced-depth search with null window
      score = -alphaBeta(child, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, useQSearch);
      if (score > alpha) {
        // Surprising move — re-search at full depth
        score = -alphaBeta(child, depth - 1, -beta, -alpha, ply + 1, useQSearch);
      }
    } else {
      score = -alphaBeta(child, depth - 1, -beta, -alpha, ply + 1, useQSearch);
    }

    if (score > bestScore) {
      bestScore   = score;
      bestMoveKey = move.from + move.to;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (isQuiet) storeKiller(ply, move.from + move.to);
      break; // beta cutoff
    }
  }

  // ── Transposition table store ──
  const flag = bestScore <= origAlpha ? TT_UPPER
             : bestScore >= beta      ? TT_LOWER
             : TT_EXACT;
  ttStore(fen, depth, bestScore, flag, bestMoveKey);

  return bestScore;
}

// ── Difficulty profiles ──────────────────────────────────────────
const DIFFICULTY = {
  // Easy: shallow depth, lots of noise, 25% random moves
  easy:   { maxDepth: 2, randomness: 120, timeLimitMs:  600, useQSearch: false },
  // Medium: decent depth, small noise, quiescence
  medium: { maxDepth: 4, randomness:  20, timeLimitMs: 2000, useQSearch: true  },
  // Hard: deep, no noise, full optimisations
  hard:   { maxDepth: 6, randomness:   0, timeLimitMs: 5000, useQSearch: true  },
  // Expert: very deep, iterative deepening to time limit
  expert: { maxDepth: 10, randomness:  0, timeLimitMs: 12000, useQSearch: true },
};

// ── Find best move (iterative deepening) ─────────────────────────
function findBestMove(fen, difficulty, variantRules) {
  const settings = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const game     = new KnightJumpChess(fen, variantRules);
  const moves    = game.moves({ verbose: true });

  // A FEN alone does not identify positions played under different optional rules.
  TT.clear();

  if (moves.length === 0) return null;
  if (moves.length === 1) return { move: moves[0], score: 0, nodes: 1, depth: 1 };

  searchDeadline = performance.now() + settings.timeLimitMs;
  nodesSearched  = 0;

  // Reset killers for fresh search (TT persists across moves — intentional)
  for (const k of killers) { k[0] = null; k[1] = null; }

  let bestMove   = moves[Math.floor(Math.random() * moves.length)]; // safe fallback
  let bestScore  = -Infinity; // negamax: from current player's perspective
  let finalDepth = 1;

  for (let d = 1; d <= settings.maxDepth; d++) {
    if (performance.now() > searchDeadline) break;

    // Probe TT for root position — the previous iteration stores the best move here,
    // which is the single most important move to try first for efficient pruning.
    const rootTt  = ttProbe(fen);
    const ordered = orderMoves(moves, rootTt?.bestMoveKey ?? null, 0);

    let iterBest      = null;
    let iterBestScore = -Infinity;
    // rootAlpha: best negamax score found so far in this iteration.
    // Used as the beta bound for subsequent root moves, enabling alpha-beta pruning.
    let rootAlpha = -Infinity;
    let timedOut  = false;

    for (const move of ordered) {
      if (performance.now() > searchDeadline) { timedOut = true; break; }

      const child = new KnightJumpChess(fen, game.getVariantRules());
      child.move(move);

      // Pass -rootAlpha as beta: once child can refute to better than our current best,
      // this move is pruned. This is standard alpha-beta at the root.
      const score = -alphaBeta(child, d - 1, -Infinity, -rootAlpha, 1, settings.useQSearch);

      // Add noise for lower difficulties (makes choices intentionally suboptimal)
      const jitter   = settings.randomness > 0 ? (Math.random() - 0.5) * settings.randomness : 0;
      const adjusted = score + jitter;

      if (adjusted > iterBestScore) {
        iterBestScore = adjusted;
        iterBest      = move;
      }
      // Update pruning bound with raw (non-jittered) score
      if (score > rootAlpha) rootAlpha = score;
    }

    // Only commit a fully-completed iteration. A partial result (timed out mid-loop)
    // is unreliable because good moves at the end of the list weren't searched.
    if (!timedOut && iterBest) {
      bestMove   = iterBest;
      bestScore  = iterBestScore;
      finalDepth = d;
      // Cache this iteration's best move in TT so the next depth orders it first.
      ttStore(fen, d, rootAlpha, TT_EXACT, iterBest.from + iterBest.to);
    }
  }

  // Easy: 30% chance of a random legal move to feel human-clumsy
  if (difficulty === 'easy' && Math.random() < 0.30) {
    bestMove = moves[Math.floor(Math.random() * moves.length)];
  }

  return { move: bestMove, score: bestScore, nodes: nodesSearched, depth: finalDepth };
}

// ── Worker message handler ────────────────────────────────────────
self.onmessage = function (e) {
  const { type, fen, difficulty, variantRules, id } = e.data;
  if (type !== 'search') return;

  try {
    const t0     = performance.now();
    const result = findBestMove(fen, difficulty || 'medium', variantRules);
    const elapsed = performance.now() - t0;

    if (!result || !result.move) {
      self.postMessage({ type: 'error', message: 'No legal moves', id });
      return;
    }

    self.postMessage({
      type:      'result',
      from:      result.move.from,
      to:        result.move.to,
      promotion: result.move.promotion || null,
      san:       result.move.san || `${result.move.from}${result.move.to}`,
      score:     result.score,
      nodes:     result.nodes,
      timeMs:    Math.round(elapsed),
      depth:     result.depth,
      id,
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message, id });
  }
};
