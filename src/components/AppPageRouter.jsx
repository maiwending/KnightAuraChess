import React, { Suspense, lazy } from 'react';
import BoardShell from './BoardShell.jsx';
import GameSidebar from './GameSidebar.jsx';
import HomePage from './HomePage.jsx';

const LearnPage = lazy(() => import('./LearnPage.jsx'));
const CommunityPuzzlesPage = lazy(() => import('./CommunityPuzzlesPage.jsx'));
const NotFoundPage = lazy(() => import('./NotFoundPage.jsx'));
const SignInPage = lazy(() => import('./SignInPage.jsx'));
const UptimePage = lazy(() => import('./UptimePage.jsx'));

const pageFallback = (
  <div className="page-loading">
    <p className="muted">Loading page...</p>
  </div>
);

export default function AppPageRouter({
  currentPage,
  onNavigate,
  homePageProps,
  signInPageProps,
  boardShellProps,
  sidebarProps,
  currentUser,
  currentUserName,
}) {
  if (currentPage === 'signin') {
    return (
      <Suspense fallback={pageFallback}>
        <SignInPage {...signInPageProps} onBack={() => onNavigate('home')} />
      </Suspense>
    );
  }

  if (currentPage === 'learn') {
    return (
      <Suspense fallback={pageFallback}>
        <LearnPage
          onBack={() => onNavigate('home')}
          onOpenCommunityPuzzles={() => onNavigate('puzzles')}
        />
      </Suspense>
    );
  }

  if (currentPage === 'tutorials') {
    return (
      <Suspense fallback={pageFallback}>
        <LearnPage
          onBack={() => onNavigate('home')}
          onOpenCommunityPuzzles={() => onNavigate('puzzles')}
        />
      </Suspense>
    );
  }

  if (currentPage === 'puzzles') {
    return (
      <Suspense fallback={pageFallback}>
        <CommunityPuzzlesPage
          onBack={() => onNavigate('home')}
          onOpenLearn={() => onNavigate('learn')}
          onOpenPublishPuzzle={() => onNavigate('publish-puzzle')}
          currentUser={currentUser}
          currentUserName={currentUserName}
        />
      </Suspense>
    );
  }

  if (currentPage === 'publish-puzzle') {
    return (
      <Suspense fallback={pageFallback}>
        <CommunityPuzzlesPage
          onBack={() => onNavigate('puzzles')}
          onOpenLearn={() => onNavigate('learn')}
          onOpenPublishPuzzle={() => onNavigate('publish-puzzle')}
          currentUser={currentUser}
          currentUserName={currentUserName}
          initialView="submit"
          publishOnly
        />
      </Suspense>
    );
  }

  if (currentPage === 'uptime') {
    return (
      <Suspense fallback={pageFallback}>
        <UptimePage onBack={() => onNavigate('home')} />
      </Suspense>
    );
  }

  if (currentPage === 'home') {
    return <HomePage {...homePageProps} />;
  }

  if (currentPage === 'not-found') {
    return (
      <Suspense fallback={pageFallback}>
        <NotFoundPage
          onHome={() => onNavigate('home')}
          onPlay={() => onNavigate('game')}
        />
      </Suspense>
    );
  }

  return (
    <>
      <main className="layout">
        <BoardShell {...boardShellProps} />
        <GameSidebar {...sidebarProps} currentPage={currentPage} onOpenLearn={() => onNavigate('learn')} />
      </main>

      <footer className="footer">
        <div className="footer-brand">
          <span className="footer-brand-dot" />
          knight-Aura Chess
        </div>
        <span className="footer-meta">Chess reimagined — unleash the power of the horse</span>
      </footer>
    </>
  );
}
