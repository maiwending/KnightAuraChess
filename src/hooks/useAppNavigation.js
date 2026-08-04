import { useCallback, useEffect, useState } from 'react';

const APP_BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '';

function getPageFromLocation() {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname;
  const homePaths = new Set([
    APP_BASE_PATH || '/',
    `${APP_BASE_PATH}/`,
    `${APP_BASE_PATH}/index.html`,
  ]);
  if (homePaths.has(path)) return 'home';
  if (/\/SignIn\/?$/.test(path)) return 'signin';
  if (/\/Tutorials\/?$/.test(path)) return 'tutorials';
  if (/\/Learn\/?$/.test(path)) return 'learn';
  if (/\/Puzzles\/?$/.test(path)) return 'puzzles';
  if (/\/PublishPuzzle\/?$/.test(path)) return 'publish-puzzle';
  if (/\/Play\/?$/.test(path)) return 'game';
  if (/\/uptime\/?$/i.test(path)) return 'uptime';
  return 'not-found';
}

function setBrowserPage(page, replace = false) {
  if (typeof window === 'undefined') return;
  let nextUrl = APP_BASE_PATH ? `${APP_BASE_PATH}/` : '/';
  if (page === 'signin') nextUrl = `${APP_BASE_PATH}/SignIn`;
  else if (page === 'tutorials') nextUrl = `${APP_BASE_PATH}/Tutorials`;
  else if (page === 'learn') nextUrl = `${APP_BASE_PATH}/Learn`;
  else if (page === 'puzzles') nextUrl = `${APP_BASE_PATH}/Puzzles`;
  else if (page === 'publish-puzzle') nextUrl = `${APP_BASE_PATH}/PublishPuzzle`;
  else if (page === 'game') nextUrl = `${APP_BASE_PATH}/Play`;
  else if (page === 'uptime') nextUrl = `${APP_BASE_PATH}/uptime`;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](null, '', nextUrl);
}

export function useAppNavigation(user) {
  const [currentPage, setCurrentPage] = useState(() => getPageFromLocation());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      setCurrentPage(getPageFromLocation());
    };

    window.addEventListener('popstate', handlePopState);
    setCurrentPage(getPageFromLocation());

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToPage = useCallback((page, replace = false) => {
    setCurrentPage(page);
    setBrowserPage(page, replace);
  }, []);

  useEffect(() => {
    if (user && currentPage === 'signin') {
      navigateToPage('game', true);
    }
  }, [currentPage, navigateToPage, user]);

  return { currentPage, navigateToPage, setCurrentPage };
}
