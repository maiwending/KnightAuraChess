import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOnlineClock } from './workers/useOnlineClock.js';
import KnightJumpChess from './KnightJumpChess.js';
import AppHeader from './components/AppHeader.jsx';
import AppPageRouter from './components/AppPageRouter.jsx';
import RuntimeErrorBoundary from './components/RuntimeErrorBoundary.jsx';
import SeasonDecorations from './components/SeasonDecorations.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { useAppNavigation } from './hooks/useAppNavigation.js';
import { useGameActions } from './hooks/useGameActions.js';
import { useOnlineGameState } from './hooks/useOnlineGameState.js';
import { useAiBotEngine } from './hooks/useAiBotEngine.js';
import { BASE_THEMES, usePersistentPreferences } from './hooks/usePersistentPreferences.js';
import { usePracticeState } from './hooks/usePracticeState.js';
import { useAppToasts } from './hooks/useAppToasts.js';
import {
  BOARD_HAND_CAPTURE_TOTAL_MS,
  BOARD_HAND_TOTAL_MS,
} from './utils/boardHandAnimation.js';
import { db, firebaseEnabled } from './utils/firebase.js';
import { DEFAULT_VARIANT_RULES, normalizeVariantRules } from './utils/variantRules.js';
import './App.css';
const UserProfileModal = React.lazy(() => import('./components/UserProfileModal.jsx'));

const AI_DIFFICULTY_LEVELS = ['easy', 'medium', 'hard', 'expert'];

const BOT_POOL = [
  { uid: 'bot_alex_kim',      name: 'Alex Kim' },
  { uid: 'bot_jordan_park',   name: 'Jordan Park' },
  { uid: 'bot_morgan_chen',   name: 'Morgan Chen' },
  { uid: 'bot_casey_lee',     name: 'Casey Lee' },
  { uid: 'bot_riley_wang',    name: 'Riley Wang' },
  { uid: 'bot_taylor_singh',  name: 'Taylor Singh' },
  { uid: 'bot_avery_patel',   name: 'Avery Patel' },
  { uid: 'bot_quinn_rivera',  name: 'Quinn Rivera' },
  { uid: 'bot_sage_brooks',   name: 'Sage Brooks' },
  { uid: 'bot_drew_hayes',    name: 'Drew Hayes' },
  { uid: 'bot_blake_ross',    name: 'Blake Ross' },
  { uid: 'bot_reese_cole',    name: 'Reese Cole' },
  { uid: 'bot_skyler_grant',  name: 'Skyler Grant' },
  { uid: 'bot_cameron_webb',  name: 'Cameron Webb' },
  { uid: 'bot_dakota_bell',   name: 'Dakota Bell' },
  { uid: 'bot_hayden_shaw',   name: 'Hayden Shaw' },
  { uid: 'bot_parker_wells',  name: 'Parker Wells' },
  { uid: 'bot_emery_hunt',    name: 'Emery Hunt' },
  { uid: 'bot_finley_cruz',   name: 'Finley Cruz' },
  { uid: 'bot_rowan_reyes',   name: 'Rowan Reyes' },
];

const TIME_CONTROLS = [
  { label: '1 min',  seconds: 60 },
  { label: '3 min',  seconds: 180 },
  { label: '5 min',  seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
];
const DEFAULT_TIME_CONTROL = 300;
const VARIANT_RULES_KEY = 'cr_variant_rules';

const loadVariantRules = () => {
  try {
    return normalizeVariantRules(JSON.parse(localStorage.getItem(VARIANT_RULES_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_VARIANT_RULES };
  }
};

const createNewGame = () => new KnightJumpChess();

const buildMoveAnimationPayload = (board, moveLike, actor = 'self') => {
  if (!board || !moveLike?.from || !moveLike?.to) return null;
  const movingPiece = board.get(moveLike.from);
  const capturedPiece = board.get(moveLike.to);
  if (!movingPiece) return null;
  return {
    key: `${moveLike.from}-${moveLike.to}-${moveLike.san || ''}-${Date.now()}`,
    from: moveLike.from,
    to: moveLike.to,
    actor,
    movingPiece: { color: movingPiece.color, type: movingPiece.type },
    capturedPiece: capturedPiece ? { color: capturedPiece.color, type: capturedPiece.type } : null,
  };
};

const formatTurn = (turn) => (turn === 'w' ? 'White' : 'Black');
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
};

// mm:ss countdown display for online clocks
const formatClock = (seconds) => {
  if (seconds == null) return '--:--';
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export default function App() {
  const {
    user,
    authReady,
    profile,
    displayName,
    rating,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAnonymously,
    signOut
  } = useAuth();
  const { currentPage, navigateToPage } = useAppNavigation(user);
  const [game, setGame] = useState(() => createNewGame());
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [gameId, setGameIdRaw] = useState(() => localStorage.getItem('cr_gameId') || null);
  const setGameId = useCallback((id) => {
    if (id) localStorage.setItem('cr_gameId', id);
    else localStorage.removeItem('cr_gameId');
    setGameIdRaw(id);
  }, []);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [movePending, setMovePending] = useState(false);
  const {
    theme,
    setTheme,
    customThemes,
    showThemeCreator,
    setShowThemeCreator,
    boardView,
    setBoardView,
    board3d,
    boardCornerRadius,
    setBoardCornerRadius,
    darkMode,
    setDarkMode,
    pieceStyle,
    setPieceStyle,
    showEmpoweredMarks,
    setShowEmpoweredMarks,
    liveVoiceChat,
    setLiveVoiceChat,
    seasonalDecorations,
    setSeasonalDecorations,
    seasonalDecorationDensity,
    setSeasonalDecorationDensity,
    customThemeVars,
    saveCustomTheme,
    deleteCustomTheme,
  } = usePersistentPreferences();
  const [joinGameId, setJoinGameId] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState('play');
  const [authMode, setAuthMode] = useState('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [profileModalUid, setProfileModalUid] = useState(null);
  const [pendingDm, setPendingDm] = useState(null);
  const [moveTimestamps, setMoveTimestamps] = useState([{ white: 0, black: 0 }]);
  const [currentMoveStartTime, setCurrentMoveStartTime] = useState(Date.now());
  const [selectedTimeControl, setSelectedTimeControl] = useState(DEFAULT_TIME_CONTROL);
  const [setupVariantRules, setSetupVariantRules] = useState(loadVariantRules);
  const [clockWhite, setClockWhite] = useState(null);
  const [clockBlack, setClockBlack] = useState(null);
  const [localResult, setLocalResult] = useState(null);
  const [moveAnimation, setMoveAnimation] = useState(null);
  const localResultRef = useRef(null);
  const gameRef = useRef(game);
  const lastAnimatedMoveRef = useRef(null);
  const hasLoadedOnlineGameRef = useRef(false);
  const rawAiDifficulty = (import.meta.env.VITE_AI_DIFFICULTY || 'medium').toLowerCase();
  const envAiDifficulty = AI_DIFFICULTY_LEVELS.includes(rawAiDifficulty)
    ? rawAiDifficulty
    : 'medium';
  const [aiDifficulty, setAiDifficulty] = useState(envAiDifficulty);
  const { toasts, pushToast } = useAppToasts();
  const practiceState = useMemo(() => ({
    fen: game.fen(),
    moveHistory,
    lastMove,
    selectedTimeControl,
    aiEnabled,
    aiDifficulty,
    moveTimestamps,
    localResult,
    variantRules: game.getVariantRules(),
  }), [
    aiDifficulty,
    aiEnabled,
    game,
    lastMove,
    localResult,
    moveHistory,
    moveTimestamps,
    selectedTimeControl,
  ]);

  useEffect(() => {
    localStorage.setItem(VARIANT_RULES_KEY, JSON.stringify(setupVariantRules));
  }, [setupVariantRules]);
  usePracticeState({
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
    aiDifficultyLevels: AI_DIFFICULTY_LEVELS,
    practiceState,
  });

  const isOnline = Boolean(gameId);
  const canStartOnlineMatch = Boolean(user && firebaseEnabled && db);
  const onlineMatchHelpText = !user
    ? 'Sign in to play online.'
    : !firebaseEnabled || !db
      ? 'Online play needs Firebase to be configured.'
      : '';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qaScenario = params.get('qaScenario');
    if (!qaScenario || isOnline || currentPage !== 'game') return;

    if (qaScenario === 'promotion') {
      setAiEnabled(false);
      setGame(new KnightJumpChess('8/P7/8/8/8/8/5k2/7K w - - 0 1'));
      setMoveHistory([]);
      setLastMove(null);
      setSelectedSquare(null);
      setLegalMoves([]);
      setPendingPromotion(null);
      setLocalResult(null);
      return;
    }

    if (qaScenario === 'timeout') {
      setAiEnabled(true);
      setSelectedTimeControl(1);
      setGame(createNewGame());
      setMoveHistory([]);
      setLastMove(null);
      setSelectedSquare(null);
      setLegalMoves([]);
      setPendingPromotion(null);
      setMoveTimestamps([{ white: 0, black: 0 }]);
      setCurrentMoveStartTime(Date.now() - 2500);
      setLocalResult(null);
    }
  }, [currentPage, isOnline]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!moveAnimation) return undefined;
    const timer = setTimeout(() => {
      setMoveAnimation(null);
      lastAnimatedMoveRef.current = null;
    }, moveAnimation.capturedPiece ? BOARD_HAND_CAPTURE_TOTAL_MS : BOARD_HAND_TOTAL_MS);
    return () => clearTimeout(timer);
  }, [moveAnimation]);

  const playMoveAnimation = useCallback((board, moveLike, actor = 'self') => {
    if (!board3d) return;
    const animation = buildMoveAnimationPayload(board, moveLike, actor);
    if (!animation) return;
    const dedupeKey = `${animation.from}-${animation.to}-${moveLike.san || ''}`;
    if (lastAnimatedMoveRef.current === dedupeKey) return;
    lastAnimatedMoveRef.current = dedupeKey;
    setMoveAnimation(animation);
  }, [board3d]);

  const {
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
    setGameData,
  } = useOnlineGameState({
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
  });

  const playerColor = useMemo(() => {
    if (!user || !gameData) return null;
    if (gameData.whiteId === user.uid) return 'w';
    if (gameData.blackId === user.uid) return 'b';
    return null;
  }, [gameData, user]);

  const {
    aiThinking,
    aiError,
    requestAiMove,
    cancelAiSearch,
    isBotOnlineGame,
  } = useAiBotEngine({
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
    botPool: BOT_POOL,
    displayName,
    incomingChallenge,
    variantRules: setupVariantRules,
  });

  const {
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
  } = useGameActions({
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
    gameRef,
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
    localResult,
    setLocalResult,
    movePending,
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
    setupModalOpen,
    setSetupModalOpen,
    setupVariantRules,
  });

  const handleEmailAuth = useCallback(async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Enter an email and password.');
      return;
    }
    setAuthError('');
    try {
      if (authMode === 'signup') {
        await signUpWithEmail(authEmail.trim(), authPassword);
      } else {
        await signInWithEmail(authEmail.trim(), authPassword);
      }
      setAuthPassword('');
    } catch (error) {
      setAuthError(error?.message || 'Authentication failed.');
    }
  }, [authEmail, authMode, authPassword, signInWithEmail, signUpWithEmail]);

  useEffect(() => {
    localResultRef.current = localResult;
  }, [localResult]);

  // Auto-flip board when playing as black
  useEffect(() => {
    if (playerColor === 'b') setFlipped(true);
    else if (playerColor === 'w') setFlipped(false);
  }, [playerColor]);

  // Sync time control for guest (non-host) when gameData loads or host changes it
  useEffect(() => {
    if (gameData?.timeControl && playerColor === 'b') {
      setSelectedTimeControl(gameData.timeControl);
    }
  }, [gameData?.timeControl, playerColor]);

  // Online clock countdown
  const { clockWhite: onlineWhite, clockBlack: onlineBlack } = useOnlineClock(
    isOnline ? gameData : null,
    playerColor,
    handleTimeout
  );

  // Local AI countdown clocks
  useEffect(() => {
    if (isOnline || !aiEnabled) {
      if (!isOnline) {
        setClockWhite(null);
        setClockBlack(null);
      }
      return undefined;
    }

    const tick = () => {
      const totals = moveTimestamps[moveTimestamps.length - 1] || { white: 0, black: 0 };
      const elapsed = isGameOver() ? 0 : Math.max(0, (Date.now() - currentMoveStartTime) / 1000);
      const turn = game.turn();
      const whiteLeft = Math.max(0, selectedTimeControl - (totals.white || 0) - (turn === 'w' ? elapsed : 0));
      const blackLeft = Math.max(0, selectedTimeControl - (totals.black || 0) - (turn === 'b' ? elapsed : 0));

      setClockWhite(whiteLeft);
      setClockBlack(blackLeft);

      if (!localResultRef.current && !isGameOver()) {
        if (whiteLeft <= 0) {
          setLocalResult({ winner: 'b', text: 'Black wins on time' });
          cancelAiSearch();
        } else if (blackLeft <= 0) {
          setLocalResult({ winner: 'w', text: 'White wins on time' });
          cancelAiSearch();
        }
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelAiSearch, isOnline, aiEnabled, selectedTimeControl, moveTimestamps, currentMoveStartTime, game, localResult]);

  // Unify clock state for the UI
  useEffect(() => {
    if (isOnline) {
      setClockWhite(onlineWhite);
      setClockBlack(onlineBlack);
    }
  }, [isOnline, onlineWhite, onlineBlack]);

  const opponentName = useMemo(() => {
    if (!gameData) return 'Opponent';
    if (playerColor === 'w') return gameData.blackName || 'Waiting...';
    if (playerColor === 'b') return gameData.whiteName || 'Opponent';
    return 'Opponent';
  }, [gameData, playerColor]);

  const readyStatus = useMemo(() => {
    if (!gameData || !playerColor) return { self: false, opponent: false };
    const selfReady = playerColor === 'w' ? Boolean(gameData.whiteReady) : Boolean(gameData.blackReady);
    const opponentReady = playerColor === 'w' ? Boolean(gameData.blackReady) : Boolean(gameData.whiteReady);
    return { self: selfReady, opponent: opponentReady };
  }, [gameData, playerColor]);

  const inCheck = useMemo(() => {
    try {
      return game?.isCheckRider?.() || false;
    } catch {
      return false;
    }
  }, [game]);

  const gameStatusText = () => {
    if (!isOnline) {
      if (localResult?.text) return localResult.text;
      const kingWinner = game.getWinnerByKingCapture();
      if (kingWinner) {
        return `${formatTurn(kingWinner)} wins by king capture`;
      }
      if (game.isCheckmateRider()) {
        return `Checkmate — ${formatTurn(game.turn() === 'w' ? 'b' : 'w')} wins`;
      }
      if (game.isStalemateRider()) return 'Stalemate — Draw';
      return `${formatTurn(game.turn())} to move`;
    }
    if (!gameData) return 'Loading...';
    if (gameData.status === 'waiting') return 'Waiting for opponent...';
    if (gameData.status === 'completed' || gameData.status === 'draw') {
      return gameData.result || 'Game over';
    }
    if (gameData.status === 'abandoned') return gameData.result || 'Abandoned';
    return `${formatTurn(game.turn())} to move`;
  };

  const isGameOver = () => {
    return localResult || game.getWinnerByKingCapture() || game.isCheckmateRider() || game.isStalemateRider();
  };

  // ── Render helpers ──
  const renderMoveTable = () => {
    if (moveHistory.length === 0) {
      return <p className="muted">No moves yet. Make your first move!</p>;
    }

    const pairs = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      pairs.push({
        number: Math.floor(i / 2) + 1,
        white: moveHistory[i],
        black: moveHistory[i + 1] || null
      });
    }

    return (
      <div className="move-table">
        {pairs.map((pair) => (
          <div key={pair.number} className="move-table-row">
            <span className="move-number-cell">{pair.number}.</span>
            <span className="move-cell">{pair.white}</span>
            <span className={`move-cell ${!pair.black ? 'move-cell--empty' : ''}`}>
              {pair.black || ''}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Player info for bars
  const topPlayerName = isOnline
    ? (playerColor === 'w' ? opponentName : displayName || 'White')
    : (aiEnabled ? 'AI Engine' : 'Black');
  const bottomPlayerName = isOnline
    ? (playerColor === 'w' ? displayName || 'White' : opponentName)
    : (aiEnabled ? displayName || 'You' : 'White');
  const topPlayerRating = isOnline
    ? (playerColor === 'w' ? (gameData?.blackRatingAfter ?? gameData?.blackRating) : (gameData?.whiteRatingAfter ?? gameData?.whiteRating))
    : (aiEnabled ? aiDifficulty.toUpperCase() : null);
  const bottomPlayerRating = isOnline
    ? (playerColor === 'w' ? (gameData?.whiteRatingAfter ?? gameData?.whiteRating) : (gameData?.blackRatingAfter ?? gameData?.blackRating))
    : (aiEnabled ? rating : null);

  const winnerByKing = game.getWinnerByKingCapture();
  const isCheckmate = !localResult && !winnerByKing && game.isCheckmateRider();
  const isStalemate = !localResult && !winnerByKing && !isCheckmate && game.isStalemateRider();
  const victoryText = localResult?.text
    || (winnerByKing ? `${formatTurn(winnerByKing)} wins by king capture` : null)
    || (isCheckmate ? `Checkmate — ${formatTurn(game.turn() === 'w' ? 'b' : 'w')} wins` : null)
    || (isStalemate ? 'Stalemate — Draw' : null);
  const showCheckAlert = inCheck && !localResult && !winnerByKing && !isCheckmate;
  const showPlayerClocks = isOnline || (aiEnabled && !isOnline);
  const topColor = flipped ? 'w' : 'b';
  const bottomColor = flipped ? 'b' : 'w';
  const topClock = topColor === 'w' ? clockWhite : clockBlack;
  const bottomClock = bottomColor === 'w' ? clockWhite : clockBlack;
  const topPlayer = {
    color: topColor,
    isActiveTurn: game.turn() === topColor && !isGameOver(),
    name: flipped ? bottomPlayerName : topPlayerName,
    rating: flipped ? bottomPlayerRating : topPlayerRating,
    clock: showPlayerClocks ? topClock : null,
  };
  const bottomPlayer = {
    color: bottomColor,
    isActiveTurn: game.turn() === bottomColor && !isGameOver(),
    name: flipped ? topPlayerName : bottomPlayerName,
    rating: flipped ? topPlayerRating : bottomPlayerRating,
    clock: showPlayerClocks ? bottomClock : null,
  };

  const moveTable = renderMoveTable();

  const homePageProps = {
    user,
    authReady,
    profile,
    rating,
    firebaseEnabled,
    incomingChallenge,
    onPlayGuest: () => {
      setAiEnabled(false);
      resetPractice();
      navigateToPage('game');
    },
    onSignIn: () => navigateToPage('signin'),
    onOpenAccount: () => {
      if (user) setProfileModalUid(user.uid);
    },
    onHowItWorks: () => navigateToPage('learn'),
    onOpenCommunityPuzzles: () => navigateToPage('puzzles'),
    onAcceptChallenge: async () => {
      await acceptChallenge();
      navigateToPage('game');
    },
    onDeclineChallenge: declineChallenge,
  };

  const signInPageProps = {
    authReady,
    firebaseEnabled,
    authMode,
    setAuthMode,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authError,
    onSubmit: handleEmailAuth,
    onGoogle: signInWithGoogle,
    onGuest: signInAnonymously,
    canStartOnlineMatch,
    onlineMatchHelpText,
  };

  const boardShellProps = {
    boardView,
    board3d,
    isOnline,
    aiEnabled,
    playerColor,
    aiDifficulty,
    connectionState,
    gameStatusText: gameStatusText(),
    incomingChallenge,
    onAcceptChallenge: acceptChallenge,
    onDeclineChallenge: declineChallenge,
    victoryText,
    showCheckAlert,
    topPlayer,
    bottomPlayer,
    formatClock,
    game,
    selectedSquare,
    legalMoves,
    onSquareClick: handleSquareClick,
    theme,
    customThemeVars,
    boardCornerRadius,
    pieceStyle,
    showEmpoweredMarks,
    lastMove,
    flipped,
    inCheck,
    moveAnimation,
    pendingPromotion,
    onChoosePromotion: handlePromotionChoice,
    onCancelPromotion: () => setPendingPromotion(null),
    onFlipBoard: () => setFlipped(!flipped),
    onOpenSetup: () => setSetupModalOpen(true),
    onNewGame: resetPractice,
    onStopAi: () => {
      setAiEnabled(false);
      resetPractice();
    },
    onLeaveMatch: leaveMatch,
    matchError,
    aiThinking,
    aiError,
    isBotOnlineGame,
    gameData,
    gameId,
    user,
    displayName,
    liveVoiceChat,
    setupModalProps: {
      isOpen: setupModalOpen,
      onClose: closeSetupModal,
      user,
      timeControls: TIME_CONTROLS,
      selectedTimeControl,
      onSelectTimeControl: handleSelectTimeControl,
      boardView,
      onSelectBoardView: setBoardView,
      aiDifficulty,
      aiDifficultyLevels: AI_DIFFICULTY_LEVELS,
      onSelectAiDifficulty: setAiDifficulty,
      variantRules: setupVariantRules,
      onToggleVariantRule: (rule) => setSetupVariantRules((current) => ({
        ...current,
        [rule]: !current[rule],
      })),
      onStartPractice: handleStartPracticeFromSetup,
      onStartAi: handleStartAiFromSetup,
      onStartOnline: handleStartOnlineFromSetup,
      isOnline,
    },
  };

  const sidebarProps = {
    activeTab,
    setActiveTab,
    unreadDmCount,
    playProps: {
      isOnline,
      user,
      firebaseEnabled,
      canStartOnlineMatch,
      onlineMatchHelpText,
      gameData,
      matchStatus,
      opponentName,
      playerColor,
      readyStatus,
      timeControls: TIME_CONTROLS,
      selectedTimeControl,
      onSelectTimeControl: handleSelectTimeControl,
      formatClock,
      clockWhite,
      clockBlack,
      currentTurn: game.turn(),
      startMatchmaking,
      aiEnabled,
      onPlayAi: () => {
        setAiEnabled(true);
        resetPractice();
      },
      aiDifficulty,
      aiDifficultyLevels: AI_DIFFICULTY_LEVELS,
      onSelectAiDifficulty: setAiDifficulty,
      aiThinking,
      cancelMatchmaking,
      leaveMatch,
      toggleReady,
    },
    moveHistory,
    moveTable,
    aiEnabled,
    moveTimestamps,
    formatTime,
    gameData,
    isOnline,
    localResultText: localResult?.text || null,
    gamesProps: {
      user,
      isOnline,
      createCustomGame,
      joinGameId,
      setJoinGameId,
      joinCustomGame,
      waitingGames,
    },
    settingsProps: {
      darkMode,
      setDarkMode,
      baseThemes: BASE_THEMES,
      theme,
      setTheme,
      customThemes,
      deleteCustomTheme,
      showThemeCreator,
      setShowThemeCreator,
      saveCustomTheme,
      pieceStyle,
      setPieceStyle,
      showEmpoweredMarks,
      setShowEmpoweredMarks,
      boardView,
      setBoardView,
      boardCornerRadius,
      setBoardCornerRadius,
      liveVoiceChat,
      setLiveVoiceChat,
      seasonalDecorations,
      setSeasonalDecorations,
      seasonalDecorationDensity,
      setSeasonalDecorationDensity,
      user,
      onEditProfile: () => setProfileModalUid(user.uid),
    },
    rankingsProps: {
      user,
      onPlayerClick: (player) => setProfileModalUid(player.id),
    },
      socialProps: {
        user,
        displayName,
        photoURL: profile?.photoURL || null,
        onPlayerClick: (player) => setProfileModalUid(player.id),
      pendingDm,
      onPendingDmHandled: () => setPendingDm(null),
      onChallengeFriend: handleChallengeFriend,
    },
  };

  return (
    <div className="app">
      <AppHeader
        authReady={authReady}
        user={user}
        profile={profile}
        displayName={displayName}
        rating={rating}
        onOpenProfile={() => setProfileModalUid(user.uid)}
        onOpenSignIn={() => navigateToPage('signin')}
        onSignOut={signOut}
      />
      <div className="left-bg-art" aria-hidden="true" />
      {seasonalDecorations && <SeasonDecorations density={seasonalDecorationDensity} />}
      <RuntimeErrorBoundary
        onError={(error) => {
          console.error('Render boundary caught error:', error);
          pushToast('A view crashed and was paused. Use Retry View to continue.', 'error');
        }}
      >
        <AppPageRouter
          currentPage={currentPage}
          onNavigate={navigateToPage}
          homePageProps={homePageProps}
          signInPageProps={signInPageProps}
          boardShellProps={boardShellProps}
          sidebarProps={sidebarProps}
          currentUser={user}
          currentUserName={displayName}
        />
      </RuntimeErrorBoundary>

      {/* ── Profile Modal ── */}
      {profileModalUid && (
        <Suspense fallback={null}>
          <UserProfileModal
            profileUid={profileModalUid}
            currentUser={user}
            currentUserName={displayName}
            onClose={() => setProfileModalUid(null)}
            onOpenDm={({ chatId, partnerUid, partnerName }) => {
              setPendingDm({ chatId, partnerUid, partnerName });
              setProfileModalUid(null);
              setActiveTab('social');
            }}
          />
        </Suspense>
      )}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.level}`}
            role="status"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
