import React, { Suspense, lazy } from 'react';
import ChessBoard from './ChessBoard.jsx';
import PlayerBar from './PlayerBar.jsx';
import PromotionPicker from './PromotionPicker.jsx';
import PreGameSetupModal from './PreGameSetupModal.jsx';

const GameChat = lazy(() => import('./GameChat.jsx'));

export default function BoardShell({
  boardView,
  board3d,
  isOnline,
  aiEnabled,
  playerColor,
  aiDifficulty,
  connectionState,
  gameStatusText,
  incomingChallenge,
  onAcceptChallenge,
  onDeclineChallenge,
  victoryText,
  showCheckAlert,
  topPlayer,
  bottomPlayer,
  formatClock,
  game,
  selectedSquare,
  legalMoves,
  onSquareClick,
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
  onChoosePromotion,
  onCancelPromotion,
  onFlipBoard,
  onOpenSetup,
  onNewGame,
  onStopAi,
  onLeaveMatch,
  matchError,
  aiThinking,
  aiError,
  isBotOnlineGame,
  gameData,
  gameId,
  user,
  displayName,
  liveVoiceChat,
  setupModalProps,
}) {
  const connectionLabel = connectionState === 'live'
    ? 'Live'
    : connectionState === 'reconnecting'
      ? 'Reconnecting'
      : connectionState === 'connecting'
        ? 'Connecting'
        : 'Offline';

  return (
    <section className={`board-section${board3d ? ' board-section--3d' : ''}${boardView === 'realistic' ? ' board-section--realistic' : ''}`}>
      <div className="board-header">
        <div className="game-mode-badge">
          <span className={`game-mode-dot${isOnline ? ' game-mode-dot--live' : ''}`} />
          {isOnline ? 'Live Match' : aiEnabled ? 'vs AI' : 'Practice'}
        </div>
        <span className="game-status-text">{gameStatusText}</span>
        {isOnline && (
          <span className={`connection-chip connection-chip--${connectionState}`}>{connectionLabel}</span>
        )}
        {isOnline && playerColor && (
          <div className="player-chip">{playerColor === 'w' ? 'White' : 'Black'}</div>
        )}
        {!isOnline && aiEnabled && (
          <div className="ai-opponent-badge">
            <span className="badge-icon">⚙</span>
            <div className="badge-content">
              <p className="badge-label">AI</p>
              <p className="badge-difficulty">{aiDifficulty}</p>
            </div>
          </div>
        )}
      </div>

      {incomingChallenge && !isOnline && (
        <div className="challenge-toast">
          <p className="challenge-toast-text">
            <strong>{incomingChallenge.fromName}</strong> challenged you to a game!
          </p>
          <div className="challenge-toast-actions">
            <button
              className="btn btn-primary"
              style={{ padding: '0.3rem 0.9rem', fontSize: '0.82rem' }}
              onClick={onAcceptChallenge}
            >
              Accept
            </button>
            <button
              className="btn btn-ghost"
              style={{ padding: '0.3rem 0.9rem', fontSize: '0.82rem' }}
              onClick={onDeclineChallenge}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {victoryText && <div className="victory-banner">{victoryText}</div>}
      {showCheckAlert && <div className="check-alert">Check!</div>}

      <PlayerBar position="top" formatClock={formatClock} {...topPlayer} />

      <ChessBoard
        game={game}
        selectedSquare={selectedSquare}
        legalMoves={legalMoves}
        onSquareClick={onSquareClick}
        theme={theme}
        customThemeVars={customThemeVars}
        boardCornerRadius={boardCornerRadius}
        pieceStyle={pieceStyle}
        showEmpoweredMarks={showEmpoweredMarks}
        lastMove={lastMove}
        flipped={flipped}
        inCheck={inCheck}
        board3d={board3d}
        boardView={boardView}
        moveAnimation={moveAnimation}
      />

      {pendingPromotion && (
        <PromotionPicker
          color={pendingPromotion.color || 'w'}
          onChoosePromotion={onChoosePromotion}
          onCancelPromotion={onCancelPromotion}
        />
      )}

      <PlayerBar position="bottom" formatClock={formatClock} {...bottomPlayer} />

      <div className="board-actions">
        <button className="btn btn-ghost" onClick={onFlipBoard} title="Flip board">
          ⇅ Flip
        </button>
        <button className="btn btn-ghost" onClick={onOpenSetup} title="Game setup">
          ⚙ Setup
        </button>
        <button className="btn btn-ghost" onClick={onNewGame} disabled={isOnline} title="New game">
          + New
        </button>
        {aiEnabled && (
          <button className="btn btn-ghost" onClick={onStopAi}>
            Stop AI
          </button>
        )}
        {isOnline && (
          <button className="btn btn-danger" onClick={onLeaveMatch}>
            Resign
          </button>
        )}
      </div>

      {matchError && <p className="error-text">{matchError}</p>}

      {aiThinking && !isBotOnlineGame && (
        <div className="ai-thinking-indicator">
          <div className="thinking-spinner" />
          <span className="thinking-text">AI is thinking...</span>
        </div>
      )}
      {aiError && <p className="error-text">{aiError}</p>}

      {isOnline && gameData?.status === 'active' && gameId && user && (
        <Suspense fallback={<p className="muted">Loading chat...</p>}>
          <GameChat
            gameId={gameId}
            currentUser={user}
            currentUserName={displayName}
            liveVoiceChat={liveVoiceChat}
            playerColor={playerColor}
          />
        </Suspense>
      )}

      <PreGameSetupModal {...setupModalProps} />
    </section>
  );
}
