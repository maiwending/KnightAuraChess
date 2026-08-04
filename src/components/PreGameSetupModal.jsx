import React from 'react';

export default function PreGameSetupModal({
  isOpen,
  onClose,
  user,
  timeControls,
  selectedTimeControl,
  onSelectTimeControl,
  boardView,
  onSelectBoardView,
  aiDifficulty,
  aiDifficultyLevels,
  onSelectAiDifficulty,
  onStartPractice,
  onStartAi,
  onStartOnline,
  onStartCustomGame,
  challengeTarget,
  isOnline,
}) {
  if (!isOpen) return null;
  const isChallengeSetup = Boolean(challengeTarget);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box setup-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Game setup"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="setup-modal__content">
          <h3>{isChallengeSetup ? `Challenge ${challengeTarget.name}` : 'Game Setup'}</h3>
          <p className="muted">
            {isChallengeSetup
              ? 'Choose the setup controls, then send the challenge.'
              : 'Set your board and timer before starting.'}
          </p>

          <div className="setup-modal__section">
            <p className="play-section-label">Time Control</p>
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

          <div className="setup-modal__section">
            <p className="play-section-label">Board View</p>
            <div className="piece-set-grid">
              <button
                className={`piece-set-btn${boardView === 'flat' ? ' active' : ''}`}
                onClick={() => onSelectBoardView('flat')}
              >
                <span className="piece-set-preview">⬛</span>
                Flat
              </button>
              <button
                className={`piece-set-btn${boardView === 'realistic' ? ' active' : ''}`}
                onClick={() => onSelectBoardView('realistic')}
              >
                <span className="piece-set-preview">♞</span>
                Realistic
              </button>
            </div>
          </div>

          <div className="setup-modal__section">
            <p className="play-section-label">AI Difficulty</p>
            <div className="difficulty-grid">
              {aiDifficultyLevels.map((difficulty) => (
                <button
                  key={difficulty}
                  className={`difficulty-btn${aiDifficulty === difficulty ? ' active' : ''}`}
                  onClick={() => onSelectAiDifficulty(difficulty)}
                >
                  {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="setup-modal__actions">
            <button className="btn btn-ghost" onClick={onStartPractice}>
              Practice
            </button>
            <button className="btn btn-primary" onClick={onStartAi}>
              Play vs AI
            </button>
            <button className="btn btn-ghost" onClick={onStartOnline} disabled={!user || isOnline}>
              {user ? (isOnline ? 'Online Active' : 'Find Online Match') : 'Sign In for Online'}
            </button>
            {onStartCustomGame && (
              <button className="btn btn-primary" onClick={onStartCustomGame} disabled={!user}>
                {user
                  ? (isChallengeSetup ? 'Send Challenge' : 'Create Game')
                  : (isChallengeSetup ? 'Sign In to Challenge' : 'Sign In to Create')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
