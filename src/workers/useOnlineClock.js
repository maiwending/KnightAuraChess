import { useEffect, useState, useRef } from 'react';

/**
 * Custom hook to handle real-time synchronization of chess clocks 
 * based on Firestore game data.
 */
export function useOnlineClock(gameData, playerColor, onTimeout) {
  const [clockWhite, setClockWhite] = useState(null);
  const [clockBlack, setClockBlack] = useState(null);
  const timeoutFiredRef = useRef(false);

  useEffect(() => {
    if (!gameData || gameData.status !== 'active' || !gameData.timeControl) {
      setClockWhite(null);
      setClockBlack(null);
      return undefined;
    }

    const lastMoveMs = gameData.lastMoveAt?.toMillis?.() ?? Date.now();
    timeoutFiredRef.current = false;
    const turn = gameData.fen?.split(' ')?.[1] ?? 'w';

    const tick = () => {
      const elapsed = Math.max(0, (Date.now() - lastMoveMs) / 1000);
      const wt = turn === 'w'
        ? Math.max(0, (gameData.whiteTimeLeft ?? gameData.timeControl) - elapsed)
        : (gameData.whiteTimeLeft ?? gameData.timeControl);
      const bt = turn === 'b'
        ? Math.max(0, (gameData.blackTimeLeft ?? gameData.timeControl) - elapsed)
        : (gameData.blackTimeLeft ?? gameData.timeControl);

      setClockWhite(wt);
      setClockBlack(bt);

      if (!timeoutFiredRef.current && playerColor === turn) {
        if (turn === 'w' && wt <= 0) { timeoutFiredRef.current = true; onTimeout('w'); }
        if (turn === 'b' && bt <= 0) { timeoutFiredRef.current = true; onTimeout('b'); }
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gameData, playerColor, onTimeout]);

  return { clockWhite, clockBlack };
}
