import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../utils/firebase.js';

function formatRecentDate(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return 'No date';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getMoveCount(game) {
  const history = game?.moveHistory;
  if (Array.isArray(history)) return history.length;
  if (typeof history === 'string') {
    return history.split(/\s+/).filter(Boolean).length;
  }
  return null;
}

function getTimeControl(game) {
  const tc = game?.timeControl;
  if (!tc) return null;
  if (typeof tc === 'string') return tc;
  const minutes = Number(tc.minutes ?? tc.initial ?? 0);
  const increment = Number(tc.increment ?? tc.inc ?? 0);
  if (!minutes && !increment) return null;
  return `${minutes}+${increment}`;
}

function getGameSummary(game, userId) {
  const isWhite = game.whiteId === userId;
  const opponentName = isWhite
    ? (game.blackName || 'Opponent')
    : (game.whiteName || 'Opponent');
  const status = String(game.status || '').toLowerCase();
  const resultText = String(game.result || '').toLowerCase();

  if (status === 'draw' || resultText.includes('draw')) {
    return { result: 'Draw', className: 'draw', opponentName };
  }

  if (status === 'abandoned' && !game.winner) {
    return { result: 'Abandoned', className: 'draw', opponentName };
  }

  if (!game.winner) {
    return { result: 'Draw', className: 'draw', opponentName };
  }

  const winnerValue = String(game.winner).toLowerCase();
  const userColor = isWhite ? 'w' : 'b';
  const userWon = game.winner === userId
    || winnerValue === userColor
    || (winnerValue === 'white' && userColor === 'w')
    || (winnerValue === 'black' && userColor === 'b');
  return {
    result: userWon ? 'Win' : 'Loss',
    className: userWon ? 'win' : 'loss',
    opponentName,
  };
}

function HomeAuraDiagram() {
  const SIZE = 6;
  const KR = 3;
  const KC = 2;
  const cells = useMemo(() => {
    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const r = KR + dr;
      const c = KC + dc;
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) grid[r][c] = { hl: 'adj' };
    }
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const r = KR + dr;
      const c = KC + dc;
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) grid[r][c] = { hl: 'knm' };
    }
    grid[KR][KC] = { piece: '♘', hl: 'source' };
    grid[2][2] = { piece: '♖', hl: 'adj' };
    grid[3][3] = { piece: '♗', hl: 'adj' };
    grid[1][1] = { piece: '♕', hl: 'knm' };
    return grid;
  }, []);

  return (
    <div className="home-aura-diagram" aria-hidden="true">
      {cells.map((row, r) => (
        <div key={r} className="home-aura-diagram__row">
          {row.map((cell, c) => {
            const light = (r + c) % 2 === 0;
            const cls = [
              'home-aura-diagram__cell',
              light ? 'is-light' : 'is-dark',
              cell?.hl ? `is-${cell.hl}` : '',
            ].filter(Boolean).join(' ');
            return (
              <div key={c} className={cls}>
                {cell?.piece && <span className="home-aura-diagram__piece">{cell.piece}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SignedInHomePanel({
  user,
  profile,
  rating,
  firebaseEnabled,
  incomingChallenge,
  onPlay,
  onOpenAccount,
  onHowItWorks,
  onOpenCommunityPuzzles,
  onAcceptChallenge,
  onDeclineChallenge,
}) {
  const [recentGames, setRecentGames] = useState([]);
  const [loadingRecentGames, setLoadingRecentGames] = useState(false);

  useEffect(() => {
    if (!user || !firebaseEnabled || !db) {
      setRecentGames([]);
      setLoadingRecentGames(false);
      return;
    }

    let active = true;
    const loadRecentGames = async () => {
      setLoadingRecentGames(true);
      try {
        const statuses = ['completed', 'draw', 'abandoned'];
        const [whiteSnap, blackSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'games'),
            where('whiteId', '==', user.uid),
            where('status', 'in', statuses),
            limit(6)
          )),
          getDocs(query(
            collection(db, 'games'),
            where('blackId', '==', user.uid),
            where('status', 'in', statuses),
            limit(6)
          )),
        ]);

        if (!active) return;

        const games = [
          ...whiteSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
          ...blackSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
        ]
          .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))
          .slice(0, 4);

        setRecentGames(games);
      } catch {
        if (active) setRecentGames([]);
      } finally {
        if (active) setLoadingRecentGames(false);
      }
    };

    loadRecentGames();
    return () => {
      active = false;
    };
  }, [firebaseEnabled, user]);

  const record = useMemo(() => ({
    wins: profile?.wins ?? 0,
    losses: profile?.losses ?? 0,
    draws: profile?.draws ?? 0,
  }), [profile]);

  const displayName = profile?.displayName || user.email || 'Player';
  const handle = profile?.handle || profile?.username;
  const firstName = displayName.split(/[\s@]/)[0];

  return (
    <>
      <section className="home-hero home-hero--signed-in">
        <div className="home-hero-copy">
          <span className="home-hero-eyebrow">Welcome back, {firstName}</span>
          <h2>
            Pick up the board fast.
            <br />
            <em>Live play is one click away.</em>
          </h2>
          <p className="home-summary">
            Your rating, record, and recent results are ready. Start a board, open your account, or
            refresh the aura rule before your next match.
          </p>
          <div className="home-actions">
            <button className="btn btn-primary home-cta" onClick={onPlay}>
              Play
            </button>
            <button className="btn btn-ghost home-cta" onClick={onOpenAccount}>
              Account
            </button>
            <button className="btn btn-ghost home-cta" onClick={onHowItWorks}>
              How It Works
            </button>
            <button className="btn btn-ghost home-cta" onClick={onOpenCommunityPuzzles}>
              Community Puzzles
            </button>
          </div>
          <div className="home-hero-status">
            <span className={`home-dot ${firebaseEnabled ? 'is-on' : 'is-off'}`} aria-hidden="true" />
            {firebaseEnabled
              ? 'Online · ranked play and live challenges enabled'
              : 'Offline · Firebase is off, local play only'}
          </div>
        </div>

        <aside className="home-hero-card home-account-card">
          <div className="home-account-card__header">
            <div>
              <p className="home-card-label">Account</p>
              <h3>{displayName}</h3>
              {handle && <span className="home-account-handle">@{handle}</span>}
            </div>
            <div className="home-rating-pill home-rating-pill--big">{rating} Elo</div>
          </div>

          <div className="home-record-grid">
            <div className="home-record-tile">
              <span>Wins</span>
              <strong>{record.wins}</strong>
            </div>
            <div className="home-record-tile">
              <span>Losses</span>
              <strong>{record.losses}</strong>
            </div>
            <div className="home-record-tile">
              <span>Draws</span>
              <strong>{record.draws}</strong>
            </div>
          </div>

          {incomingChallenge ? (
            <div className="home-challenge-card">
              <p className="home-card-label">Incoming Challenge</p>
              <strong>{incomingChallenge.fromName || 'Player'} wants a game.</strong>
              <div className="home-challenge-card__actions">
                <button className="btn btn-primary" onClick={onAcceptChallenge}>
                  Accept
                </button>
                <button className="btn btn-ghost" onClick={onDeclineChallenge}>
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <div className="home-status-card">
              <p className="home-card-label">Launcher Status</p>
              <strong>No pending challenge</strong>
              <span>Open Play for local boards, AI, or matchmaking.</span>
            </div>
          )}

        </aside>
      </section>

      <section className="home-aura-strip">
        <div className="home-aura-strip__diagram">
          <HomeAuraDiagram />
        </div>
        <div className="home-aura-strip__copy">
          <p className="home-card-label">Knight-Aura · the rule in one line</p>
          <h3>Friendly knights cast an aura. Pieces in it can jump one blocker.</h3>
          <p>
            Standard chess everywhere else. Brush up on aura squares, the one-jump limit, and pawn
            edge cases before your next ranked match.
          </p>
          <button className="btn btn-primary home-aura-strip__cta" onClick={onHowItWorks}>
            Open the Learn page →
          </button>
        </div>
      </section>

      <section className="home-dashboard">
        <article className="home-panel">
          <header className="home-panel__header">
            <div>
              <p className="home-card-label">Recent Games</p>
              <h3>You vs the world</h3>
            </div>
          </header>
          {loadingRecentGames ? (
            <p className="home-panel__muted">Loading recent games…</p>
          ) : recentGames.length === 0 ? (
            <p className="home-panel__muted">No finished games yet. Your first result will show up here.</p>
          ) : (
            <div className="home-recent-list">
              {recentGames.map((game) => {
                const summary = getGameSummary(game, user.uid);
                const moves = getMoveCount(game);
                const tc = getTimeControl(game);
                const meta = [
                  formatRecentDate(game.updatedAt),
                  moves != null ? `${moves} moves` : null,
                  tc,
                ].filter(Boolean).join(' · ');
                return (
                  <div key={game.id} className="home-recent-row">
                    <span className={`home-recent-result home-recent-result--${summary.className}`}>
                      {summary.result}
                    </span>
                    <div className="home-recent-copy">
                      <strong>vs {summary.opponentName}</strong>
                      <span>{meta}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="home-panel">
          <header className="home-panel__header">
            <div>
              <p className="home-card-label">Next Step</p>
              <h3>Choose a lane</h3>
            </div>
          </header>
          <div className="home-lane-list">
            <button type="button" className="home-lane" onClick={onPlay} aria-label="Launch a board">
              <span className="home-lane__mark">P</span>
              <span className="home-lane__body">
                <strong>Play</strong>
                <span>Launch local, AI, or online without re-auth.</span>
              </span>
              <span className="home-lane__arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="home-lane" onClick={onOpenAccount} aria-label="Open your profile hub">
              <span className="home-lane__mark">A</span>
              <span className="home-lane__body">
                <strong>Account</strong>
                <span>Edit your card, review your record, message players.</span>
              </span>
              <span className="home-lane__arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="home-lane" onClick={onHowItWorks} aria-label="Read the Learn page">
              <span className="home-lane__mark">L</span>
              <span className="home-lane__body">
                <strong>Learn</strong>
                <span>Aura squares, one-jump limits, and pawn edge cases.</span>
              </span>
              <span className="home-lane__arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="home-lane" onClick={onOpenCommunityPuzzles} aria-label="Open community puzzles">
              <span className="home-lane__mark">C</span>
              <span className="home-lane__body">
                <strong>Puzzles</strong>
                <span>Browse and publish community-made challenge positions.</span>
              </span>
              <span className="home-lane__arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </article>
      </section>

      <footer className="home-outro">
        <div className="home-outro__text">
          Built around one rule change. <strong>Everything else is chess.</strong>
        </div>
        <div className="home-outro__actions">
          <button className="btn btn-ghost" onClick={onHowItWorks}>Learn the rule</button>
          <button className="btn btn-primary" onClick={onPlay}>Start a game →</button>
        </div>
      </footer>
    </>
  );
}

function SignedOutHomePanel({
  firebaseEnabled,
  onPlayGuest,
  onSignIn,
  onHowItWorks,
  onOpenCommunityPuzzles,
  primaryActionLabel = 'Play as Guest',
}) {
  return (
    <>
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="home-hero-eyebrow">A chess variant in one rule</span>
          <h2>
            Friendly knights cast an <em>aura</em>.
            <br />
            Pieces in it can <em>jump one blocker</em>.
          </h2>
          <p className="home-summary">
            Standard chess movement everywhere else. Start a guest board instantly, sign in for live
            play, or learn the rule twist before you sit down.
          </p>
          <div className="home-actions">
            <button className="btn btn-primary home-cta" onClick={onPlayGuest}>
              {primaryActionLabel}
            </button>
            <button className="btn btn-ghost home-cta" onClick={onSignIn}>
              Sign In
            </button>
            <button className="btn btn-ghost home-cta" onClick={onHowItWorks}>
              How It Works
            </button>
            <button className="btn btn-ghost home-cta" onClick={onOpenCommunityPuzzles}>
              Community Puzzles
            </button>
          </div>
          <div className="home-hero-status">
            <span className={`home-dot ${firebaseEnabled ? 'is-on' : 'is-off'}`} aria-hidden="true" />
            {firebaseEnabled
              ? 'Guest play is local · sign in for ranked + online'
              : 'Firebase is off · guest practice is the only mode right now'}
          </div>
        </div>
        <div className="home-hero-art">
          <HomeAuraDiagram />
        </div>
      </section>

      <section className="home-highlights">
        <article className="home-highlight">
          <div className="home-highlight__mark" aria-hidden="true">▶</div>
          <h3>Play as Guest</h3>
          <p>Launch straight into a local board with clocks, AI, and polished board options. No account needed.</p>
          <span className="home-highlight__hint">Start board →</span>
        </article>
        <article className="home-highlight">
          <div className="home-highlight__mark" aria-hidden="true">↗</div>
          <h3>Sign In</h3>
          <p>Google, email, or guest auth — keep a rating, social graph, and live-game history.</p>
          <span className="home-highlight__hint">Continue →</span>
        </article>
        <article className="home-highlight">
          <div className="home-highlight__mark" aria-hidden="true">?</div>
          <h3>Learn the twist</h3>
          <p>Aura squares, one-jump limits, and pawn edge cases — all in a 3-minute interactive page.</p>
          <span className="home-highlight__hint">Open Learn page →</span>
        </article>
      </section>

      <footer className="home-outro">
        <div className="home-outro__text">
          Built around one rule change. <strong>Everything else is chess.</strong>
        </div>
        <div className="home-outro__actions">
          <button className="btn btn-ghost" onClick={onHowItWorks}>Learn the rule</button>
          <button className="btn btn-ghost" onClick={onOpenCommunityPuzzles}>Community Puzzles</button>
          <button className="btn btn-primary" onClick={onPlayGuest} aria-label="Start a guest board">
            Start a game →
          </button>
        </div>
      </footer>
    </>
  );
}

export default function HomePage({
  user,
  authReady = true,
  profile,
  rating,
  firebaseEnabled,
  incomingChallenge,
  onPlayGuest,
  onSignIn,
  onOpenAccount,
  onHowItWorks,
  onOpenCommunityPuzzles,
  onAcceptChallenge,
  onDeclineChallenge,
}) {
  return (
    <main className="home-page">
      {user ? (
        <SignedInHomePanel
          user={user}
          profile={profile}
          rating={rating}
          firebaseEnabled={firebaseEnabled}
          incomingChallenge={incomingChallenge}
          onPlay={onPlayGuest}
          onOpenAccount={onOpenAccount}
          onHowItWorks={onHowItWorks}
          onOpenCommunityPuzzles={onOpenCommunityPuzzles}
          onAcceptChallenge={onAcceptChallenge}
          onDeclineChallenge={onDeclineChallenge}
        />
      ) : (
        <SignedOutHomePanel
          firebaseEnabled={firebaseEnabled}
          onPlayGuest={onPlayGuest}
          onSignIn={onSignIn}
          onHowItWorks={onHowItWorks}
          onOpenCommunityPuzzles={onOpenCommunityPuzzles}
          primaryActionLabel={authReady ? 'Play as Guest' : 'Play'}
        />
      )}
    </main>
  );
}
