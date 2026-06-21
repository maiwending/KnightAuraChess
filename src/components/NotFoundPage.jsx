import { useEffect } from 'react';
import notFoundArtwork from '../assets/knight-aura-404-transparent.png';
import './NotFoundPage.css';

export default function NotFoundPage({ onHome, onPlay }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = '404 — knightAuraChess';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="nf-page">
      <div className="nf-glow nf-glow--top" aria-hidden="true" />
      <div className="nf-glow nf-glow--bottom" aria-hidden="true" />

      <header className="nf-header">
        <button type="button" className="nf-brand" onClick={onHome}>
          <span className="nf-brand__mark">♞</span>
          <span>knightAuraChess</span>
        </button>
        <span className="nf-header__code">ERROR / 404</span>
      </header>

      <section className="nf-content">
        <div className="nf-art-frame">
          <img
            className="nf-art"
            src={notFoundArtwork}
            alt="A knight on horseback striking a cloud marked 404"
          />
        </div>

        <div className="nf-copy">
          <p className="nf-eyebrow">Illegal route</p>
          <h1>This square is off the board.</h1>
          <p>
            The page may have moved, or the route was never part of this position.
            Return to familiar ground and keep playing.
          </p>
          <div className="nf-actions">
            <button type="button" className="nf-button nf-button--primary" onClick={onHome}>
              Return home
            </button>
            <button type="button" className="nf-button nf-button--ghost" onClick={onPlay}>
              Open the board
            </button>
          </div>
        </div>
      </section>

      <footer className="nf-footer">
        <span>404</span>
        <span>Every route needs a legal destination.</span>
      </footer>
    </main>
  );
}
