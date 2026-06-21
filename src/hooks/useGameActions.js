import { useCallback, useEffect, useRef } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  query,
} from 'firebase/firestore';
import KnightJumpChess from '../KnightJumpChess.js';
import { moveApiEnabled, moveApiStrict, submitAuthoritativeMove } from '../utils/moveApi.js';
import { normalizeVariantRules, variantRulesKey } from '../utils/variantRules.js';

const GAMES_COLLECTION = 'games';
const RULE_ID = 'chessrider';
const DEFAULT_TIME_CONTROL = 300;
const BOT_CHALLENGE_PENDING_KEY = 'cr_bot_challenge_pending';

export function useGameActions({
  user,
  firebaseEnabled,
  db,
  displayName,
  rating,
  gameId,
  setGameId,
  gameData,
  setGameData,
  game,
  setGame,
  playerColor,
  isOnline,
  aiEnabled,
  setAiEnabled,
  setMoveHistory,
  moveHistory,
  setSelectedSquare,
  setLegalMoves,
  pendingPromotion,
  setPendingPromotion,
  setLastMove,
  setMoveTimestamps,
  moveTimestamps,
  currentMoveStartTime,
  setCurrentMoveStartTime,
  selectedTimeControl,
  setSelectedTimeControl,
  _localResult,
  setLocalResult,
  _movePending,
  setMovePending,
  setMatchError,
  setConnectionState,
  setMatchStatus,
  pushToast,
  playMoveAnimation,
  requestAiMove,
  cancelAiSearch,
  selectedSquare,
  legalMoves,
  incomingChallenge,
  setActiveTab,
  setSetupModalOpen,
  setupVariantRules,
}) {
  function calculateElo(playerRating, opponentRating, score, kFactor = 32) {
    const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    return Math.round(playerRating + kFactor * (score - expected));
  }

  const queuedOnlineMovesRef = useRef([]);
  const drainingOnlineMovesRef = useRef(false);

  useEffect(() => {
    if (!isOnline || !gameId || !user) {
      queuedOnlineMovesRef.current = [];
      drainingOnlineMovesRef.current = false;
    }
  }, [gameId, isOnline, user]);

  const resetPractice = useCallback(() => {
    cancelAiSearch?.();
    const newGame = new KnightJumpChess(undefined, setupVariantRules);
    setGame(newGame);
    setMoveHistory([]);
    setSelectedSquare(null);
    setLegalMoves([]);
    setPendingPromotion(null);
    setLastMove(null);
    setMoveTimestamps([{ white: 0, black: 0 }]);
    setCurrentMoveStartTime(Date.now());
    setLocalResult(null);
    setMovePending(false);
  }, [
    cancelAiSearch,
    setCurrentMoveStartTime,
    setGame,
    setLastMove,
    setLegalMoves,
    setLocalResult,
    setMoveHistory,
    setMovePending,
    setMoveTimestamps,
    setPendingPromotion,
    setSelectedSquare,
    setupVariantRules,
  ]);

  const closeSetupModal = useCallback(() => setSetupModalOpen(false), [setSetupModalOpen]);

  const handleStartPracticeFromSetup = useCallback(() => {
    setAiEnabled(false);
    resetPractice();
    setSetupModalOpen(false);
  }, [resetPractice, setAiEnabled, setSetupModalOpen]);

  const handleStartAiFromSetup = useCallback(() => {
    setAiEnabled(true);
    resetPractice();
    setSetupModalOpen(false);
  }, [resetPractice, setAiEnabled, setSetupModalOpen]);

  const startMatchmaking = useCallback(async () => {
    if (!user) return;
    setMatchError('');
    setMatchStatus('searching');
    const gamesRef = collection(db, GAMES_COLLECTION);
    try {
      const waitingQuery = query(
        gamesRef,
        where('status', '==', 'waiting'),
        where('rule', '==', RULE_ID),
        limit(20)
      );
      const waitingSnapshot = await getDocs(waitingQuery);
      let bestDoc = null;
      let bestDiff = Number.POSITIVE_INFINITY;
      waitingSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.whiteId === user.uid) return;
        if ((data.variantKey || 'base') !== variantRulesKey(setupVariantRules)) return;
        const hostRating = data.whiteRating ?? 1200;
        const diff = Math.abs(hostRating - rating);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestDoc = docSnap;
        }
      });
      if (bestDoc) {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(bestDoc.ref);
          if (!snap.exists()) return;
          const data = snap.data();
          if (data.status !== 'waiting') return;
          tx.update(bestDoc.ref, {
            blackId: user.uid,
            blackName: displayName,
            blackRating: rating,
            blackReady: false,
            status: 'waiting',
            updatedAt: serverTimestamp()
          });
        });
        setGameId(bestDoc.id);
        setMatchStatus('waiting');
        return;
      }
      const variantRules = normalizeVariantRules(setupVariantRules);
      const newGame = new KnightJumpChess(undefined, variantRules);
      const docRef = await addDoc(gamesRef, {
        rule: RULE_ID,
        variantRules,
        variantKey: variantRulesKey(variantRules),
        status: 'waiting',
        whiteId: user.uid,
        whiteName: displayName,
        whiteRating: rating,
        whiteReady: false,
        blackReady: false,
        blackId: null,
        blackName: null,
        blackRating: null,
        fen: newGame.fen(),
        moveHistory: [],
        moveSeq: 0,
        timeControl: selectedTimeControl,
        whiteTimeLeft: selectedTimeControl,
        blackTimeLeft: selectedTimeControl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setGameId(docRef.id);
      setMatchStatus('waiting');
    } catch (error) {
      setMatchError(error.message || 'Matchmaking failed');
      setMatchStatus('idle');
    }
  }, [db, displayName, rating, selectedTimeControl, setGameId, setMatchError, setMatchStatus, setupVariantRules, user]);

  const createCustomGame = useCallback(async () => {
    if (!user) return;
    setMatchError('');
    try {
      const variantRules = normalizeVariantRules(setupVariantRules);
      const newGame = new KnightJumpChess(undefined, variantRules);
      const docRef = await addDoc(collection(db, GAMES_COLLECTION), {
        rule: RULE_ID,
        variantRules,
        variantKey: variantRulesKey(variantRules),
        status: 'waiting',
        whiteId: user.uid,
        whiteName: displayName,
        whiteRating: rating,
        whiteReady: false,
        blackReady: false,
        blackId: null,
        blackName: null,
        blackRating: null,
        fen: newGame.fen(),
        moveHistory: [],
        moveSeq: 0,
        timeControl: selectedTimeControl,
        whiteTimeLeft: selectedTimeControl,
        blackTimeLeft: selectedTimeControl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setGameId(docRef.id);
      setMatchStatus('waiting');
    } catch (error) {
      setMatchError(error.message || 'Failed to create game');
    }
  }, [db, displayName, rating, selectedTimeControl, setGameId, setMatchError, setMatchStatus, setupVariantRules, user]);

  const joinCustomGame = useCallback(async (targetId) => {
    if (!user) return;
    const trimmed = targetId?.trim();
    if (!trimmed) return;
    setMatchError('');
    try {
      const gameRefDoc = doc(db, GAMES_COLLECTION, trimmed);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRefDoc);
        if (!snap.exists()) throw new Error('Game not found');
        const data = snap.data();
        if (data.status !== 'waiting') throw new Error('Game is not waiting');
        if (data.rule !== RULE_ID) throw new Error('Rule mismatch');
        if (data.whiteId === user.uid) throw new Error('Cannot join your own game');
        tx.update(gameRefDoc, {
          blackId: user.uid,
          blackName: displayName,
          blackRating: rating,
          blackReady: false,
          status: 'waiting',
          updatedAt: serverTimestamp()
        });
      });
      setGameId(trimmed);
      setMatchStatus('waiting');
    } catch (error) {
      setMatchError(error.message || 'Failed to join game');
    }
  }, [db, displayName, rating, setGameId, setMatchError, setMatchStatus, user]);

  const toggleReady = useCallback(async () => {
    if (!user || !gameId || !gameData || !playerColor) return;
    setMatchError('');
    try {
      const gameRefDoc = doc(db, GAMES_COLLECTION, gameId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRefDoc);
        if (!snap.exists()) throw new Error('Game not found');
        const data = snap.data();
        if (data.status !== 'waiting') throw new Error('Game already started');
        const currentReady = playerColor === 'w' ? Boolean(data.whiteReady) : Boolean(data.blackReady);
        const nextReady = !currentReady;
        const update = playerColor === 'w' ? { whiteReady: nextReady } : { blackReady: nextReady };
        const opponentReady = playerColor === 'w' ? Boolean(data.blackReady) : Boolean(data.whiteReady);
        const bothReady = nextReady && opponentReady && data.blackId;
        tx.update(gameRefDoc, {
          ...update,
          status: bothReady ? 'active' : 'waiting',
          startedAt: bothReady ? serverTimestamp() : data.startedAt || null,
          lastMoveAt: bothReady ? serverTimestamp() : data.lastMoveAt || null,
          whiteTimeLeft: bothReady ? (data.timeControl ?? DEFAULT_TIME_CONTROL) : (data.whiteTimeLeft ?? null),
          blackTimeLeft: bothReady ? (data.timeControl ?? DEFAULT_TIME_CONTROL) : (data.blackTimeLeft ?? null),
          updatedAt: serverTimestamp()
        });
      });
    } catch (error) {
      setMatchError(error.message || 'Failed to update ready status');
    }
  }, [db, gameData, gameId, playerColor, setMatchError, user]);

  const handleTimeout = useCallback(async (losingColor) => {
    if (!gameId || !db || !gameData) return;
    const gameRefDoc = doc(db, GAMES_COLLECTION, gameId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRefDoc);
        if (!snap.exists() || snap.data().status !== 'active') return;
        const data = snap.data();
        const winnerColor = losingColor === 'w' ? 'b' : 'w';
        const whiteScore = winnerColor === 'w' ? 1 : 0;
        const blackScore = 1 - whiteScore;
        let whiteRatingAfter = data.whiteRating ?? 1200;
        let blackRatingAfter = data.blackRating ?? 1200;
        if (data.whiteId && data.blackId) {
          whiteRatingAfter = calculateElo(data.whiteRating ?? 1200, data.blackRating ?? 1200, whiteScore);
          blackRatingAfter = calculateElo(data.blackRating ?? 1200, data.whiteRating ?? 1200, blackScore);
          tx.set(doc(db, 'users', data.whiteId), {
            rating: whiteRatingAfter,
            wins: increment(whiteScore === 1 ? 1 : 0),
            losses: increment(whiteScore === 0 ? 1 : 0),
            draws: increment(0),
            updatedAt: serverTimestamp()
          }, { merge: true });
          tx.set(doc(db, 'users', data.blackId), {
            rating: blackRatingAfter,
            wins: increment(blackScore === 1 ? 1 : 0),
            losses: increment(blackScore === 0 ? 1 : 0),
            draws: increment(0),
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
        tx.update(gameRefDoc, {
          status: 'completed',
          winner: winnerColor,
          result: `${winnerColor === 'w' ? 'White' : 'Black'} wins on time`,
          whiteRatingAfter,
          blackRatingAfter,
          updatedAt: serverTimestamp()
        });
      });
    } catch (err) {
      console.error('Timeout error:', err);
    }
  }, [db, gameData, gameId]);

  const handleChallengeFriend = useCallback(async (friendUid, friendName) => {
    if (!user || !firebaseEnabled || !db) return;
    setMatchError('');
    try {
      const variantRules = normalizeVariantRules(setupVariantRules);
      const newGame = new KnightJumpChess(undefined, variantRules);
      const gameRefDoc = await addDoc(collection(db, GAMES_COLLECTION), {
        rule: RULE_ID,
        variantRules,
        variantKey: variantRulesKey(variantRules),
        status: 'waiting',
        whiteId: user.uid,
        whiteName: displayName,
        whiteRating: rating,
        whiteReady: false,
        blackReady: false,
        blackId: null,
        blackName: null,
        blackRating: null,
        fen: newGame.fen(),
        moveHistory: [],
        moveSeq: 0,
        timeControl: selectedTimeControl,
        whiteTimeLeft: selectedTimeControl,
        blackTimeLeft: selectedTimeControl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await addDoc(collection(db, 'game_challenges'), {
        from: user.uid,
        fromName: displayName,
        to: friendUid,
        toName: friendName,
        gameId: gameRefDoc.id,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setGameId(gameRefDoc.id);
      setMatchStatus('waiting');
      setActiveTab('play');
    } catch (error) {
      setMatchError(error.message || 'Failed to send challenge');
    }
  }, [db, displayName, firebaseEnabled, rating, selectedTimeControl, setActiveTab, setGameId, setMatchError, setMatchStatus, setupVariantRules, user]);

  const acceptChallenge = useCallback(async () => {
    if (!incomingChallenge || !user || !db) return;
    try {
      await joinCustomGame(incomingChallenge.gameId);
      await updateDoc(doc(db, 'game_challenges', incomingChallenge.id), { status: 'accepted' });
      localStorage.removeItem(BOT_CHALLENGE_PENDING_KEY);
    } catch (error) {
      setMatchError(error.message || 'Failed to accept challenge');
    }
  }, [db, incomingChallenge, joinCustomGame, setMatchError, user]);

  const declineChallenge = useCallback(async () => {
    if (!incomingChallenge || !db) return;
    await deleteDoc(doc(db, 'game_challenges', incomingChallenge.id));
    localStorage.removeItem(BOT_CHALLENGE_PENDING_KEY);
  }, [db, incomingChallenge]);

  const cancelMatchmaking = useCallback(async () => {
    if (!gameId || !gameData) return;
    try {
      if (gameData.status === 'waiting' && gameData.whiteId === user?.uid && !gameData.blackId) {
        await deleteDoc(doc(db, GAMES_COLLECTION, gameId));
      } else {
        await updateDoc(doc(db, GAMES_COLLECTION, gameId), {
          status: 'abandoned',
          result: 'Match cancelled',
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      setMatchError(error.message || 'Failed to cancel match');
    } finally {
      setGameId(null);
      setGameData(null);
      setMatchStatus('idle');
    }
  }, [db, gameData, gameId, setGameData, setGameId, setMatchError, setMatchStatus, user?.uid]);

  const leaveMatch = useCallback(async () => {
    if (!gameId || !gameData) return;
    try {
      if (['completed', 'draw', 'abandoned'].includes(gameData.status)) {
        return;
      }

      if (gameData.status === 'active') {
        const gameRefDoc = doc(db, GAMES_COLLECTION, gameId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(gameRefDoc);
          if (!snap.exists()) return;
          const data = snap.data();
          if (data.status !== 'active') return;

          const winnerColor = playerColor === 'w' ? 'b' : 'w';
          let whiteRatingAfter = data.whiteRating ?? 1200;
          let blackRatingAfter = data.blackRating ?? 1200;

          if (data.whiteId && data.blackId) {
            const whiteScore = winnerColor === 'w' ? 1 : 0;
            const blackScore = winnerColor === 'b' ? 1 : 0;

            whiteRatingAfter = calculateElo(data.whiteRating ?? 1200, data.blackRating ?? 1200, whiteScore);
            blackRatingAfter = calculateElo(data.blackRating ?? 1200, data.whiteRating ?? 1200, blackScore);

            tx.set(doc(db, 'users', data.whiteId), {
              rating: whiteRatingAfter,
              wins: increment(whiteScore === 1 ? 1 : 0),
              losses: increment(whiteScore === 0 ? 1 : 0),
              draws: increment(0),
              updatedAt: serverTimestamp()
            }, { merge: true });

            tx.set(doc(db, 'users', data.blackId), {
              rating: blackRatingAfter,
              wins: increment(blackScore === 1 ? 1 : 0),
              losses: increment(blackScore === 0 ? 1 : 0),
              draws: increment(0),
              updatedAt: serverTimestamp()
            }, { merge: true });
          }

          tx.update(gameRefDoc, {
            status: 'abandoned',
            winner: winnerColor,
            result: `${winnerColor === 'w' ? 'White' : 'Black'} wins by forfeit`,
            whiteRatingAfter,
            blackRatingAfter,
            updatedAt: serverTimestamp()
          });
        });
      } else {
        await updateDoc(doc(db, GAMES_COLLECTION, gameId), {
          status: 'abandoned',
          result: 'Match cancelled',
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      setMatchError(error.message || 'Failed to leave match');
    } finally {
      setGameId(null);
      setGameData(null);
      setMatchStatus('idle');
    }
  }, [db, gameData, gameId, playerColor, setGameData, setGameId, setMatchError, setMatchStatus]);

  const handleSelectTimeControl = useCallback(async (seconds) => {
    setSelectedTimeControl(seconds);
    if (gameId && db) {
      await updateDoc(doc(db, GAMES_COLLECTION, gameId), {
        timeControl: seconds,
        whiteTimeLeft: seconds,
        blackTimeLeft: seconds,
      });
    }
  }, [db, gameId, setSelectedTimeControl]);

  const handleStartOnlineFromSetup = useCallback(async () => {
    if (!user) {
      setSetupModalOpen(false);
      return 'signin';
    }
    if (isOnline) {
      setSetupModalOpen(false);
      return 'online';
    }
    setAiEnabled(false);
    resetPractice();
    setSetupModalOpen(false);
    await startMatchmaking();
    return 'game';
  }, [isOnline, resetPractice, setAiEnabled, setSetupModalOpen, startMatchmaking, user]);

  const handleLocalMove = useCallback(async (moveObj) => {
    const gameCopy = new KnightJumpChess(game.fen(), game.getVariantRules());
    playMoveAnimation(game, moveObj, 'self');
    gameCopy.move(moveObj);
    setGame(gameCopy);
    const newHistory = [...moveHistory, moveObj.san];
    setMoveHistory(newHistory);
    setLastMove({ from: moveObj.from, to: moveObj.to });

    const moveEndTime = Date.now();
    const moveTime = (moveEndTime - currentMoveStartTime) / 1000;
    const currentTurn = game.turn();

    const newTimestamps = [...moveTimestamps];
    const lastTimestamp = newTimestamps[newTimestamps.length - 1];
    if (currentTurn === 'w') {
      lastTimestamp.white += moveTime;
    } else {
      lastTimestamp.black += moveTime;
    }
    setMoveTimestamps(newTimestamps);
    setCurrentMoveStartTime(moveEndTime);

    if (aiEnabled && !isOnline) {
      requestAiMove(gameCopy.fen(), newHistory, newTimestamps);
    }
  }, [
    aiEnabled,
    currentMoveStartTime,
    game,
    isOnline,
    moveHistory,
    moveTimestamps,
    playMoveAnimation,
    requestAiMove,
    setCurrentMoveStartTime,
    setGame,
    setLastMove,
    setMoveHistory,
    setMoveTimestamps,
  ]);

  const performOnlineMove = useCallback(async (moveObj) => {
    if (!gameId || !gameData || !user) return;
    const expectedMoveSeq = gameData.moveSeq || 0;
    setMovePending(true);
    setMatchError('');
    setConnectionState((current) => (current === 'offline' ? current : 'connecting'));
    try {
      if (moveApiEnabled) {
        try {
          let idToken = null;
          try {
            idToken = await user.getIdToken?.();
          } catch {
            idToken = null;
          }
          const apiResult = await submitAuthoritativeMove({
            gameId,
            from: moveObj.from,
            to: moveObj.to,
            promotion: moveObj.promotion || null,
            expectedMoveSeq,
            idToken,
            idempotencyKey: `${gameId}:${expectedMoveSeq}:${moveObj.from}:${moveObj.to}:${moveObj.promotion || ''}`,
          });
          if (apiResult?.ok) {
            return;
          }
        } catch (apiError) {
          if (moveApiStrict || !['NOT_CONFIGURED', 'SERVICE_UNAVAILABLE'].includes(apiError?.code)) {
            throw apiError;
          }
        }
      }

      const gameRefDoc = doc(db, GAMES_COLLECTION, gameId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRefDoc);
        if (!snap.exists()) throw new Error('Game not found');

        const data = snap.data();
        if (data.status !== 'active') throw new Error('Game is not active');
        const currentMoveSeq = data.moveSeq || 0;
        if (currentMoveSeq !== expectedMoveSeq) {
          throw new Error('RESYNC_REQUIRED');
        }

        const currentPlayerColor =
          data.whiteId === user.uid ? 'w' : data.blackId === user.uid ? 'b' : null;
        if (!currentPlayerColor) throw new Error('You are not part of this game');

        const gameCopy = new KnightJumpChess(data.fen, data.variantRules);
        if (gameCopy.turn() !== currentPlayerColor) throw new Error('Not your turn');

        const moveResult = gameCopy.move({
          from: moveObj.from,
          to: moveObj.to,
          promotion: moveObj.promotion || 'q'
        });
        if (!moveResult) throw new Error('Illegal move');
        playMoveAnimation(new KnightJumpChess(data.fen, data.variantRules), moveResult, 'self');

        const newHistory = [
          ...(data.moveHistory || []),
          moveResult.san || moveObj.san || `${moveObj.from}-${moveObj.to}`
        ];

        let newWhiteTimeLeft = data.whiteTimeLeft ?? null;
        let newBlackTimeLeft = data.blackTimeLeft ?? null;
        if (data.timeControl && data.lastMoveAt) {
          const elapsed = Math.max(0, (Date.now() - data.lastMoveAt.toMillis()) / 1000);
          if (currentPlayerColor === 'w') newWhiteTimeLeft = Math.max(0, (data.whiteTimeLeft ?? data.timeControl) - elapsed);
          else newBlackTimeLeft = Math.max(0, (data.blackTimeLeft ?? data.timeControl) - elapsed);
        }

        let nextStatus = 'active';
        let result = null;
        let winner = null;

        if (newWhiteTimeLeft !== null && newWhiteTimeLeft <= 0) {
          nextStatus = 'completed'; winner = 'b'; result = 'Black wins on time';
        } else if (newBlackTimeLeft !== null && newBlackTimeLeft <= 0) {
          nextStatus = 'completed'; winner = 'w'; result = 'White wins on time';
        }

        const currentFen = gameCopy.fen().split(' ')[0];
        const hasWhiteKing = currentFen.includes('K');
        const hasBlackKing = currentFen.includes('k');

        if (!hasWhiteKing) {
          nextStatus = 'completed';
          winner = 'b';
          result = 'Black wins by king capture';
        } else if (!hasBlackKing) {
          nextStatus = 'completed';
          winner = 'w';
          result = 'White wins by king capture';
        } else if (gameCopy.isCheckmateRider()) {
          nextStatus = 'completed';
          winner = gameCopy.turn() === 'w' ? 'b' : 'w';
          result = `${winner === 'w' ? 'White' : 'Black'} wins by checkmate`;
        } else if (gameCopy.isStalemateRider() || gameCopy.isDraw()) {
          nextStatus = 'draw';
          result = 'Draw';
        }

        let whiteRatingAfter = data.whiteRating ?? 1200;
        let blackRatingAfter = data.blackRating ?? 1200;

        if ((nextStatus === 'completed' || nextStatus === 'draw') && data.whiteId && data.blackId) {
          const whiteScore = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
          const blackScore = winner === 'b' ? 1 : winner === 'w' ? 0 : 0.5;

          whiteRatingAfter = calculateElo(data.whiteRating ?? 1200, data.blackRating ?? 1200, whiteScore);
          blackRatingAfter = calculateElo(data.blackRating ?? 1200, data.whiteRating ?? 1200, blackScore);

          tx.set(doc(db, 'users', data.whiteId), {
            uid: data.whiteId,
            displayName: data.whiteName || 'White',
            rating: whiteRatingAfter,
            wins: increment(whiteScore === 1 ? 1 : 0),
            losses: increment(whiteScore === 0 ? 1 : 0),
            draws: increment(whiteScore === 0.5 ? 1 : 0),
            updatedAt: serverTimestamp()
          }, { merge: true });
          tx.set(doc(db, 'users', data.blackId), {
            uid: data.blackId,
            displayName: data.blackName || 'Black',
            rating: blackRatingAfter,
            wins: increment(blackScore === 1 ? 1 : 0),
            losses: increment(blackScore === 0 ? 1 : 0),
            draws: increment(blackScore === 0.5 ? 1 : 0),
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        tx.update(gameRefDoc, {
          fen: gameCopy.fen(),
          moveHistory: newHistory,
          lastMove: {
            from: moveObj.from,
            to: moveObj.to,
            san: moveResult.san || null,
            by: user.uid,
            seq: currentMoveSeq + 1
          },
          moveSeq: currentMoveSeq + 1,
          status: nextStatus,
          result,
          winner,
          whiteRatingAfter: nextStatus === 'active' ? null : whiteRatingAfter,
          blackRatingAfter: nextStatus === 'active' ? null : blackRatingAfter,
          whiteTimeLeft: newWhiteTimeLeft,
          blackTimeLeft: newBlackTimeLeft,
          lastMoveAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
    } catch (error) {
      queuedOnlineMovesRef.current = [];
      if (error?.message === 'RESYNC_REQUIRED' || error?.code === 'RESYNC_REQUIRED') {
        setConnectionState('reconnecting');
        pushToast('Board was out of date. Resyncing latest position...', 'error');
        setMatchError('Board changed on another client. Resyncing...');
      } else if (error?.code === 'STALE_MOVE_SEQ') {
        setConnectionState('reconnecting');
        setMatchError('Position changed before your move landed. Resyncing...');
      } else if (error?.code === 'SERVICE_UNAVAILABLE') {
        setMatchError('Move service unavailable. Falling back to direct sync.');
      } else {
        setMatchError(error.message || 'Failed to make move');
      }
    } finally {
      setMovePending(false);
    }
  }, [
    db,
    gameData,
    gameId,
    playMoveAnimation,
    pushToast,
    setConnectionState,
    setMatchError,
    setMovePending,
    user,
  ]);

  const drainOnlineMoveQueue = useCallback(async function drainOnlineMoveQueue() {
    if (drainingOnlineMovesRef.current) return;
    const nextMove = queuedOnlineMovesRef.current.shift();
    if (!nextMove) return;

    drainingOnlineMovesRef.current = true;
    try {
      await performOnlineMove(nextMove);
    } finally {
      drainingOnlineMovesRef.current = false;
      if (queuedOnlineMovesRef.current.length > 0) {
        void drainOnlineMoveQueue();
      }
    }
  }, [performOnlineMove]);

  const handleOnlineMove = useCallback((moveObj) => {
    if (!gameId || !gameData || !user) return;
    queuedOnlineMovesRef.current.push(moveObj);
    if (!drainingOnlineMovesRef.current) {
      void drainOnlineMoveQueue();
    }
  }, [drainOnlineMoveQueue, gameData, gameId, user]);

  const handlePromotionChoice = useCallback((promotion) => {
    if (!pendingPromotion) return;
    const moveObj = pendingPromotion.moves.find((move) => move.promotion === promotion) || pendingPromotion.moves[0];
    if (!moveObj) {
      setPendingPromotion(null);
      return;
    }

    if (isOnline && gameId) {
      handleOnlineMove(moveObj);
    } else {
      handleLocalMove(moveObj);
    }

    setSelectedSquare(null);
    setLegalMoves([]);
    setPendingPromotion(null);
  }, [gameId, handleLocalMove, handleOnlineMove, isOnline, pendingPromotion, setLegalMoves, setPendingPromotion, setSelectedSquare]);

  const handleSquareClick = useCallback((square) => {
    if (pendingPromotion) return;
    if (isOnline && playerColor !== game.turn()) return;
    if (aiEnabled && !isOnline && game.turn() === 'b') return;

    if (selectedSquare === null) {
      const piecesOnSquare = game.get(square);
      if (piecesOnSquare && piecesOnSquare.color === game.turn()) {
        const moves = game.moves({ square, verbose: true }).map((m) => m.to);
        if (moves.length > 0) {
          setSelectedSquare(square);
          setLegalMoves(moves);
        }
      }
      return;
    }

    if (selectedSquare === square) {
      if (game.getVariantRules().touchPiece) return;
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    if (legalMoves.includes(square)) {
      const candidateMoves = game.moves({ square: selectedSquare, verbose: true }).filter((m) => m.to === square);
      const promotionMoves = candidateMoves.filter((m) => m.promotion);
      if (promotionMoves.length > 1) {
        setPendingPromotion({
          from: selectedSquare,
          to: square,
          color: promotionMoves[0].color,
          moves: promotionMoves,
        });
        return;
      }

      const moveObj = candidateMoves[0];
      if (!moveObj) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      if (isOnline && gameId) {
        handleOnlineMove(moveObj);
      } else {
        handleLocalMove(moveObj);
      }

      setSelectedSquare(null);
      setLegalMoves([]);
      setPendingPromotion(null);
    } else {
      if (game.getVariantRules().touchPiece) return;
      const piecesOnSquare = game.get(square);
      if (piecesOnSquare && piecesOnSquare.color === game.turn()) {
        const moves = game.moves({ square, verbose: true }).map((m) => m.to);
        if (moves.length > 0) {
          setSelectedSquare(square);
          setLegalMoves(moves);
        }
      } else {
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    }
  }, [
    aiEnabled,
    game,
    gameId,
    handleLocalMove,
    handleOnlineMove,
    isOnline,
    legalMoves,
    pendingPromotion,
    playerColor,
    selectedSquare,
    setLegalMoves,
    setPendingPromotion,
    setSelectedSquare,
  ]);

  return {
    resetPractice,
    closeSetupModal,
    handleStartPracticeFromSetup,
    handleStartAiFromSetup,
    handleStartOnlineFromSetup,
    handleSquareClick,
    handlePromotionChoice,
    startMatchmaking,
    createCustomGame,
    joinCustomGame,
    toggleReady,
    handleTimeout,
    handleChallengeFriend,
    acceptChallenge,
    declineChallenge,
    cancelMatchmaking,
    leaveMatch,
    handleSelectTimeControl,
    calculateElo,
  };
}
