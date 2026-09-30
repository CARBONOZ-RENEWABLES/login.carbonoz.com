import { theme as antdTheme, ThemeConfig } from 'antd'
import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../lib/redux/store'

/** Current theme from the existing Redux theme slice (toggled by useTheme). */
export function useIsDark(): boolean {
  return useSelector((s: RootState) => s.theme.darkMode)
}

/** Concrete colours for SVG/Recharts attributes, which don't resolve CSS variables reliably. */
export function useChartTheme() {
  const dark = useIsDark()
  return useMemo(
    () =>
      dark
        ? { dark, grid: '#1a2335', axis: '#6b7690', cursor: '#3a4660', tooltipBg: '#0f1728', tooltipBorder: '#26324b', text: '#e8edf7' }
        : { dark, grid: '#e7ebf2', axis: '#7a869c', cursor: '#b8c2d4', tooltipBg: '#ffffff', tooltipBorder: '#dbe2ec', text: '#0c1424' },
    [dark],
  )
}

/** Energy colours shared by flow diagram, metric cards and charts. */
export const ENERGY = {
  solar: 'rgb(var(--c-solar))',
  battery: 'rgb(var(--c-batt))',
  grid: 'rgb(var(--c-gridp))',
  home: 'rgb(var(--c-home))',
}

/** Series colours (HomeOS palette), validated for contrast on both themes. */
export const SERIES = {
  pv: '#3fcf5e',
  load: '#8b5cf6',
  grid: '#f97316',
  soc: '#14b8a6',
  battPower: '#eab308',
  temp: '#f43f5e',
  tempAlt: '#fb923c',
  voltage: '#06b6d4',
  current: '#ec4899',
  export: '#10b981',
} as const

/** Ant Design tokens so existing antd forms, tables, selects and modals match the design system. */
export function antdThemeFor(dark: boolean): ThemeConfig {
  const c = dark
    ? { panel: '#0c1220', panel2: '#10182a', panel3: '#151e32', line: '#1a2336', lineStrong: '#243049', fg: '#eef2fa', muted: '#8a95ac', subtle: '#5b6680', accent: '#DEAF0B', ink: '#f0c43c', danger: '#f04b4b', ok: '#2fd46e', warn: '#fb7a2c' }
    : { panel: '#ffffff', panel2: '#f6f8fc', panel3: '#edf1f7', line: '#e2e7f0', lineStrong: '#d1d9e6', fg: '#0c1424', muted: '#5f6b82', subtle: '#8c97ab', accent: '#DEAF0B', ink: '#927000', danger: '#dc2626', ok: '#16a34a', warn: '#ea580c' }
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      fontSize: 13,
      colorPrimary: c.accent,
      colorInfo: c.ink,
      colorLink: c.ink,
      colorLinkHover: c.accent,
      colorSuccess: c.ok,
      colorWarning: c.warn,
      colorError: c.danger,
      colorText: c.fg,
      colorTextSecondary: c.muted,
      colorTextTertiary: c.subtle,
      colorTextPlaceholder: c.subtle,
      colorBgBase: c.panel,
      colorBgContainer: c.panel,
      colorBgElevated: c.panel,
      colorBgLayout: 'transparent',
      colorFillAlter: c.panel2,
      colorBorder: c.lineStrong,
      colorBorderSecondary: c.line,
      colorSplit: c.line,
      borderRadius: 8,
      borderRadiusLG: 12,
      borderRadiusSM: 6,
      controlHeight: 38,
      controlHeightLG: 42,
      controlHeightSM: 30,
      boxShadowSecondary: dark ? '0 24px 48px -16px rgb(0 0 0 / 0.6)' : '0 24px 48px -16px rgb(15 23 42 / 0.28)',
      motionDurationMid: '0.15s',
    },
    components: {
      Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', primaryColor: '#1a1402' },
      Input: { activeShadow: '0 0 0 3px rgb(222 175 11 / 0.22)', paddingInline: 12 },
      Select: { optionSelectedBg: 'rgb(222 175 11 / 0.16)', optionActiveBg: c.panel3 },
      Table: { headerBg: c.panel2, headerColor: c.muted, rowHoverBg: c.panel2, borderColor: c.line, headerSplitColor: 'transparent' },
      Modal: { contentBg: c.panel, headerBg: c.panel, titleFontSize: 16 },
      Drawer: { colorBgElevated: c.panel },
      Steps: { colorPrimary: c.accent },
      Tabs: { itemSelectedColor: c.fg, inkBarColor: c.accent },
      Pagination: { itemActiveBg: 'rgb(222 175 11 / 0.14)' },
      Form: { labelColor: c.muted, verticalLabelPadding: '0 0 4px' },
      Notification: { width: 360 },
    },
  }
}
