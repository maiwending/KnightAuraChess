import { useCallback, useEffect, useRef, useState } from 'react';
import AiWorker from '../workers/aiWorker.js?worker';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import KnightJumpChess from '../KnightJumpChess.js';
import { normalizeVariantRules, variantRulesKey } from '../utils/variantRules.js';

const GAMES_COLLECTION = 'games';
const BOT_CHALLENGE_COOLDOWN_MS = 15 * 60 * 1000;
const BOT_CHALLENGE_PENDING_KEY = 'cr_bot_challenge_pending';
const BOT_CHALLENGE_LAST_KEY = 'cr_bot_challenge_last';

export function useAiBotEngine({
  user,
  db,
  gameId,
  isOnline,
  gameData,
  setGame,
  setMoveHistory,
  setLastMove,
  setMoveTimestamps,
  setCurrentMoveStartTime,
  localResultRef,
  playMoveAnimation,
  aiDifficulty,
  selectedTimeControl,
  botPool,
  displayName,
  incomingChallenge,
  variantRules,
}) {
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');
  const [isBotOnlineGame, setIsBotOnlineGame] = useState(false);
  const aiWorkerRef = useRef(null);
  const aiRequestIdRef = useRef(0);
  const botMovePendingRef = useRef(false);

  const cancelAiSearch = useCallback(() => {
    aiRequestIdRef.current += 1;
    setAiThinking(false);
  }, []);

  const requestAiMove = useCallback((fen, _history, _timestamps, forceDifficulty) => {
    const worker = aiWorkerRef.current;
    if (!worker) return false;

    setAiThinking(true);
    setAiError('');
    const requestId = ++aiRequestIdRef.current;
    worker.postMessage({
      type: 'search',
      fen,
      difficulty: forceDifficulty ?? aiDifficulty,
      variantRules: isOnline ? gameData?.variantRules : variantRules,
      id: requestId,
    });
    return true;
  }, [aiDifficulty, gameData?.variantRules, isOnline, variantRules]);

  const handleBotOnlineMove = useCallback(async (moveMsg) => {
    if (!gameId || !db) return;
    const gameRef = doc(db, GAMES_COLLECTION, gameId);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status !== 'active' || !data.blackId?.startsWith('bot_')) return;

        const currentMoveSeq = Number.isFinite(data.moveSeq) ? data.moveSeq : 0;
        const gameCopy = new KnightJumpChess(data.fen, data.variantRules);
        if (gameCopy.turn() !== 'b') return;

        const moveResult = gameCopy.move({
          from: moveMsg.from,
          to: moveMsg.to,
          promotion: moveMsg.promotion || 'q',
        });
        if (!moveResult) return;

        const newHistory = [...(data.moveHistory || []), moveResult.san || `${moveMsg.from}-${moveMsg.to}`];

        let newBlackTimeLeft = data.blackTimeLeft ?? null;
        if (data.timeControl && data.lastMoveAt) {
          const elapsed = Math.max(0, (Date.now() - data.lastMoveAt.toMillis()) / 1000);
          newBlackTimeLeft = Math.max(0, (data.blackTimeLeft ?? data.timeControl) - elapsed);
        }

        let nextStatus = 'active';
        let result = null;
        let winner = null;

        if (newBlackTimeLeft !== null && newBlackTimeLeft <= 0) {
          nextStatus = 'completed';
          winner = 'w';
          result = 'White wins on time';
        }

        if (nextStatus === 'active') {
          const fenBoard = gameCopy.fen().split(' ')[0];
          if (!fenBoard.includes('K')) {
            nextStatus = 'completed';
            winner = 'b';
            result = 'Black wins by king capture';
          } else if (!fenBoard.includes('k')) {
            nextStatus = 'completed';
            winner = 'w';
            result = 'White wins by king capture';
          } else if (gameCopy.isCheckmateRider()) {
            winner = gameCopy.turn() === 'w' ? 'b' : 'w';
            nextStatus = 'completed';
            result = `${winner === 'w' ? 'White' : 'Black'} wins by checkmate`;
          } else if (gameCopy.isStalemateRider() || gameCopy.isDraw()) {
            nextStatus = 'draw';
            result = 'Draw';
          }
        }

        let whiteRatingAfter = data.whiteRating ?? 1200;
        let blackRatingAfter = data.blackRating ?? 1200;
        if (nextStatus === 'completed' || nextStatus === 'draw') {
          const whiteScore = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
          const blackScore = 1 - whiteScore;
          const expected = 1 / (1 + Math.pow(10, ((data.blackRating ?? 1200) - (data.whiteRating ?? 1200)) / 400));
          whiteRatingAfter = Math.round((data.whiteRating ?? 1200) + 32 * (whiteScore - (1 - expected)));
          blackRatingAfter = Math.round((data.blackRating ?? 1200) + 32 * (blackScore - expected));
          tx.set(doc(db, 'users', data.whiteId), {
            rating: whiteRatingAfter,
            wins: whiteScore === 1 ? 1 : 0,
            losses: whiteScore === 0 ? 1 : 0,
            draws: whiteScore === 0.5 ? 1 : 0,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          tx.set(doc(db, 'users', data.blackId), {
            rating: blackRatingAfter,
            wins: blackScore === 1 ? 1 : 0,
            losses: blackScore === 0 ? 1 : 0,
            draws: blackScore === 0.5 ? 1 : 0,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }

        tx.update(gameRef, {
          fen: gameCopy.fen(),
          moveHistory: newHistory,
          lastMove: {
            from: moveMsg.from,
            to: moveMsg.to,
            san: moveResult.san || null,
            by: data.blackId,
            seq: currentMoveSeq + 1,
          },
          moveSeq: currentMoveSeq + 1,
          status: nextStatus,
          result,
          winner,
          whiteRatingAfter: nextStatus === 'active' ? null : whiteRatingAfter,
          blackRatingAfter: nextStatus === 'active' ? null : blackRatingAfter,
          blackTimeLeft: newBlackTimeLeft,
          lastMoveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      console.error('Bot move error:', error);
    }
  }, [db, gameId]);

  useEffect(() => {
    const worker = new AiWorker();
    aiWorkerRef.current = worker;

    worker.onmessage = async (e) => {
      const msg = e.data;

      if (msg.id != null && msg.id !== aiRequestIdRef.current) {
        return;
      }

      if (msg.type === 'result') {
        if (isBotOnlineGame) {
          if (botMovePendingRef.current) return;
          botMovePendingRef.current = true;
          try {
            await handleBotOnlineMove(msg);
          } finally {
            botMovePendingRef.current = false;
            setAiThinking(false);
          }
          return;
        }

        if (localResultRef.current) {
          setAiThinking(false);
          return;
        }

        setGame((prevGame) => {
          const gameCopy = new KnightJumpChess(prevGame.fen(), prevGame.getVariantRules());
          const aiMoveObj = gameCopy
            .moves({ verbose: true })
            .find((move) => move.from === msg.from && move.to === msg.to &&
              (!msg.promotion || move.promotion === msg.promotion));

          if (aiMoveObj) {
            playMoveAnimation(prevGame, aiMoveObj, 'ai');
            gameCopy.move(aiMoveObj);
          } else {
            playMoveAnimation(prevGame, msg, 'ai');
            const result = gameCopy.move({
              from: msg.from,
              to: msg.to,
              promotion: msg.promotion || 'q',
            });
            if (!result) {
              console.error('AI returned invalid move:', msg);
              setAiError(`AI returned invalid move: ${msg.from}${msg.to}`);
              setAiThinking(false);
              return prevGame;
            }
          }

          setMoveHistory((prev) => [...prev, msg.san || `${msg.from}${msg.to}`]);
          setLastMove({ from: msg.from, to: msg.to });

          const aiMoveTime = (msg.timeMs || 0) / 1000;
          setMoveTimestamps((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) last.black += aiMoveTime;
            return updated;
          });
          setCurrentMoveStartTime(Date.now());

          return new KnightJumpChess(gameCopy.fen(), gameCopy.getVariantRules());
        });
        setAiThinking(false);
      } else if (msg.type === 'error') {
        console.error('AI worker error:', msg.message);
        setAiError(msg.message);
        setAiThinking(false);
      }
    };

    worker.onerror = (err) => {
      console.error('AI worker crashed:', err);
      setAiError('AI engine crashed');
      setAiThinking(false);
    };

    return () => {
      worker.terminate();
      aiWorkerRef.current = null;
    };
  }, [
    handleBotOnlineMove,
    isBotOnlineGame,
    localResultRef,
    playMoveAnimation,
    setCurrentMoveStartTime,
    setGame,
    setLastMove,
    setMoveHistory,
    setMoveTimestamps,
  ]);

  useEffect(() => {
    setIsBotOnlineGame(Boolean(isOnline && gameData?.blackId?.startsWith('bot_')));
  }, [gameData?.blackId, isOnline]);

  const sendBotChallenge = useCallback(async (bot) => {
    if (!user || !db || !bot?.uid || gameId || incomingChallenge) return;
    const now = Date.now();
    const lastBotChallengeAt = Number.parseInt(localStorage.getItem(BOT_CHALLENGE_LAST_KEY) || '0', 10) || 0;
    if (now - lastBotChallengeAt < BOT_CHALLENGE_COOLDOWN_MS) return;

    const seedSource = gameId || user.uid || selectedBot.uid;
    const seed = seedSource.split('').reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 0);
    const selectedBot = botPool[Math.abs(seed) % botPool.length] || bot;
    const botRef = doc(db, 'users', selectedBot.uid);
    const botSnap = await getDoc(botRef);
    let botRating = selectedBot.rating ?? 1200;
    if (!botSnap.exists()) {
      await setDoc(botRef, {
        uid: selectedBot.uid,
        displayName: selectedBot.name,
        isBot: true,
        rating: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const botData = botSnap.data();
      botRating = botData.rating ?? botRating;
      if (!botData.displayName) {
        await setDoc(botRef, {
          displayName: selectedBot.name,
          uid: selectedBot.uid,
          isBot: true,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    }

    const selectedRules = normalizeVariantRules(variantRules);
    const newGame = new KnightJumpChess(undefined, selectedRules);
    const gameRef = await addDoc(collection(db, GAMES_COLLECTION), {
      rule: 'chessrider',
      variantRules: selectedRules,
      variantKey: variantRulesKey(selectedRules),
      status: 'waiting',
      whiteId: selectedBot.uid,
      whiteName: selectedBot.name,
      whiteRating: botRating,
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
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'game_challenges'), {
      from: selectedBot.uid,
      fromName: selectedBot.name,
      to: user.uid,
      toName: displayName,
      gameId: gameRef.id,
      status: 'pending',
      createdAt: serverTimestamp(),
      isBotChallenge: true,
    });
    localStorage.setItem(BOT_CHALLENGE_LAST_KEY, String(now));
    localStorage.setItem(BOT_CHALLENGE_PENDING_KEY, '1');
  }, [botPool, db, displayName, gameId, incomingChallenge, selectedTimeControl, user, variantRules]);

  useEffect(() => {
    if (!user || !db || gameId || incomingChallenge) return undefined;
    const pending = localStorage.getItem(BOT_CHALLENGE_PENDING_KEY) === '1';
    if (pending) return undefined;

    const delayMs = 30_000 + Math.floor(Math.random() * 90_000);
    const timer = window.setTimeout(() => {
      const bot = botPool[Math.floor(Math.random() * botPool.length)];
      if (!bot) return;
      sendBotChallenge(bot).catch(() => {});
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [botPool, db, gameId, incomingChallenge, sendBotChallenge, user]);

  useEffect(() => {
    if (!isBotOnlineGame || !gameData || gameData.status !== 'active') return;
    if (!gameData.blackId?.startsWith('bot_')) return;
    if (!gameData.fen) return;
    if (gameData.fen.split(' ')[1] !== 'b') return;
    if (botMovePendingRef.current) return;
    botMovePendingRef.current = true;
    if (!requestAiMove(gameData.fen, [], [], 'hard')) {
      botMovePendingRef.current = false;
    }
  }, [gameData, isBotOnlineGame, requestAiMove]);

  return {
    aiThinking,
    aiError,
    requestAiMove,
    cancelAiSearch,
    isBotOnlineGame,
  };
}
