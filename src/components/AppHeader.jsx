import React from 'react';
import { firebaseEnabled } from '../utils/firebase.js';

const HEADER_TAGLINES = [
  'Chess reimagined — unleash the power of the horse',
  'Friendly knights, strange auras, sharper games',
  'One rule twist. Everything else is chess.',
  'Ride the board. Bend the line.',
  'Classic chess with a knightly glow',
  'Where every knight carries an aura',
  'Jump one blocker. Change the whole position.',
  'A tiny twist with royal consequences',
];

const HEADER_TAGLINE = HEADER_TAGLINES[Math.floor(Math.random() * HEADER_TAGLINES.length)];

export default function AppHeader({
  authReady,
  user,
  profile,
  displayName,
  rating,
  onOpenProfile,
  onOpenSignIn,
  onSignOut,
  onHome,
}) {
  return (
    <header className="top-bar">
      <div className="brand">
        <button
          type="button"
          className="brand-home-button"
          onClick={onHome}
          aria-label="Go to home"
          title="Home"
        >
          <img src="/riderchess.png" alt="" className="brand-logo" />
        </button>
        <div className="brand-text">
          <h1>knight-Aura Chess</h1>
          <p className="brand-subtitle">{HEADER_TAGLINE}</p>
        </div>
      </div>

      <div className="auth-panel">
        {!authReady ? (
          <span className="auth-status">Connecting...</span>
        ) : !firebaseEnabled ? (
          <span className="auth-status">Local mode</span>
        ) : user ? (
          <div className="auth-user">
            <div className="auth-user-chip" onClick={onOpenProfile} role="button" tabIndex={0}>
              <div className="auth-avatar-mini">
                {profile?.photoURL
                  ? <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" />
                  : (displayName || '?')[0].toUpperCase()
                }
              </div>
              <span className="auth-name">{displayName}</span>
              <span className="auth-meta">{rating}</span>
            </div>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', padding: '5px 12px' }}
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="auth-actions">
            <button className="btn btn-primary" onClick={onOpenSignIn}>
              Sign In
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
