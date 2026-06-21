import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, limit as fsLimit } from 'firebase/firestore';
import { db, firebaseEnabled } from '../utils/firebase.js';

export default function LeaderboardPanel({ currentUser, onPlayerClick, embedded }) {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    if (!firebaseEnabled || !db) return;
    const q = query(
      collection(db, 'users'),
      orderBy('rating', 'desc'),
      fsLimit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPlayers(snap.docs.map((d, i) => ({ rank: i + 1, id: d.id, ...d.data() })));
      },
      (error) => {
        console.warn('Leaderboard snapshot failed:', error?.message || error);
        setPlayers([]);
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
        {players.length === 0 && (
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
