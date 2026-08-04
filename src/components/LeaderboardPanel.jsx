import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, firebaseEnabled } from '../utils/firebase.js';

function toLeaderboardPlayers(docs) {
  return docs
    .map((d) => {
      const data = d.data();
      const rating = Number(data.rating ?? 1200);
      return {
        id: d.id,
        ...data,
        rating: Number.isFinite(rating) ? rating : 1200,
      };
    })
    .filter((player) => player.displayName || player.usernameKey || player.email || player.rating)
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return String(a.displayName || a.id).localeCompare(String(b.displayName || b.id));
    })
    .map((player, i) => ({ ...player, rank: i + 1 }));
}

export default function LeaderboardPanel({ currentUser, onPlayerClick, embedded }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(Boolean(firebaseEnabled && db));
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!firebaseEnabled || !db) {
      setLoading(false);
      setLoadError('Rankings need Firebase to be configured.');
      return undefined;
    }
    setLoading(true);
    setLoadError('');
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setPlayers(toLeaderboardPlayers(snap.docs));
        setLoading(false);
      },
      (error) => {
        console.warn('Leaderboard snapshot failed:', error?.message || error);
        setPlayers([]);
        setLoadError('Rankings are blocked by deployed Firestore rules. Ask the Firebase project owner to deploy the latest rules.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return (
    <aside className="leaderboard-panel" data-embedded={embedded ? 'true' : undefined}>
      <div className="leaderboard-header">
        <h3 className="leaderboard-title">Rank</h3>
      </div>
      <div className="leaderboard-list">
        {loading && (
          <p className="muted leaderboard-empty">Loading rankings...</p>
        )}
        {!loading && loadError && (
          <p className="muted leaderboard-empty">{loadError}</p>
        )}
        {!loading && !loadError && players.length === 0 && (
          <p className="muted leaderboard-empty">No players yet.</p>
        )}
        {players.map((p) => (
          <button
            key={p.id}
            className={`lb-row${p.id === currentUser?.uid ? ' lb-row--self' : ''}`}
            onClick={() => onPlayerClick(p)}
            title={p.displayName || 'Player'}
          >
            <span className="lb-rank">#{p.rank}</span>
            <div className="lb-avatar">
              {p.photoURL
                ? <img src={p.photoURL} alt="" referrerPolicy="no-referrer" />
                : <span>{(p.displayName || '?')[0].toUpperCase()}</span>
              }
            </div>
            <div className="lb-info">
              <span className="lb-name">{p.displayName || 'Player'}</span>
              <span className="lb-rating">{p.rating ?? 1200}</span>
            </div>
            <span
              className={`presence-dot${p.online ? ' presence-dot--online' : ''}`}
              title={p.online ? 'Online' : 'Offline'}
            />
          </button>
        ))}
      </div>
    </aside>
  );
}
