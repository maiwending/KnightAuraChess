import React from 'react';

export default function PlayTabPanel({
  isOnline,
  user,
  firebaseEnabled,
  gameData,
  matchStatus,
  opponentName,
  playerColor,
  readyStatus,
  timeControls,
  selectedTimeControl,
  onSelectTimeControl,
  formatClock,
  clockWhite,
  clockBlack,
  currentTurn,
  startMatchmaking,
  canStartOnlineMatch,
  onlineMatchHelpText,
  aiEnabled,
  onPlayAi,
  aiDifficulty,
  aiDifficultyLevels,
  onSelectAiDifficulty,
  aiThinking,
  cancelMatchmaking,
  leaveMatch,
  toggleReady,
}) {
  return (
    <div className="tab-panel">
      <h3>Play</h3>
      {isOnline ? (
        <>
          <p className="match-state">
            Status: <strong>{gameData?.status || matchStatus}</strong>
          </p>
          <p className="muted">Opponent: {opponentName}</p>
          {gameData?.status === 'waiting' && playerColor && (
            <div className="ready-panel">
              {playerColor === 'w' && !readyStatus.self ? (
                <div style={{ marginBottom: '12px' }}>
                  <p className="play-section-label" style={{ marginBottom: '6px' }}>Time Control</p>
                  <div className="time-control-grid">
                    {timeControls.map((control) => (
                      <button
                        key={control.seconds}
                        className={`time-control-btn${selectedTimeControl === control.seconds ? ' active' : ''}`}
                        onClick={() => onSelectTimeControl(control.seconds)}
                      >
                        {control.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ marginBottom: '8px' }}>
                  ⏱ {formatClock(gameData?.timeControl ?? selectedTimeControl)} per player
                </p>
              )}
              <div className="ready-row">
                <span>You</span>
                <span className={readyStatus.self ? 'ready-chip ready-chip--on' : 'ready-chip'}>
                  {readyStatus.self ? 'Ready' : 'Not ready'}
                </span>
              </div>
              <div className="ready-row">
                <span>{opponentName}</span>
                <span className={readyStatus.opponent ? 'ready-chip ready-chip--on' : 'ready-chip'}>
                  {readyStatus.opponent ? 'Ready' : 'Not ready'}
                </span>
              </div>
              <button className="btn btn-primary" onClick={toggleReady}>
                {readyStatus.self ? 'Unready' : 'Ready up'}
              </button>
              <p className="muted">Game starts when both players are ready.</p>
            </div>
          )}
          {gameData?.status === 'active' && clockWhite != null && (
            <div className="sidebar-clocks">
              <div className={`sidebar-clock-row${currentTurn === 'b' ? ' sidebar-clock-row--active' : ''}`}>
                <span className="sidebar-clock-label">⬛ Black</span>
                <span className={`sidebar-clock-val${clockBlack <= 10 ? ' sidebar-clock-val--low' : ''}`}>
                  {formatClock(clockBlack)}
                </span>
              </div>
              <div className={`sidebar-clock-row${currentTurn === 'w' ? ' sidebar-clock-row--active' : ''}`}>
                <span className="sidebar-clock-label">⬜ White</span>
                <span className={`sidebar-clock-val${clockWhite <= 10 ? ' sidebar-clock-val--low' : ''}`}>
                  {formatClock(clockWhite)}
                </span>
              </div>
            </div>
          )}
          {gameData?.status === 'waiting' ? (
            <button className="btn btn-ghost" onClick={cancelMatchmaking}>Cancel</button>
          ) : ['completed', 'draw', 'abandoned'].includes(gameData?.status) ? (
            <button className="btn btn-primary" onClick={leaveMatch}>Return to Lobby</button>
          ) : (
            <button className="btn btn-danger" onClick={leaveMatch}>Resign</button>
          )}
        </>
      ) : (
        <>
          <div style={{ marginBottom: '10px' }}>
            <p className="play-section-label" style={{ marginBottom: '6px' }}>⏱ Time Control</p>
            <div className="time-control-grid">
              {timeControls.map((control) => (
                <button
                  key={control.seconds}
                  className={`time-control-btn${selectedTimeControl === control.seconds ? ' active' : ''}`}
                  onClick={() => onSelectTimeControl(control.seconds)}
                >
                  {control.label}
                </button>
              ))}
            </div>
          </div>
          {user ? (
            <>
              <button
                className="btn btn-primary"
                onClick={startMatchmaking}
                disabled={!canStartOnlineMatch}
                style={{ width: '100%', marginBottom: 8 }}
                title={!canStartOnlineMatch ? onlineMatchHelpText : 'Find a match'}
              >
                Find Online Match
              </button>
              {!canStartOnlineMatch && onlineMatchHelpText && (
                <p className="muted" style={{ marginBottom: 8 }}>
                  {onlineMatchHelpText}
                </p>
              )}
            </>
          ) : (
            <p className="muted" style={{ marginBottom: 8 }}>
              {firebaseEnabled
                ? 'Sign in to play online.'
                : 'Local mode — online play disabled.'}
            </p>
          )}
          <button
            className="btn btn-ghost"
            style={{ width: '100%', marginBottom: 8 }}
            onClick={onPlayAi}
          >
            ⚙ Play vs AI
          </button>

          <div style={{ marginBottom: '8px' }}>
            <p className="play-section-label" style={{ marginBottom: '6px' }}>AI Difficulty</p>
            <div className="difficulty-grid">
              {aiDifficultyLevels.map((difficulty) => (
                <button
                  key={difficulty}
                  className={`difficulty-btn${aiDifficulty === difficulty ? ' active' : ''}`}
                  onClick={() => onSelectAiDifficulty(difficulty)}
                  disabled={aiThinking}
                >
                  {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {aiEnabled && (
            <div className="ai-mode-status">
              <p className="ai-status-text">✓ AI Active</p>
              <p className="ai-status-difficulty">{aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1)}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
