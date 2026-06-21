import { useEffect, useRef } from 'react';
import KnightJumpChess from '../KnightJumpChess.js';

const PRACTICE_STATE_KEY = 'cr_practice_state';

export function usePracticeState({
  gameId,
  game,
  setGame,
  setMoveHistory,
  setLastMove,
  setSelectedTimeControl,
  setAiEnabled,
  setAiDifficulty,
  setMoveTimestamps,
  setLocalResult,
  aiDifficultyLevels,
  practiceState,
}) {
  const hasHydratedPracticeRef = useRef(false);

  useEffect(() => {
    if (hasHydratedPracticeRef.current) return;
    hasHydratedPracticeRef.current = true;
    if (gameId) return;
    const raw = localStorage.getItem(PRACTICE_STATE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved?.fen) setGame(new KnightJumpChess(saved.fen, saved.variantRules));
      if (Array.isArray(saved?.moveHistory)) setMoveHistory(saved.moveHistory);
      if (saved?.lastMove?.from && saved?.lastMove?.to) setLastMove(saved.lastMove);
      if (Number.isFinite(saved?.selectedTimeControl)) setSelectedTimeControl(saved.selectedTimeControl);
      if (typeof saved?.aiEnabled === 'boolean') setAiEnabled(saved.aiEnabled);
      if (typeof saved?.aiDifficulty === 'string' && aiDifficultyLevels.includes(saved.aiDifficulty)) {
        setAiDifficulty(saved.aiDifficulty);
      }
      if (Array.isArray(saved?.moveTimestamps) && saved.moveTimestamps.length > 0) {
        setMoveTimestamps(saved.moveTimestamps);
      }
      if (saved?.localResult) setLocalResult(saved.localResult);
    } catch {
      localStorage.removeItem(PRACTICE_STATE_KEY);
    }
  }, [
    aiDifficultyLevels,
    gameId,
    setAiDifficulty,
    setAiEnabled,
    setGame,
    setLastMove,
    setLocalResult,
    setMoveHistory,
    setMoveTimestamps,
    setSelectedTimeControl,
  ]);

  useEffect(() => {
    if (gameId) {
      localStorage.removeItem(PRACTICE_STATE_KEY);
      return;
    }
    const payload = {
      fen: game.fen(),
      ...practiceState,
    };
    localStorage.setItem(PRACTICE_STATE_KEY, JSON.stringify(payload));
  }, [game, gameId, practiceState]);
}
