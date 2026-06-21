import { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  limit
} from 'firebase/firestore';
import KnightJumpChess from '../KnightJumpChess.js';

const GAMES_COLLECTION = 'games';
const RULE_ID = 'chessrider';

export function useOnlineGameState({
  authReady,
  user,
  firebaseEnabled,
  db,
  gameId,
  setGameId,
  setGame,
  setMoveHistory,
  setLastMove,
  setSelectedSquare,
  setLegalMoves,
  playMoveAnimation,
  gameRef,
  lastAnimatedMoveRef,
  hasLoadedOnlineGameRef,
}) {
  const [gameData, setGameData] = useState(null);
  const [matchStatus, setMatchStatus] = useState('idle');
  const [matchError, setMatchError] = useState('');
  const [connectionState, setConnectionState] = useState('offline');
  const [waitingGames, setWaitingGames] = useState([]);
  const [unreadDmCount, setUnreadDmCount] = useState(0);
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const lastSnapshotAtRef = useRef(0);

  useEffect(() => {
    if (authReady && !user) {
      setGameId(null);
      setGameData(null);
      setMatchStatus('idle');
      setMatchError('');
      setWaitingGames([]);
      setUnreadDmCount(0);
      setIncomingChallenge(null);
    }
  }, [authReady, setGameId, setMatchStatus, user]);

  useEffect(() => {
    if (!gameId) {
      setConnectionState('offline');
      return undefined;
    }
    setConnectionState('connecting');
    const updateStateFromNetwork = () => {
      if (!navigator.onLine) {
        setConnectionState('offline');
        return;
      }
      const sinceSnapshot = Date.now() - (lastSnapshotAtRef.current || 0);
      if (lastSnapshotAtRef.current === 0 || sinceSnapshot > 9000) {
        setConnectionState('reconnecting');
      } else {
        setConnectionState('live');
      }
    };
    const onlineHandler = () => updateStateFromNetwork();
    const offlineHandler = () => setConnectionState('offline');
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    const timer = setInterval(updateStateFromNetwork, 2000);
    updateStateFromNetwork();
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
      clearInterval(timer);
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !db || !firebaseEnabled) return undefined;
    hasLoadedOnlineGameRef.current = false;
    const gameDocRef = doc(db, GAMES_COLLECTION, gameId);
    const unsub = onSnapshot(
      gameDocRef,
      (snap) => {
        lastSnapshotAtRef.current = Date.now();
        setConnectionState('live');
        if (!snap.exists()) {
          setGameId(null);
          setGameData(null);
          setMatchStatus('idle');
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setGameData(data);
        if (data.fen) {
          if (hasLoadedOnlineGameRef.current && data.lastMove) {
            const snapshotMoveKey = `${data.lastMove.from}-${data.lastMove.to}-${data.lastMove.san || ''}`;
            if (snapshotMoveKey !== lastAnimatedMoveRef.current) {
              const actor =
                data.lastMove.by === user?.uid ? 'self' :
                data.lastMove.by?.startsWith?.('bot_') ? 'ai' : 'opponent';
              playMoveAnimation(gameRef.current, data.lastMove, actor);
            }
          }
          setGame(new KnightJumpChess(data.fen, data.variantRules));
          hasLoadedOnlineGameRef.current = true;
        }
        if (data.lastMove) {
          setLastMove({ from: data.lastMove.from, to: data.lastMove.to });
        }
        setMoveHistory(data.moveHistory || []);
        setSelectedSquare(null);
        setLegalMoves([]);
        setMatchStatus(data.status || 'active');
      },
      (error) => {
        console.warn('Online game snapshot failed:', error?.message || error);
        setConnectionState('offline');
      }
    );
    return () => unsub();
  }, [
    db,
    firebaseEnabled,
    gameId,
    gameRef,
    hasLoadedOnlineGameRef,
    lastAnimatedMoveRef,
    playMoveAnimation,
    setGame,
    setGameId,
    setLastMove,
    setLegalMoves,
    setMatchStatus,
    setMoveHistory,
    setSelectedSquare,
    user?.uid,
  ]);

  useEffect(() => {
    if (!user || !firebaseEnabled || !db) { setUnreadDmCount(0); return undefined; }
    const q = query(collection(db, 'dms'), where('participants', 'array-contains', user.uid));
    return onSnapshot(
      q,
      (snap) => {
        let count = 0;
        snap.docs.forEach((d) => {
          const data = d.data();
          const lastMsg = data.lastMessageAt;
          const lastRead = data[`lastReadAt_${user.uid}`];
          if (lastMsg && (!lastRead || lastMsg.toMillis() > lastRead.toMillis())) count++;
        });
        setUnreadDmCount(count);
      },
      (error) => {
        console.warn('Unread DM snapshot failed:', error?.message || error);
        setUnreadDmCount(0);
      }
    );
  }, [db, firebaseEnabled, user]);

  useEffect(() => {
    if (!user || !firebaseEnabled || !db) return undefined;
    const q = query(
      collection(db, 'game_challenges'),
      where('to', '==', user.uid),
      where('status', '==', 'pending')
    );
    return onSnapshot(
      q,
      (snap) => {
        setIncomingChallenge(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      },
      (error) => {
        console.warn('Incoming challenge snapshot failed:', error?.message || error);
        setIncomingChallenge(null);
      }
    );
  }, [db, firebaseEnabled, user]);

  useEffect(() => {
    if (!user || !gameId || !db) {
      setWaitingGames([]);
      return undefined;
    }
    const gamesRef = collection(db, GAMES_COLLECTION);
    const waitingQuery = query(
      gamesRef,
      where('status', '==', 'waiting'),
      where('rule', '==', RULE_ID),
      limit(20)
    );
    const unsub = onSnapshot(
      waitingQuery,
      (snapshot) => {
        const games = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            host: docSnap.data().whiteName || 'Anonymous',
            createdAt: docSnap.data().createdAt?.toDate?.() || null,
          }))
          .filter((g) => g.id !== gameId)
          .sort((a, b) => (b.createdAt - a.createdAt));
        setWaitingGames(games);
      },
      (error) => {
        console.warn('Waiting games snapshot failed:', error?.message || error);
        setWaitingGames([]);
      }
    );
    return () => unsub();
  }, [db, gameId, user]);

  return {
    gameData,
    matchStatus,
    setMatchStatus,
    matchError,
    setMatchError,
    connectionState,
    setConnectionState,
    waitingGames,
    unreadDmCount,
    incomingChallenge,
    setIncomingChallenge,
    setGameData,
  };
}
