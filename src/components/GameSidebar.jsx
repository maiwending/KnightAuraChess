import React, { Suspense, lazy } from 'react';
import ThemeCreator, { themeToVars } from './ThemeCreator.jsx';
import CoachHintsPanel from './CoachHintsPanel.jsx';
import PlayTabPanel from './PlayTabPanel.jsx';
import GameReviewTimeline from './GameReviewTimeline.jsx';
import { firebaseEnabled } from '../utils/firebase.js';

const LeaderboardPanel = lazy(() => import('./LeaderboardPanel.jsx'));
const SocialTab = lazy(() => import('./SocialTab.jsx'));

const panelFallback = (
  <div className="tab-panel">
    <p className="muted">Loading...</p>
  </div>
);

export default function GameSidebar({
  activeTab,
  setActiveTab,
  currentPage,
  onOpenLearn,
  unreadDmCount,
  playProps,
  moveHistory,
  moveTable,
  aiEnabled,
  moveTimestamps,
  formatTime,
  gameData,
  isOnline,
  localResultText,
  gamesProps,
  settingsProps,
  rankingsProps,
  socialProps,
}) {
  const tabs = [
    { key: 'play', icon: '▶', label: 'Play' },
    { key: 'moves', icon: '☰', label: 'Moves' },
    { key: 'games', icon: '⚔', label: 'Games' },
    { key: 'social', icon: '👥', label: 'Social', badge: unreadDmCount },
    { key: 'rankings', icon: '🏆', label: 'Rank' },
    { key: 'settings', icon: '⚙', label: 'Settings' },
  ];

  return (
    <div className="sidebar">
      <nav className="tab-navigation">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="tab-icon-wrap">
              <span className="tab-icon">{tab.icon}</span>
              {tab.badge > 0 && <span className="tab-badge">{tab.badge}</span>}
            </span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
        <button
          className={`tab-btn ${currentPage === 'learn' || currentPage === 'tutorials' ? 'active' : ''}`}
          onClick={onOpenLearn}
        >
          <span className="tab-icon-wrap"><span className="tab-icon">📖</span></span>
          <span className="tab-label">Learn</span>
        </button>
      </nav>

      <div className="tab-content">
        {activeTab === 'play' && <PlayTabPanel {...playProps} />}

        {activeTab === 'moves' && (
          <div className="tab-panel">
            <h3>Moves</h3>
            <div className="moves-list">
              {moveTable}
            </div>
            <GameReviewTimeline
              moveHistory={moveHistory}
              isOnline={isOnline}
              gameData={gameData}
              localResultText={localResultText}
            />
            <CoachHintsPanel
              moveHistory={moveHistory}
              moveTimestamps={moveTimestamps}
            />
            {moveHistory.length > 0 && aiEnabled && (
              <div className="time-summary" style={{ marginTop: 10 }}>
                <div className="summary-item">
                  <span className="summary-label">White</span>
                  <span className="summary-time">
                    {formatTime(moveTimestamps.reduce((sum, entry) => sum + (entry?.white || 0), 0))}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Black</span>
                  <span className="summary-time">
                    {formatTime(moveTimestamps.reduce((sum, entry) => sum + (entry?.black || 0), 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'games' && (
          <div className="tab-panel">
            <h3>Custom Games</h3>
            {!gamesProps.user ? (
              <p className="muted">Sign in to create or join a game.</p>
            ) : gamesProps.isOnline ? (
              <p className="muted">Leave the current match to join another.</p>
            ) : (
              <>
                <button
                  className="btn btn-primary"
                  onClick={gamesProps.createCustomGame}
                  style={{ width: '100%', marginBottom: 8 }}
                >
                  Create New Game
                </button>
                <div className="theme-select">
                  <label htmlFor="join-game" className="muted">Join by game ID</label>
                  <input
                    id="join-game"
                    className="select"
                    type="text"
                    value={gamesProps.joinGameId}
                    onChange={(event) => gamesProps.setJoinGameId(event.target.value)}
                    placeholder="Paste game ID"
                  />
                  <button className="btn btn-primary" onClick={() => gamesProps.joinCustomGame(gamesProps.joinGameId)} style={{ marginTop: 4 }}>
                    Join
                  </button>
                </div>
                {gamesProps.waitingGames.length > 0 ? (
                  <div className="waiting-list">
                    <p className="muted">Open games:</p>
                    <ul>
                      {gamesProps.waitingGames.map((row) => (
                        <li key={row.id}>
                          <div className="waiting-meta">
                            <strong>{row.host}</strong>
                            <span className="muted">
                              {row.createdAt ? row.createdAt.toLocaleString() : 'Just now'}
                            </span>
                          </div>
                          <button className="btn btn-ghost" onClick={() => gamesProps.joinCustomGame(row.id)}>
                            Join
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="muted">No open games.</p>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="tab-panel settings-panel">
            <h3>Settings</h3>
            <div className="settings-hero">
              <div className="settings-hero__copy">
                <span className="settings-hero__eyebrow">Visual Tuning</span>
                <p className="settings-hero__title">Shape the board, pieces, and voice layer before you play.</p>
              </div>
              <div className="settings-hero__preview" aria-hidden="true">
                <span className="settings-hero__preview-cell settings-hero__preview-cell--light" />
                <span className="settings-hero__preview-cell settings-hero__preview-cell--dark" />
                <span className="settings-hero__preview-cell settings-hero__preview-cell--dark settings-hero__preview-cell--accent" />
                <span className="settings-hero__preview-cell settings-hero__preview-cell--light" />
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <span className="settings-section-label">Interface Mode</span>
                <span className="settings-section-rail" aria-hidden="true" />
              </div>
              <div className="piece-set-grid">
                <button
                  className={`piece-set-btn${!settingsProps.darkMode ? ' active' : ''}`}
                  onClick={() => settingsProps.setDarkMode(false)}
                >
                  <span className="piece-set-preview">☀</span>
                  Light
                </button>
                <button
                  className={`piece-set-btn${settingsProps.darkMode ? ' active' : ''}`}
                  onClick={() => settingsProps.setDarkMode(true)}
                >
                  <span className="piece-set-preview">🌙</span>
                  Dark
                </button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <span className="settings-section-label">Board Theme</span>
                <span className="settings-section-rail" aria-hidden="true" />
              </div>
              <div className="theme-swatches">
                {settingsProps.baseThemes.map((themeItem) => (
                  <button
                    key={themeItem.key}
                    className={`theme-swatch${settingsProps.theme === themeItem.key ? ' active' : ''}`}
                    onClick={() => settingsProps.setTheme(themeItem.key)}
                  >
                    <div className="theme-swatch-preview">
                      <span className={themeItem.l} />
                      <span className={themeItem.d} />
                      <span className={themeItem.d} />
                      <span className={themeItem.l} />
                    </div>
                    {themeItem.label}
                  </button>
                ))}
                {settingsProps.customThemes.map((customTheme) => {
                  const customVars = themeToVars(customTheme);
                  return (
                    <button
                      key={customTheme.id}
                      className={`theme-swatch theme-swatch--custom${settingsProps.theme === `custom:${customTheme.id}` ? ' active' : ''}`}
                      onClick={() => settingsProps.setTheme(`custom:${customTheme.id}`)}
                    >
                      <div className="theme-swatch-preview">
                        <span style={{ background: customVars['--board-light'] }} />
                        <span style={{ background: customVars['--board-dark'] }} />
                        <span style={{ background: customVars['--board-dark'] }} />
                        <span style={{ background: customVars['--board-light'] }} />
                      </div>
                      {customTheme.name}
                      <span
                        role="button"
                        tabIndex={0}
                        className="theme-swatch-delete"
                        title="Delete theme"
                        onClick={(event) => {
                          event.stopPropagation();
                          settingsProps.deleteCustomTheme(customTheme.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.stopPropagation();
                            settingsProps.deleteCustomTheme(customTheme.id);
                          }
                        }}
                      >
                        ×
                      </span>
                    </button>
                  );
                })}
                <button
                  className="theme-swatch theme-swatch--add"
                  onClick={() => settingsProps.setShowThemeCreator((value) => !value)}
                >
                  <div className="theme-swatch-preview theme-swatch-preview--add">+</div>
                  Create
                </button>
              </div>
              {settingsProps.showThemeCreator && (
                <ThemeCreator
                  onSave={settingsProps.saveCustomTheme}
                  onCancel={() => settingsProps.setShowThemeCreator(false)}
                />
              )}
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <span className="settings-section-label">Piece Set</span>
                <span className="settings-section-rail" aria-hidden="true" />
              </div>
              <div className="piece-set-grid">
                <button
                  className={`piece-set-btn${settingsProps.pieceStyle === 'svg' ? ' active' : ''}`}
                  onClick={() => settingsProps.setPieceStyle('svg')}
                >
                  <span className="piece-set-preview">♜</span>
                  Cburnett
                </button>
                <button
                  className={`piece-set-btn${settingsProps.pieceStyle === 'minimal' ? ' active' : ''}`}
                  onClick={() => settingsProps.setPieceStyle('minimal')}
                >
                  <span className="piece-set-preview" style={{ fontSize: '1.1rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>K</span>
                  Letters
                </button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <span className="settings-section-label">Board View</span>
                <span className="settings-section-rail" aria-hidden="true" />
              </div>
              <div className="piece-set-grid">
                <button
                  className={`piece-set-btn${settingsProps.boardView === 'flat' ? ' active' : ''}`}
                  onClick={() => settingsProps.setBoardView('flat')}
                >
                  <span className="piece-set-preview">⬛</span>
                  Flat
                  <span className="piece-set-note">Clean board, crisp 2D</span>
                </button>
                <button
                  className={`piece-set-btn${settingsProps.boardView === 'realistic' ? ' active' : ''}`}
                  onClick={() => settingsProps.setBoardView('realistic')}
                >
                  <span className="piece-set-preview">♞</span>
                  Realistic
                  <span className="piece-set-note">Wood board, steeper depth</span>
                </button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <span className="settings-section-label">Empowered Marks</span>
                <span className="settings-section-rail" aria-hidden="true" />
              </div>
              <div className="piece-set-grid">
                <button
                  className={`piece-set-btn${!settingsProps.showEmpoweredMarks ? ' active' : ''}`}
                  onClick={() => settingsProps.setShowEmpoweredMarks(false)}
                >
                  <span className="piece-set-preview">○</span>
                  Off
                </button>
                <button
                  className={`piece-set-btn${settingsProps.showEmpoweredMarks ? ' active' : ''}`}
                  onClick={() => settingsProps.setShowEmpoweredMarks(true)}
                >
                  <span className="piece-set-preview">✦</span>
                  On
                  <span className="piece-set-note">Show every empowered piece</span>
                </button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <span className="settings-section-label">Corner Rounding</span>
                <span className="settings-section-rail" aria-hidden="true" />
              </div>
              <div className="settings-slider">
                <input
                  className="settings-slider__input"
                  type="range"
                  min="0"
                  max="24"
                  step="1"
                  value={settingsProps.boardCornerRadius}
                  onChange={(event) => settingsProps.setBoardCornerRadius(Number.parseInt(event.target.value, 10))}
                />
                <div className="settings-slider__meta">
                  <span>Sharp</span>
                  <strong>{settingsProps.boardCornerRadius}px</strong>
                  <span>Round</span>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <span className="settings-section-label">Voice Chat</span>
                <span className="settings-section-rail" aria-hidden="true" />
              </div>
              <div className="piece-set-grid">
                <button
                  className={`piece-set-btn${!settingsProps.liveVoiceChat ? ' active' : ''}`}
                  onClick={() => settingsProps.setLiveVoiceChat(false)}
                >
                  <span className="piece-set-preview">🔇</span>
                  Off
                </button>
                <button
                  className={`piece-set-btn${settingsProps.liveVoiceChat ? ' active' : ''}`}
                  onClick={() => settingsProps.setLiveVoiceChat(true)}
                >
                  <span className="piece-set-preview">🎤</span>
                  Peer Voice
                </button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <span className="settings-section-label">Seasonal Decorations</span>
                <span className="settings-section-rail" aria-hidden="true" />
              </div>
              <div className="piece-set-grid">
                <button
                  className={`piece-set-btn${!settingsProps.seasonalDecorations ? ' active' : ''}`}
                  onClick={() => settingsProps.setSeasonalDecorations(false)}
                >
                  <span className="piece-set-preview">○</span>
                  Off
                </button>
                <button
                  className={`piece-set-btn${settingsProps.seasonalDecorations ? ' active' : ''}`}
                  onClick={() => settingsProps.setSeasonalDecorations(true)}
                >
                  <span className="piece-set-preview">✦</span>
                  On
                  <span className="piece-set-note">Auto changes by season</span>
                </button>
              </div>
              {settingsProps.seasonalDecorations && (
                <div className="settings-slider" style={{ marginTop: '14px' }}>
                  <input
                    className="settings-slider__input"
                    type="range"
                    min="20"
                    max="180"
                    step="10"
                    value={settingsProps.seasonalDecorationDensity}
                    onChange={(event) => settingsProps.setSeasonalDecorationDensity(Number.parseInt(event.target.value, 10))}
                  />
                  <div className="settings-slider__meta">
                    <span>Less</span>
                    <strong>{settingsProps.seasonalDecorationDensity}%</strong>
                    <span>More</span>
                  </div>
                </div>
              )}
            </div>

            {settingsProps.user && (
              <button
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: '4px' }}
                onClick={settingsProps.onEditProfile}
              >
                Edit My Profile
              </button>
            )}
          </div>
        )}

        {activeTab === 'rankings' && firebaseEnabled && (
          <Suspense fallback={panelFallback}>
            <div className="tab-panel">
              <LeaderboardPanel
                currentUser={rankingsProps.user}
                onPlayerClick={rankingsProps.onPlayerClick}
                embedded
              />
            </div>
          </Suspense>
        )}

        {activeTab === 'social' && (
          <Suspense fallback={panelFallback}>
            <SocialTab
              currentUser={socialProps.user}
              currentUserName={socialProps.displayName}
              currentUserPhotoURL={socialProps.photoURL}
              onPlayerClick={socialProps.onPlayerClick}
              pendingDm={socialProps.pendingDm}
              onPendingDmHandled={socialProps.onPendingDmHandled}
              onChallengeFriend={socialProps.onChallengeFriend}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
