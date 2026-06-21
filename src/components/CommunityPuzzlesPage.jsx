import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import './LearnPage.css';
import './CommunityPuzzlesPage.css';
import KnightJumpChess from '../KnightJumpChess.js';
import { db, firebaseEnabled } from '../utils/firebase.js';

import pieceNlt from '../assets/chess/cburnett/Chess_nlt45.svg';
import pieceNdt from '../assets/chess/cburnett/Chess_ndt45.svg';
import pieceBlt from '../assets/chess/cburnett/Chess_blt45.svg';
import pieceBdt from '../assets/chess/cburnett/Chess_bdt45.svg';
import pieceRlt from '../assets/chess/cburnett/Chess_rlt45.svg';
import pieceRdt from '../assets/chess/cburnett/Chess_rdt45.svg';
import pieceQlt from '../assets/chess/cburnett/Chess_qlt45.svg';
import pieceQdt from '../assets/chess/cburnett/Chess_qdt45.svg';
import pieceKlt from '../assets/chess/cburnett/Chess_klt45.svg';
import pieceKdt from '../assets/chess/cburnett/Chess_kdt45.svg';
import piecePlt from '../assets/chess/cburnett/Chess_plt45.svg';
import piecePdt from '../assets/chess/cburnett/Chess_pdt45.svg';

const PIECE_SRC = {
  N: pieceNlt, n: pieceNdt,
  B: pieceBlt, b: pieceBdt,
  R: pieceRlt, r: pieceRdt,
  Q: pieceQlt, q: pieceQdt,
  K: pieceKlt, k: pieceKdt,
  P: piecePlt, p: piecePdt,
};

const LOCAL_STORAGE_KEY = 'cr_community_puzzles_local';
const DEFAULT_FEN = '6k1/8/8/8/8/8/5K2/8 w - - 0 1';
const FILES = 'abcdefgh';
const PIECE_OPTIONS = [
  ['P', 'White pawn'], ['N', 'White knight'], ['B', 'White bishop'],
  ['R', 'White rook'], ['Q', 'White queen'], ['K', 'White king'],
  ['p', 'Black pawn'], ['n', 'Black knight'], ['b', 'Black bishop'],
  ['r', 'Black rook'], ['q', 'Black queen'], ['k', 'Black king'],
];
const DEFAULT_FORM = {
  title: '',
  description: '',
  hint: '',
  tags: '',
};

function loadLocalPuzzles() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalPuzzles(puzzles) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(puzzles));
  } catch {
    // Ignore local storage failures.
  }
}

function mergeLocalPuzzles(sharedPuzzles) {
  return [...loadLocalPuzzles(), ...sharedPuzzles];
}

function normalizeTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, allTags) => allTags.indexOf(tag) === index)
    .slice(0, 5);
}

function tagsToInput(tags) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

function hasModeratorClaim(claims) {
  return Boolean(claims?.admin === true || claims?.puzzleModerator === true);
}

function isLocalPuzzle(puzzle) {
  return String(puzzle?.id || '').startsWith('local-') || puzzle?.authorId === 'local';
}

function getPuzzleStatus(puzzle) {
  return puzzle?.status || 'approved';
}

function canManagePuzzle(puzzle, currentUser, moderator) {
  if (isLocalPuzzle(puzzle)) return true;
  return Boolean(currentUser && (puzzle.authorId === currentUser.uid || moderator));
}

function getPuzzleUrl() {
  if (typeof window === 'undefined') return '/Puzzles';
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${window.location.origin}${basePath}/Puzzles`;
}

function squareFromCoords(row, col) {
  return `${FILES[col]}${8 - row}`;
}

function isBrowseVisible(puzzle, currentUser, moderator) {
  const status = getPuzzleStatus(puzzle);
  return status === 'approved' || puzzle.authorId === currentUser?.uid || moderator || isLocalPuzzle(puzzle);
}

function formatPuzzleDate(puzzle) {
  const rawDate = puzzle?.createdAt?.toDate?.() || (typeof puzzle?.createdAt === 'number' ? new Date(puzzle.createdAt) : null);
  return rawDate ? rawDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Just now';
}

function normalizeMoveText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function moveToNotation(move) {
  return `${move.from}${move.to}${move.promotion || ''}`.toLowerCase();
}

function fenToCells(fen) {
  const placement = String(fen || '').trim().split(' ')[0] || '';
  const rows = placement.split('/');
  const cells = {};
  rows.forEach((row, rowIndex) => {
    let colIndex = 0;
    for (const ch of row) {
      if (/^\d$/.test(ch)) {
        colIndex += Number(ch);
        continue;
      }
      if (colIndex > 7) break;
      cells[`${rowIndex},${colIndex}`] = { piece: ch };
      colIndex += 1;
    }
  });
  return cells;
}

function fenToPieces(fen) {
  const cells = fenToCells(fen);
  return Object.fromEntries(
    Object.entries(cells).map(([key, cell]) => {
      const [row, col] = key.split(',').map(Number);
      return [squareFromCoords(row, col), cell.piece];
    })
  );
}

function piecesToFen(pieces, sideToMove = 'w') {
  const rows = [];
  for (let row = 0; row < 8; row += 1) {
    let empty = 0;
    let fenRow = '';
    for (let col = 0; col < 8; col += 1) {
      const piece = pieces[squareFromCoords(row, col)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        fenRow += empty;
        empty = 0;
      }
      fenRow += piece;
    }
    rows.push(fenRow + (empty || ''));
  }
  return `${rows.join('/')} ${sideToMove} - - 0 1`;
}

function getKingCount(pieces, king) {
  return Object.values(pieces).filter((piece) => piece === king).length;
}

function getLegalMoveFromSquares(fen, from, to) {
  if (!from || !to) return null;
  try {
    const game = new KnightJumpChess(fen);
    const moves = game.moves({ verbose: true }) || [];
    const matchingMoves = moves.filter((move) => move.from === from && move.to === to);
    return matchingMoves.find((move) => !move.promotion) ||
      matchingMoves.find((move) => move.promotion === 'q') ||
      matchingMoves[0] ||
      null;
  } catch {
    return null;
  }
}

function replaySolutionMoves(fen, solutionMoves = []) {
  try {
    const game = new KnightJumpChess(fen);
    const appliedMoves = [];
    for (const notation of solutionMoves) {
      const move = getLegalMatch(game, notation);
      if (!move) return { fen: game.fen(), appliedMoves, valid: false };
      const applied = game.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || 'q',
      });
      if (!applied) return { fen: game.fen(), appliedMoves, valid: false };
      appliedMoves.push(applied);
    }
    return { fen: game.fen(), appliedMoves, valid: true };
  } catch {
    return { fen, appliedMoves: [], valid: false };
  }
}

function getPuzzleSolutionMoves(puzzle) {
  if (Array.isArray(puzzle?.solutionMoves) && puzzle.solutionMoves.length > 0) {
    return puzzle.solutionMoves.filter((move) => typeof move === 'string').slice(0, 20);
  }
  try {
    const game = new KnightJumpChess(puzzle?.fen || DEFAULT_FEN);
    const move = getLegalMatch(game, puzzle?.solution || '');
    return move ? [moveToNotation(move)] : [];
  } catch {
    return [];
  }
}

function Board({ fen, onSquareClick, selectedSquares = [] }) {
  const cells = useMemo(() => fenToCells(fen), [fen]);
  const squareEls = [];
  const interactive = Boolean(onSquareClick);
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const cell = cells[`${r},${c}`] || {};
      const light = (r + c) % 2 === 0;
      const piece = cell.piece;
      const square = squareFromCoords(r, c);
      const className = [
        'cb-cell',
        light ? 'light' : 'dark',
        interactive ? 'cp-board-cell-btn' : '',
        selectedSquares.includes(square) ? 'cp-board-cell-selected' : '',
      ].filter(Boolean).join(' ');
      const content = piece && (
        <div className="cb-piece" aria-label={piece}>
          <img src={PIECE_SRC[piece]} alt="" draggable="false" />
        </div>
      );

      squareEls.push(
        interactive ? (
          <button
            key={`${r}-${c}`}
            type="button"
            className={className}
            style={{ width: 52, height: 52 }}
            onClick={() => onSquareClick(square)}
          >
            {content}
          </button>
        ) : (
          <div
            key={`${r}-${c}`}
            className={className}
            style={{ width: 52, height: 52 }}
          >
            {content}
          </div>
        )
      );
    }
  }
  return (
    <div className="cp-board-shell">
      <div className="cb-board cp-board" style={{ gridTemplateColumns: 'repeat(8, 52px)', width: 416 }}>
        {squareEls}
      </div>
    </div>
  );
}

function BoardBuilder({
  pieces,
  sideToMove,
  selectedPiece,
  builderMode,
  solutionMoves,
  solutionFrom,
  solutionTo,
  onSelectPiece,
  onSelectMode,
  onSelectSide,
  onPlacePiece,
  onSelectSolutionSquare,
  onUndoSolution,
  onClearSolution,
  onClearBoard,
}) {
  const baseFen = piecesToFen(pieces, sideToMove);
  const replayedSolution = useMemo(
    () => replaySolutionMoves(baseFen, solutionMoves),
    [baseFen, solutionMoves]
  );
  const fen = builderMode === 'solution' ? replayedSolution.fen : baseFen;
  const selectedSquares = [solutionFrom, solutionTo].filter(Boolean);

  return (
    <div className="cp-builder">
      <div className="cp-builder-board">
        <Board
          fen={fen}
          onSquareClick={builderMode === 'solution' ? onSelectSolutionSquare : onPlacePiece}
          selectedSquares={selectedSquares}
        />
      </div>

      <div className="cp-builder-tools">
        <div className="cp-tool-row">
          <button
            type="button"
            className={`cp-filter-btn${builderMode === 'pieces' ? ' active' : ''}`}
            onClick={() => onSelectMode('pieces')}
          >
            Pieces
          </button>
          <button
            type="button"
            className={`cp-filter-btn${builderMode === 'solution' ? ' active' : ''}`}
            onClick={() => onSelectMode('solution')}
          >
            Solution
          </button>
        </div>

        {builderMode === 'pieces' ? (
          <>
            <div className="cp-piece-palette">
              {PIECE_OPTIONS.map(([piece, label]) => (
                <button
                  key={piece}
                  type="button"
                  className={`cp-piece-btn${selectedPiece === piece ? ' active' : ''}`}
                  onClick={() => onSelectPiece(piece)}
                  title={label}
                >
                  <img src={PIECE_SRC[piece]} alt="" draggable="false" />
                </button>
              ))}
              <button
                type="button"
                className={`cp-piece-btn cp-piece-btn--erase${selectedPiece === '' ? ' active' : ''}`}
                onClick={() => onSelectPiece('')}
                title="Erase"
              >
                ×
              </button>
            </div>
            <button type="button" className="btn btn-ghost" onClick={onClearBoard}>
              Clear board
            </button>
          </>
        ) : (
          <div className="cp-solution-builder">
            <div className="cp-solution-picks">
              <span>From: {solutionFrom || '-'}</span>
              <span>To: {solutionTo || '-'}</span>
            </div>
            <div className="cp-sequence-list" aria-label="Solution moves">
              {solutionMoves.length > 0
                ? solutionMoves.map((move, index) => (
                  <span className="cp-sequence-chip" key={`${move}-${index}`}>
                    {index + 1}. {move}
                  </span>
                ))
                : <span className="cp-hint">No moves selected yet.</span>}
            </div>
            <p className="cp-hint">
              Click a piece and destination. The board will move forward so you can add the next solution move.
            </p>
            <div className="cp-sequence-actions">
              <button type="button" className="btn btn-ghost" onClick={onUndoSolution} disabled={solutionMoves.length === 0}>
                Undo last move
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClearSolution} disabled={solutionMoves.length === 0}>
                Clear solution
              </button>
            </div>
          </div>
        )}

        <div className="cp-side-toggle">
          <span>Side to move</span>
          <button
            type="button"
            className={`cp-filter-btn${sideToMove === 'w' ? ' active' : ''}`}
            onClick={() => onSelectSide('w')}
          >
            White
          </button>
          <button
            type="button"
            className={`cp-filter-btn${sideToMove === 'b' ? ' active' : ''}`}
            onClick={() => onSelectSide('b')}
          >
            Black
          </button>
        </div>
      </div>
    </div>
  );
}

function getLegalMatch(game, answerText) {
  const normalized = normalizeMoveText(answerText);
  if (!normalized) return null;
  const moves = game.moves({ verbose: true }) || [];
  return moves.find((move) => {
    const san = normalizeMoveText(move.san);
    const uci = moveToNotation(move);
    return san === normalized || uci === normalized || `${move.from}${move.to}` === normalized;
  }) || null;
}

function PuzzleCard({
  puzzle,
  currentUser,
  moderator,
  following,
  onEdit,
  onDelete,
  onModerate,
  onToggleFollow,
}) {
  const [moveFrom, setMoveFrom] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [displayFen, setDisplayFen] = useState(puzzle.fen);
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [lastAttemptCorrect, setLastAttemptCorrect] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [ratings, setRatings] = useState([]);
  const [solved, setSolved] = useState(false);
  const solutionMoves = useMemo(() => getPuzzleSolutionMoves(puzzle), [puzzle]);

  const sideToMove = String(puzzle.sideToMove || puzzle.fen?.split?.(' ')?.[1] || 'w').toLowerCase() === 'b'
    ? 'Black'
    : 'White';
  const status = getPuzzleStatus(puzzle);
  const manageable = canManagePuzzle(puzzle, currentUser, moderator);
  const canFollow = Boolean(
    currentUser &&
    !currentUser.isAnonymous &&
    !isLocalPuzzle(puzzle) &&
    puzzle.authorId &&
    puzzle.authorId !== currentUser.uid
  );
  const canRate = Boolean(currentUser && !currentUser.isAnonymous && !isLocalPuzzle(puzzle));
  const ratingCount = ratings.length;
  const ratingAverage = ratingCount > 0
    ? ratings.reduce((sum, row) => sum + row.rating, 0) / ratingCount
    : 0;
  const ownRating = ratings.find((row) => row.uid === currentUser?.uid)?.rating || 0;

  useEffect(() => {
    if (!firebaseEnabled || !db || isLocalPuzzle(puzzle)) {
      setRatings([]);
      return undefined;
    }

    return onSnapshot(
      collection(db, 'community_puzzles', puzzle.id, 'ratings'),
      (snap) => {
        setRatings(snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((row) => Number.isInteger(row.rating) && row.rating >= 1 && row.rating <= 5));
      },
      () => setRatings([])
    );
  }, [puzzle]);

  const resetPuzzle = () => {
    setDisplayFen(puzzle.fen);
    setSolutionIndex(0);
    setMoveFrom('');
    setMoveTo('');
    setLastAttemptCorrect(null);
    setFeedback('Choose the piece you want to move.');
    setSolved(false);
  };

  const checkSelectedMove = (from, to, currentFen) => {
    const game = new KnightJumpChess(currentFen);
    const userMove = getLegalMoveFromSquares(currentFen, from, to);
    const solutionMove = getLegalMatch(game, solutionMoves[solutionIndex]);

    if (!solutionMove) {
      setFeedback('This puzzle is missing a valid solution.');
      return;
    }

    if (!userMove) return;

    game.move({
      from: userMove.from,
      to: userMove.to,
      promotion: userMove.promotion || 'q',
    });
    setDisplayFen(game.fen());

    if (moveToNotation(userMove) === moveToNotation(solutionMove)) {
      const nextIndex = solutionIndex + 1;
      const complete = nextIndex >= solutionMoves.length;
      setSolutionIndex(nextIndex);
      setLastAttemptCorrect(true);
      setSolved(complete);
      setFeedback(complete
        ? 'Correct. You completed the full solution.'
        : `Correct. Find move ${nextIndex + 1} of ${solutionMoves.length}.`);
      return;
    }

    setLastAttemptCorrect(false);
    setSolved(false);
    setFeedback('Not quite. The move is shown; click another piece to retry this step.');
  };

  const handleBoardSquareClick = (square) => {
    if (solved) return;

    let currentFen = displayFen;
    if (moveTo) {
      if (lastAttemptCorrect === false) {
        currentFen = replaySolutionMoves(puzzle.fen, solutionMoves.slice(0, solutionIndex)).fen;
        setDisplayFen(currentFen);
      }
      setMoveFrom('');
      setMoveTo('');
    }

    const game = new KnightJumpChess(currentFen);
    const legalMoves = game.moves({ verbose: true }) || [];
    const isLegalSource = legalMoves.some((move) => move.from === square);

    if (!moveFrom || moveTo) {
      if (!isLegalSource) {
        setMoveFrom('');
        setFeedback('Choose a piece that can move.');
        return;
      }
      setMoveFrom(square);
      setFeedback('Now click where that piece should move.');
      return;
    }

    if (square === moveFrom) {
      setMoveFrom('');
      setFeedback('Choose the piece you want to move.');
      return;
    }

    const selectedMove = getLegalMoveFromSquares(currentFen, moveFrom, square);
    if (!selectedMove) {
      if (isLegalSource) {
        setMoveFrom(square);
        setFeedback('Now click where that piece should move.');
      } else {
        setFeedback('That destination is not legal. Try another square.');
      }
      return;
    }

    setMoveTo(square);
    checkSelectedMove(moveFrom, square, currentFen);
  };

  const handleRate = async (rating) => {
    if (!canRate) return;
    await setDoc(
      doc(db, 'community_puzzles', puzzle.id, 'ratings', currentUser.uid),
      {
        uid: currentUser.uid,
        rating,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  return (
    <article className={`cp-card${solved ? ' is-solved' : ''}`}>
      <div className="cp-card__meta">
        <div>
          <p className="cp-kicker">{puzzle.authorName || 'Community'}</p>
          <h3>{puzzle.title || 'Untitled puzzle'}</h3>
        </div>
        <div className="cp-card__badges">
          {puzzle.featured && <span className="cp-pill cp-pill--featured">Featured</span>}
          {status !== 'approved' && <span className={`cp-pill cp-pill--${status}`}>{status}</span>}
          <span className="cp-pill">{sideToMove} to move</span>
        </div>
      </div>
      {Array.isArray(puzzle.tags) && puzzle.tags.length > 0 && (
        <div className="cp-tag-row">
          {puzzle.tags.map((tag) => <span key={tag} className="cp-tag">{tag}</span>)}
        </div>
      )}
      <p className="cp-description">{puzzle.description || 'A community-made position from the board.'}</p>
      <div className="cp-board-wrap">
        <Board
          fen={displayFen}
          onSquareClick={handleBoardSquareClick}
          selectedSquares={[moveFrom, moveTo].filter(Boolean)}
        />
      </div>
      <div className="cp-solution">
        <span className="cp-label">Your move</span>
        <p className="cp-hint">
          Click a piece, then its destination. Step {Math.min(solutionIndex + 1, Math.max(solutionMoves.length, 1))} of {Math.max(solutionMoves.length, 1)}.
        </p>
        {puzzle.hint && <p className="cp-hint">Hint: {puzzle.hint}</p>}
        {feedback && <p className={`cp-feedback${solved ? ' is-solved' : ''}`}>{feedback}</p>}
        <button type="button" className="btn btn-ghost" onClick={resetPuzzle}>
          Reset puzzle
        </button>
      </div>
      <div className="cp-footer">
        <span>{formatPuzzleDate(puzzle)}</span>
        <span>{ratingCount > 0 ? `${ratingAverage.toFixed(1)} / 5 (${ratingCount})` : 'Unrated'}</span>
      </div>
      <div className="cp-rating-row" aria-label="Puzzle rating">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className={`cp-rate-btn${ownRating >= rating ? ' active' : ''}`}
            onClick={() => handleRate(rating)}
            disabled={!canRate}
            title={canRate ? `Rate ${rating}` : 'Sign in to rate'}
          >
            ★
          </button>
        ))}
      </div>
      {(manageable || moderator) && (
        <div className="cp-card__actions">
          {manageable && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => onEdit(puzzle)}>
                Edit
              </button>
              <button type="button" className="btn btn-danger" onClick={() => onDelete(puzzle)}>
                Delete
              </button>
            </>
          )}
          {moderator && !isLocalPuzzle(puzzle) && (
            <>
              {status !== 'approved' && (
                <button type="button" className="btn btn-primary" onClick={() => onModerate(puzzle, { status: 'approved' })}>
                  Approve
                </button>
              )}
              {status !== 'rejected' && (
                <button type="button" className="btn btn-ghost" onClick={() => onModerate(puzzle, { status: 'rejected' })}>
                  Reject
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onModerate(puzzle, { featured: !puzzle.featured })}
              >
                {puzzle.featured ? 'Unfeature' : 'Feature'}
              </button>
            </>
          )}
        </div>
      )}
      {canFollow && (
        <div className="cp-card__actions cp-card__actions--follow">
          <button type="button" className="btn btn-ghost" onClick={() => onToggleFollow(puzzle)}>
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
      )}
    </article>
  );
}

export default function CommunityPuzzlesPage({ onBack, onOpenLearn, currentUser, currentUserName }) {
  const [puzzles, setPuzzles] = useState([]);
  const [view, setView] = useState('browse');
  const [filter, setFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [editingPuzzleId, setEditingPuzzleId] = useState(null);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [moderator, setModerator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState('');
  const [submitStatus, setSubmitStatus] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [builderPieces, setBuilderPieces] = useState(() => fenToPieces(DEFAULT_FEN));
  const [sideToMove, setSideToMove] = useState('w');
  const [selectedPiece, setSelectedPiece] = useState('P');
  const [builderMode, setBuilderMode] = useState('pieces');
  const [solutionMoves, setSolutionMoves] = useState([]);
  const [solutionFrom, setSolutionFrom] = useState('');
  const [solutionTo, setSolutionTo] = useState('');
  const storageMode = firebaseEnabled && db && currentUser ? 'Firestore' : 'Local';

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'knightAuraChess — Puzzles';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!currentUser?.getIdTokenResult) {
      setModerator(false);
      return undefined;
    }

    currentUser.getIdTokenResult()
      .then((tokenResult) => {
        if (active) setModerator(hasModeratorClaim(tokenResult?.claims));
      })
      .catch(() => {
        if (active) setModerator(false);
      });

    return () => {
      active = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!firebaseEnabled || !db || !currentUser || currentUser.isAnonymous) {
      setFollowingIds(new Set());
      return undefined;
    }

    return onSnapshot(
      collection(db, 'users', currentUser.uid, 'puzzle_following'),
      (snap) => {
        setFollowingIds(new Set(snap.docs.map((docSnap) => docSnap.id)));
      },
      () => setFollowingIds(new Set())
    );
  }, [currentUser]);

  const visiblePuzzles = useMemo(
    () => puzzles.filter((puzzle) => isBrowseVisible(puzzle, currentUser, moderator)),
    [currentUser, moderator, puzzles]
  );

  const availableTags = useMemo(() => {
    const tags = new Set();
    visiblePuzzles.forEach((puzzle) => {
      (puzzle.tags || []).forEach((tag) => tags.add(tag));
    });
    return [...tags].sort();
  }, [visiblePuzzles]);

  const featuredPuzzles = useMemo(
    () => visiblePuzzles.filter((puzzle) => puzzle.featured && getPuzzleStatus(puzzle) === 'approved'),
    [visiblePuzzles]
  );

  const filteredPuzzles = useMemo(() => {
    return visiblePuzzles.filter((puzzle) => {
      if (filter === 'featured' && !puzzle.featured) return false;
      if (filter === 'mine' && puzzle.authorId !== currentUser?.uid && !isLocalPuzzle(puzzle)) return false;
      if (filter === 'pending' && getPuzzleStatus(puzzle) !== 'pending') return false;
      if (tagFilter !== 'all' && !(puzzle.tags || []).includes(tagFilter)) return false;
      return true;
    });
  }, [currentUser, filter, tagFilter, visiblePuzzles]);

  const resetForm = () => {
    setEditingPuzzleId(null);
    setForm(DEFAULT_FORM);
    setBuilderPieces(fenToPieces(DEFAULT_FEN));
    setSideToMove('w');
    setSelectedPiece('P');
    setBuilderMode('pieces');
    setSolutionMoves([]);
    setSolutionFrom('');
    setSolutionTo('');
  };

  const syncLocalPuzzleState = (nextLocalPuzzles) => {
    saveLocalPuzzles(nextLocalPuzzles);
    setPuzzles((current) => [
      ...nextLocalPuzzles,
      ...current.filter((puzzle) => !isLocalPuzzle(puzzle)),
    ]);
  };

  useEffect(() => {
    if (!firebaseEnabled || !db) {
      setPuzzles(loadLocalPuzzles());
      setLoading(false);
      return undefined;
    }

    const puzzleQuery = query(
      collection(db, 'community_puzzles'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    return onSnapshot(
      puzzleQuery,
      (snap) => {
        setPuzzles(mergeLocalPuzzles(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))));
        setLoading(false);
      },
      (error) => {
        console.warn('Community puzzles snapshot failed:', error?.message || error);
        setPuzzles(loadLocalPuzzles());
        setLoading(false);
      }
    );
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitStatus('');

    const title = form.title.trim();
    const description = form.description.trim();
    const hint = form.hint.trim();
    const tags = normalizeTags(form.tags);
    const fen = piecesToFen(builderPieces, sideToMove);
    const replayedSolution = replaySolutionMoves(fen, solutionMoves);
    const firstSolutionMove = replayedSolution.appliedMoves[0];

    if (!title) {
      setSubmitError('Add a title.');
      return;
    }

    if (getKingCount(builderPieces, 'K') !== 1 || getKingCount(builderPieces, 'k') !== 1) {
      setSubmitError('Place exactly one white king and one black king.');
      return;
    }

    if (solutionMoves.length === 0 || !replayedSolution.valid || !firstSolutionMove) {
      setSubmitError('Add at least one legal solution move on the board.');
      return;
    }

    try {
      const probe = new KnightJumpChess(fen);
      if (!probe.fen()) {
        throw new Error('The board position is invalid.');
      }

      const existingPuzzle = editingPuzzleId
        ? puzzles.find((puzzle) => puzzle.id === editingPuzzleId)
        : null;
      const wasEditing = Boolean(editingPuzzleId);
      const editingLocal = Boolean(editingPuzzleId?.startsWith?.('local-') || isLocalPuzzle(existingPuzzle));
      const nextStatus = firebaseEnabled && db && currentUser
        ? (wasEditing && moderator ? (existingPuzzle?.status || 'pending') : 'pending')
        : 'approved';
      const payload = {
        title,
        description,
        fen,
        solution: firstSolutionMove.san,
        solutionMoves,
        hint,
        tags,
        authorId: currentUser?.uid || 'local',
        authorName: currentUserName || 'Guest creator',
        featured: existingPuzzle?.featured || false,
        status: nextStatus,
        createdAt: existingPuzzle?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      if (firebaseEnabled && db && currentUser && !editingLocal) {
        if (editingPuzzleId) {
          await updateDoc(doc(db, 'community_puzzles', editingPuzzleId), {
            title,
            description,
            fen,
            solution: firstSolutionMove.san,
            solutionMoves,
            hint,
            tags,
            status: nextStatus,
            updatedAt: serverTimestamp(),
          });
        } else {
          const puzzleRef = await addDoc(collection(db, 'community_puzzles'), {
            ...payload,
            authorId: currentUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          try {
            const followersSnap = await getDocs(collection(db, 'puzzle_creators', currentUser.uid, 'followers'));
            await Promise.all(followersSnap.docs.map((followerDoc) => {
              const follower = followerDoc.data();
              if (!follower.followerEmail) return Promise.resolve();
              return addDoc(collection(db, 'mail'), {
                to: follower.followerEmail,
                creatorId: currentUser.uid,
                followerId: followerDoc.id,
                puzzleId: puzzleRef.id,
                template: {
                  name: 'newCommunityPuzzle',
                  data: {
                    authorName: currentUserName || 'A player',
                    puzzleTitle: title,
                    puzzleUrl: getPuzzleUrl(),
                  },
                },
                createdAt: serverTimestamp(),
              });
            }));
          } catch (notifyError) {
            console.warn('Puzzle follower email queue failed:', notifyError?.message || notifyError);
          }
        }
      } else {
        const localEntry = { id: editingPuzzleId || `local-${Date.now()}`, ...payload, status: 'approved' };
        const currentLocal = loadLocalPuzzles();
        const next = editingPuzzleId
          ? currentLocal.map((puzzle) => puzzle.id === editingPuzzleId ? { ...puzzle, ...localEntry } : puzzle)
          : [localEntry, ...currentLocal];
        syncLocalPuzzleState(next);
      }

      resetForm();
      setView('browse');
      setSubmitStatus(wasEditing
        ? 'Puzzle updated.'
        : (firebaseEnabled && db && currentUser
          ? 'Puzzle submitted for approval.'
          : 'Puzzle saved locally in this browser.'));
    } catch (error) {
      setSubmitError(error?.message || 'Could not publish puzzle.');
    }
  };

  const handleEdit = (puzzle) => {
    const nextPieces = fenToPieces(puzzle.fen || DEFAULT_FEN);
    const nextSideToMove = String(puzzle.fen || DEFAULT_FEN).split(' ')[1] === 'b' ? 'b' : 'w';
    const existingSolutionMoves = getPuzzleSolutionMoves(puzzle);

    setSubmitError('');
    setSubmitStatus('');
    setEditingPuzzleId(puzzle.id);
    setForm({
      title: puzzle.title || '',
      description: puzzle.description || '',
      hint: puzzle.hint || '',
      tags: tagsToInput(puzzle.tags),
    });
    setBuilderPieces(nextPieces);
    setSideToMove(nextSideToMove);
    setSelectedPiece('P');
    setBuilderMode('solution');
    setSolutionMoves(existingSolutionMoves);
    setSolutionFrom('');
    setSolutionTo('');
    setView('submit');
  };

  const handlePlacePiece = (square) => {
    setSolutionMoves([]);
    setSolutionFrom('');
    setSolutionTo('');
    setBuilderPieces((current) => {
      const next = { ...current };
      if (selectedPiece) next[square] = selectedPiece;
      else delete next[square];
      return next;
    });
  };

  const handleSelectSolutionSquare = (square) => {
    if (solutionMoves.length >= 20 && (!solutionFrom || solutionTo)) {
      setSubmitError('A puzzle solution can contain up to 20 moves.');
      return;
    }
    const baseFen = piecesToFen(builderPieces, sideToMove);
    const currentFen = replaySolutionMoves(baseFen, solutionMoves).fen;
    const game = new KnightJumpChess(currentFen);
    const legalMoves = game.moves({ verbose: true }) || [];
    const isLegalSource = legalMoves.some((move) => move.from === square);

    if (!solutionFrom || (solutionFrom && solutionTo)) {
      if (!isLegalSource) {
        setSolutionFrom('');
        setSolutionTo('');
        setSubmitError('Choose a piece that can move in the current solution position.');
        return;
      }
      setSubmitError('');
      setSolutionFrom(square);
      setSolutionTo('');
      return;
    }
    if (square === solutionFrom) {
      setSolutionFrom('');
      setSolutionTo('');
      return;
    }

    const move = getLegalMoveFromSquares(currentFen, solutionFrom, square);
    if (!move) {
      if (isLegalSource) {
        setSolutionFrom(square);
        setSolutionTo('');
      } else {
        setSubmitError('That destination is not legal in the current solution position.');
      }
      return;
    }

    setSubmitError('');
    setSolutionTo(square);
    setSolutionMoves((current) => [...current, moveToNotation(move)].slice(0, 20));
  };

  const handleDelete = async (puzzle) => {
    setSubmitError('');
    setSubmitStatus('');
    try {
      if (firebaseEnabled && db && currentUser && !isLocalPuzzle(puzzle)) {
        await deleteDoc(doc(db, 'community_puzzles', puzzle.id));
      } else {
        const next = loadLocalPuzzles().filter((entry) => entry.id !== puzzle.id);
        syncLocalPuzzleState(next);
      }
      setSubmitStatus('Puzzle deleted.');
    } catch (error) {
      setSubmitError(error?.message || 'Could not delete puzzle.');
    }
  };

  const handleModerate = async (puzzle, changes) => {
    if (!moderator || !firebaseEnabled || !db || isLocalPuzzle(puzzle)) return;
    setSubmitError('');
    setSubmitStatus('');
    try {
      await updateDoc(doc(db, 'community_puzzles', puzzle.id), {
        ...changes,
        updatedAt: serverTimestamp(),
      });
      setSubmitStatus('Moderation updated.');
    } catch (error) {
      setSubmitError(error?.message || 'Could not update moderation.');
    }
  };

  const handleToggleFollow = async (puzzle) => {
    if (!firebaseEnabled || !db || !currentUser || currentUser.isAnonymous || !puzzle.authorId) return;
    setSubmitError('');
    setSubmitStatus('');

    if (!currentUser.email) {
      setSubmitError('Your account needs an email address to follow puzzle creators.');
      return;
    }

    const followingRef = doc(db, 'users', currentUser.uid, 'puzzle_following', puzzle.authorId);
    const followerRef = doc(db, 'puzzle_creators', puzzle.authorId, 'followers', currentUser.uid);

    try {
      if (followingIds.has(puzzle.authorId)) {
        await Promise.all([
          deleteDoc(followingRef),
          deleteDoc(followerRef),
        ]);
        setSubmitStatus('Unfollowed.');
        return;
      }

      const payload = {
        creatorId: puzzle.authorId,
        creatorName: puzzle.authorName || 'Player',
        followerId: currentUser.uid,
        followerEmail: currentUser.email,
        followerName: currentUserName || currentUser.email,
        createdAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(followingRef, payload),
        setDoc(followerRef, payload),
      ]);
      setSubmitStatus('Following.');
    } catch (error) {
      setSubmitError(error?.message || 'Could not update follow.');
    }
  };

  return (
    <div className="cp-page">
      <header className="lp-header cp-header">
        <button className="lp-back-btn" onClick={onBack}>
          ← Back to Home
        </button>
        <span className="lp-crumb">Knight-Aura&nbsp;<strong>Puzzles</strong></span>
        <span className="lp-spacer" />
        <nav className="lp-toc">
          <button type="button" className={`lp-toc-link ${view === 'browse' ? 'active' : ''}`} onClick={() => setView('browse')}>
            Browse
          </button>
          <button type="button" className={`lp-toc-link ${view === 'submit' ? 'active' : ''}`} onClick={() => setView('submit')}>
            Submit
          </button>
          <button type="button" className="lp-toc-link" onClick={onOpenLearn}>
            Learn
          </button>
        </nav>
      </header>

      <section className="cp-hero">
        <div className="cp-hero__copy">
          <div className="lp-hero-eyebrow">Community-made</div>
          <h1>Browse puzzles the community publishes, then add your own.</h1>
          <p className="cp-hero__lede">
            Every puzzle here lives in the same repo-backed app. Signed-in players can publish positions, and everyone can solve them.
          </p>
          <div className="cp-hero__actions">
            <button className="btn btn-primary" onClick={() => setView('browse')}>Browse puzzles</button>
            <button className="btn btn-ghost" onClick={() => setView('submit')}>Publish a puzzle</button>
          </div>
        </div>
        <div className="cp-hero__stats">
          <div className="cp-stat">
            <strong>{visiblePuzzles.length}</strong>
            <span>community puzzles</span>
          </div>
          <div className="cp-stat">
            <strong>{storageMode}</strong>
            <span>storage mode</span>
          </div>
          <div className="cp-stat">
            <strong>Click board</strong>
            <span>publishing flow</span>
          </div>
        </div>
      </section>

      <main className="cp-main">
        {(view === 'browse' || view === 'submit') && (
          <section className="cp-panel">
            <div className="cp-panel__head">
              <div>
                <p className="cp-kicker">Browse</p>
                <h2>Community puzzles</h2>
              </div>
              <span className="muted">{loading ? 'Loading...' : `${filteredPuzzles.length} shown`}</span>
            </div>
            <div className="cp-toolbar">
              {['all', 'featured', 'mine', 'pending'].map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  className={`cp-filter-btn${filter === filterKey ? ' active' : ''}`}
                  onClick={() => setFilter(filterKey)}
                >
                  {filterKey.charAt(0).toUpperCase() + filterKey.slice(1)}
                </button>
              ))}
              <select
                className="select cp-tag-select"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
              >
                <option value="all">All tags</option>
                {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </div>
            {featuredPuzzles.length > 0 && filter === 'all' && tagFilter === 'all' && (
              <div className="cp-featured-strip">
                {featuredPuzzles.slice(0, 3).map((puzzle) => (
                  <button key={puzzle.id} type="button" className="cp-featured-tile" onClick={() => setFilter('featured')}>
                    <span>Featured</span>
                    <strong>{puzzle.title || 'Untitled puzzle'}</strong>
                  </button>
                ))}
              </div>
            )}
            {loading ? (
              <p className="muted">Loading puzzles…</p>
            ) : filteredPuzzles.length === 0 ? (
              <p className="muted">No community puzzles yet. Be the first to publish one.</p>
            ) : (
              <div className="cp-list">
                {filteredPuzzles.map((puzzle) => (
                  <PuzzleCard
                    key={puzzle.id}
                    puzzle={puzzle}
                    currentUser={currentUser}
                    moderator={moderator}
                    following={followingIds.has(puzzle.authorId)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onModerate={handleModerate}
                    onToggleFollow={handleToggleFollow}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {view === 'submit' && (
          <section className="cp-panel">
            <div className="cp-panel__head">
              <div>
                <p className="cp-kicker">Submit</p>
                <h2>{editingPuzzleId ? 'Edit your puzzle' : 'Publish your own puzzle'}</h2>
              </div>
              <span className="muted">
                {firebaseEnabled
                  ? (currentUser ? 'Publishing to the shared board.' : 'Sign in to publish to Firestore.')
                  : 'Stored locally in this browser.'}
              </span>
            </div>

            <form className="cp-form" onSubmit={handleSubmit}>
              <label className="cp-field">
                <span>Title</span>
                <input
                  className="select cp-input"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. Fork on f7"
                  maxLength={80}
                />
              </label>
              <label className="cp-field">
                <span>Description</span>
                <textarea
                  className="select cp-textarea"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="A short setup note for the solver."
                  maxLength={240}
                  rows={3}
                />
              </label>
              <BoardBuilder
                pieces={builderPieces}
                sideToMove={sideToMove}
                selectedPiece={selectedPiece}
                builderMode={builderMode}
                solutionMoves={solutionMoves}
                solutionFrom={solutionFrom}
                solutionTo={solutionTo}
                onSelectPiece={setSelectedPiece}
                onSelectMode={setBuilderMode}
                onSelectSide={(color) => {
                  setSideToMove(color);
                  setSolutionMoves([]);
                  setSolutionFrom('');
                  setSolutionTo('');
                }}
                onPlacePiece={handlePlacePiece}
                onSelectSolutionSquare={handleSelectSolutionSquare}
                onUndoSolution={() => {
                  setSolutionMoves((current) => current.slice(0, -1));
                  setSolutionFrom('');
                  setSolutionTo('');
                }}
                onClearSolution={() => {
                  setSolutionMoves([]);
                  setSolutionFrom('');
                  setSolutionTo('');
                }}
                onClearBoard={() => {
                  setBuilderPieces({});
                  setSolutionMoves([]);
                  setSolutionFrom('');
                  setSolutionTo('');
                }}
              />
              <label className="cp-field">
                <span>Hint</span>
                <input
                  className="select cp-input"
                  value={form.hint}
                  onChange={(event) => setForm((current) => ({ ...current, hint: event.target.value }))}
                  placeholder="Optional clue"
                  maxLength={120}
                />
              </label>
              <label className="cp-field">
                <span>Tags</span>
                <input
                  className="select cp-input"
                  value={form.tags}
                  onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="fork, aura, endgame"
                  maxLength={140}
                />
              </label>

              <div className="cp-form__actions">
                <button className="btn btn-primary" type="submit">
                  {editingPuzzleId ? 'Save puzzle' : 'Publish puzzle'}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    resetForm();
                    setView('browse');
                  }}
                >
                  Cancel
                </button>
              </div>
              {submitError && <p className="cp-error">{submitError}</p>}
              {submitStatus && <p className="cp-success">{submitStatus}</p>}
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
