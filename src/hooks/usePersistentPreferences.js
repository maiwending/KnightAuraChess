import { useCallback, useEffect, useMemo, useState } from 'react';
import { themeToVars } from '../components/ThemeCreator.jsx';

const BOARD_VIEW_MODES = ['flat', 'realistic'];

export const BASE_THEMES = [
  { key: 'classic', label: 'Classic', l: 'swatch-classic-light', d: 'swatch-classic-dark' },
  { key: 'slate', label: 'Slate', l: 'swatch-slate-light', d: 'swatch-slate-dark' },
  { key: 'rosewood', label: 'Rosewood', l: 'swatch-rosewood-light', d: 'swatch-rosewood-dark' },
];

function getInitialBoardView() {
  const savedBoardView = localStorage.getItem('cr_board_view');
  if (savedBoardView === '3d') return 'realistic';
  if (BOARD_VIEW_MODES.includes(savedBoardView)) return savedBoardView;
  return localStorage.getItem('cr_3d') === 'true' ? 'realistic' : 'flat';
}

function getInitialBoardCornerRadius() {
  const savedRadius = Number.parseInt(localStorage.getItem('cr_board_corner_radius') || '', 10);
  if (Number.isFinite(savedRadius)) {
    return Math.min(24, Math.max(0, savedRadius));
  }
  return 8;
}

export function usePersistentPreferences() {
  const [theme, setTheme] = useState(() => localStorage.getItem('cr_theme') || 'classic');
  const [customThemes, setCustomThemes] = useState(
    () => JSON.parse(localStorage.getItem('cr_custom_themes') || '[]')
  );
  const [showThemeCreator, setShowThemeCreator] = useState(false);
  const [boardView, setBoardView] = useState(() => getInitialBoardView());
  const [boardCornerRadius, setBoardCornerRadius] = useState(() => getInitialBoardCornerRadius());
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('cr_dark') !== 'false');
  const [pieceStyle, setPieceStyle] = useState('svg');
  const [showEmpoweredMarks, setShowEmpoweredMarks] = useState(
    () => localStorage.getItem('cr_empowered_marks') !== 'false'
  );
  const [seasonalDecorations, setSeasonalDecorations] = useState(
    () => localStorage.getItem('cr_seasonal_decorations') !== 'false'
  );
  const [seasonalDecorationDensity, setSeasonalDecorationDensity] = useState(() => {
    const raw = Number.parseInt(localStorage.getItem('cr_seasonal_decoration_density') || '100', 10);
    if (Number.isNaN(raw)) return 100;
    return Math.min(180, Math.max(20, raw));
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('cr_dark', darkMode ? 'true' : 'false');
  }, [darkMode]);

  useEffect(() => { localStorage.setItem('cr_theme', theme); }, [theme]);
  useEffect(() => {
    localStorage.setItem('cr_board_view', boardView);
    localStorage.setItem('cr_3d', boardView === 'realistic' ? 'true' : 'false');
  }, [boardView]);
  useEffect(() => {
    localStorage.setItem('cr_board_corner_radius', String(boardCornerRadius));
  }, [boardCornerRadius]);
  useEffect(() => {
    localStorage.setItem('cr_empowered_marks', showEmpoweredMarks ? 'true' : 'false');
  }, [showEmpoweredMarks]);
  useEffect(() => {
    localStorage.setItem('cr_seasonal_decorations', seasonalDecorations ? 'true' : 'false');
  }, [seasonalDecorations]);
  useEffect(() => {
    localStorage.setItem('cr_seasonal_decoration_density', String(seasonalDecorationDensity));
  }, [seasonalDecorationDensity]);

  const customThemeVars = useMemo(() => {
    if (!theme.startsWith('custom:')) return null;
    const id = theme.slice(7);
    const ct = customThemes.find((t) => t.id === id);
    return ct ? themeToVars(ct) : null;
  }, [theme, customThemes]);

  const saveCustomTheme = useCallback((themeData) => {
    const newTheme = { ...themeData, id: Date.now().toString() };
    const updated = [...customThemes, newTheme];
    setCustomThemes(updated);
    localStorage.setItem('cr_custom_themes', JSON.stringify(updated));
    setTheme(`custom:${newTheme.id}`);
    setShowThemeCreator(false);
  }, [customThemes]);

  const deleteCustomTheme = useCallback((id) => {
    const updated = customThemes.filter((ct) => ct.id !== id);
    setCustomThemes(updated);
    localStorage.setItem('cr_custom_themes', JSON.stringify(updated));
    if (theme === `custom:${id}`) setTheme('classic');
  }, [customThemes, theme]);

  return {
    theme,
    setTheme,
    customThemes,
    setCustomThemes,
    showThemeCreator,
    setShowThemeCreator,
    boardView,
    setBoardView,
    board3d: boardView === 'realistic',
    boardCornerRadius,
    setBoardCornerRadius,
    darkMode,
    setDarkMode,
    pieceStyle,
    setPieceStyle,
    showEmpoweredMarks,
    setShowEmpoweredMarks,
    seasonalDecorations,
    setSeasonalDecorations,
    seasonalDecorationDensity,
    setSeasonalDecorationDensity,
    customThemeVars,
    saveCustomTheme,
    deleteCustomTheme,
  };
}
