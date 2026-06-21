import React from 'react';
import { firebaseEnabled } from '../utils/firebase.js';

export default function AppHeader({
  authReady,
  user,
  profile,
  displayName,
  rating,
  onOpenProfile,
  onOpenSignIn,
  onSignOut,
}) {
  return (
    <header className="top-bar">
      <div className="brand">
        <img src="/riderchess.png" alt="Logo" className="brand-logo" />
        <div className="brand-text">
          <h1>knight-Aura Chess</h1>
          <p className="brand-subtitle">Chess reimagined — unleash the power of the horse</p>
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
