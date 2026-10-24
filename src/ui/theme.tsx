import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

/**
 * Paleta de la marca: azul Easo (el del símbolo, `#007AC0`) y azul marino
 * para el menú.
 *
 * Antes era la verde del primer mockup y no casaba con el logotipo: era lo
 * primero que delataba que aquello no estaba terminado. El color va solo
 * donde significa algo —rojo, incidencia; ámbar, ojo con el plazo; verde,
 * está bien— y lo demás son grises azulados. Todos los textos cumplen 4,5:1
 * sobre su fondo.
 */
const light = {
  mode: 'light' as const,
  bg: '#f4f6f9',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  surfaceSunken: '#eef2f6',
  border: '#e3e8ee',
  borderSoft: '#edf1f5',
  text: '#0f1e2b',
  textMuted: '#5b6b7b',
  textFaint: '#66788a',

  navBg: '#0e2233',
  navText: '#c9d4df',
  navTextActive: '#ffffff',
  navActiveBg: '#17344b',
  navGroup: '#7f94a8',
  navBrandSub: '#8fa3b6',

  primary: '#007ac0',
  primaryText: '#ffffff',
  accent: '#2e9be0',

  okBg: '#e6f4ec',
  okFg: '#1f7a4d',
  amberBg: '#fdf3dd',
  amberFg: '#8a5300',
  redBg: '#fdecea',
  redFg: '#b42318',
  blueBg: '#e8f3fb',
  blueFg: '#00588c',

  noticeBg: '#f1f5f9',
  noticeWarnBg: '#fdf3dd',
  noticeDangerBg: '#fdecea',
  noteBg: '#e8f3fb',
  noteBorder: '#c3dff2',

  checkDoneBg: '#eef8f2',
  checkDoneBorder: '#b9e0c8',
  checkPendingBg: '#fef7e8',
  checkPendingBorder: '#efd49c',

  trackBg: '#e6ebf0',
  codeBg: '#0e2233',
  codeFg: '#d6e2ec',
  overlay: 'rgba(8,20,30,0.55)',
};

const dark: typeof light = {
  ...light,
  mode: 'dark' as unknown as 'light',
  bg: '#0a1520',
  surface: '#111f2c',
  surfaceAlt: '#152637',
  surfaceSunken: '#0d1a26',
  border: '#22364a',
  borderSoft: '#1a2d3f',
  text: '#e6eef5',
  textMuted: '#97aabb',
  textFaint: '#8497a9',

  navBg: '#07111b',
  navActiveBg: '#16314a',

  primary: '#2e9be0',
  primaryText: '#04121d',
  accent: '#5bb4ec',

  okBg: '#12352a',
  okFg: '#6fd3a1',
  amberBg: '#3a2c10',
  amberFg: '#f0c065',
  redBg: '#3f1a1a',
  redFg: '#f4a19a',
  blueBg: '#122b42',
  blueFg: '#8cc8f0',

  noticeBg: '#132536',
  noticeWarnBg: '#33280f',
  noticeDangerBg: '#38181d',
  noteBg: '#122b42',
  noteBorder: '#1f4a6e',

  checkDoneBg: '#10302a',
  checkDoneBorder: '#1e5a44',
  checkPendingBg: '#332a12',
  checkPendingBorder: '#5f4c1c',

  trackBg: '#1c3043',
  codeBg: '#050d14',
  codeFg: '#bcd2e3',
  overlay: 'rgba(0,0,0,0.7)',
};

export type Colors = typeof light;

/**
 * La escala de letra.
 *
 * Existe porque no existía: había 222 tamaños escritos a mano por las
 * pantallas, nueve valores distintos, y los dos más usados eran 11 y 12
 * píxeles. Dos problemas de golpe: letra pequeña para leer un móvil con
 * guantes y con sol de cara, y ningún sitio donde subirla toda a la vez.
 *
 * Ocho tamaños con nombre, y el nombre dice **para qué sirve**, no cuánto
 * mide: así una pantalla de campo puede elegir `body` donde una tabla de
 * oficina elige `small`, sin inventarse números.
 *
 * El mínimo de la casa es 11. Por debajo de eso no se escribe nada.
 */
export const tipografia = {
  /** Etiquetas en mayúsculas dentro de una tarjeta: COMERCIAL, ENTREGA… */
  label: 11,
  /** Pies de tarjeta y detalles de tercera línea. */
  micro: 12,
  /** Texto secundario: la marca y el modelo debajo de la matrícula. */
  small: 13,
  /** Texto normal, y el mínimo de las pantallas de campo. */
  body: 14,
  /** Lo que hay que leer de un vistazo, sin acercarse el móvil. */
  strong: 16,
  /** Título de una tarjeta. */
  heading: 18,
  /** Título de sección. */
  title: 22,
  /** Título de pantalla. */
  display: 26,
};

/**
 * La misma escala, un punto por encima, para las pantallas de campo.
 *
 * «Mi preparación», «Mover coche», «Mis traslados» y «Descargar camión» no
 * se usan sentado en una oficina: se usan de pie, con guantes, con el móvil
 * a un palmo y a veces con el sol de cara. Ahí la letra de una tabla de
 * escritorio no vale.
 *
 * Son los mismos nombres a propósito: una pantalla de campo escribe
 * `campo.small` donde una de oficina escribe `tipografia.small`, y no hay
 * que decidir números en cada sitio.
 */
export const campo = {
  label: 12,
  micro: 13,
  small: 15,
  body: 16,
  strong: 18,
  heading: 20,
  title: 24,
  display: 28,
};

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
