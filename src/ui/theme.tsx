import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

/**
 * Paleta tomada del mockup HTML V18 y extendida con una variante oscura
 * para que la app se vea bien de noche en campa.
 */
const light = {
  mode: 'light' as const,
  bg: '#f3f6f7',
  surface: '#ffffff',
  surfaceAlt: '#f6f9f9',
  surfaceSunken: '#eef3f4',
  border: '#e0e7e9',
  borderSoft: '#e9edef',
  text: '#18272d',
  textMuted: '#6e8087',
  textFaint: '#74858b',

  navBg: '#10262d',
  navText: '#cbd9dc',
  navTextActive: '#ffffff',
  navActiveBg: '#21434c',
  navGroup: '#718f95',
  navBrandSub: '#89aaaf',

  primary: '#1e9d82',
  primaryText: '#ffffff',
  accent: '#2fb899',

  okBg: '#e5f7f2',
  okFg: '#168a70',
  amberBg: '#fff1d9',
  amberFg: '#9b6a13',
  redBg: '#ffe8ea',
  redFg: '#bb3d49',
  blueBg: '#e7f0ff',
  blueFg: '#3267a8',

  noticeBg: '#f3f7f7',
  noticeWarnBg: '#fff5e4',
  noticeDangerBg: '#ffedef',
  noteBg: '#edf7f5',
  noteBorder: '#c9e8e0',

  checkDoneBg: '#effaf7',
  checkDoneBorder: '#bce8dd',
  checkPendingBg: '#fff6e7',
  checkPendingBorder: '#efd49c',

  trackBg: '#e8edef',
  codeBg: '#172a30',
  codeFg: '#d9e8eb',
  overlay: 'rgba(0,0,0,0.55)',
};

const dark: typeof light = {
  ...light,
  mode: 'dark' as unknown as 'light',
  bg: '#0b171b',
  surface: '#12252b',
  surfaceAlt: '#162c33',
  surfaceSunken: '#0f2027',
  border: '#203a42',
  borderSoft: '#1b333a',
  text: '#e6eff1',
  textMuted: '#93a9af',
  textFaint: '#7f959b',

  navBg: '#08161a',
  navActiveBg: '#1c3b44',

  okBg: '#123a32',
  okFg: '#5fd7ba',
  amberBg: '#3d2f11',
  amberFg: '#f0c065',
  redBg: '#40191e',
  redFg: '#f2919b',
  blueBg: '#152a45',
  blueFg: '#8fb6ee',

  noticeBg: '#132a30',
  noticeWarnBg: '#33280f',
  noticeDangerBg: '#38181d',
  noteBg: '#102f2a',
  noteBorder: '#1d4f47',

  checkDoneBg: '#0f2f2a',
  checkDoneBorder: '#1e5a4d',
  checkPendingBg: '#332a12',
  checkPendingBorder: '#5f4c1c',

  trackBg: '#1c333a',
  codeBg: '#061014',
  codeFg: '#bcd6db',
  overlay: 'rgba(0,0,0,0.7)',
};

export type Colors = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 7, md: 9, lg: 12, xl: 20, pill: 999 };

/** Punto a partir del cual mostramos el menú lateral fijo (modo escritorio). */
export const DESKTOP_BREAKPOINT = 900;
/** Punto a partir del cual las rejillas pasan de 2 a más columnas. */
export const WIDE_BREAKPOINT = 1200;

type ThemeValue = {
  c: Colors;
  isDark: boolean;
  width: number;
  isDesktop: boolean;
  isWide: boolean;
  /** Nº de columnas para rejillas de tarjetas/KPI. */
  gridCols: number;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const { width } = useWindowDimensions();
  const isDark = scheme === 'dark';

  const value = useMemo<ThemeValue>(() => {
    const isDesktop = width >= DESKTOP_BREAKPOINT;
    const isWide = width >= WIDE_BREAKPOINT;
    return {
      c: isDark ? dark : light,
      isDark,
      width,
      isDesktop,
      isWide,
      gridCols: isWide ? 6 : isDesktop ? 3 : 2,
    };
  }, [isDark, width]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return v;
}
