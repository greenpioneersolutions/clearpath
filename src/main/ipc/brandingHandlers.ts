import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrandingConfig {
  // Identity
  appName: string              // "ClearPathAI"
  appTagline: string           // "No code. No confusion. Just go."
  wordmarkParts: [string, string, string]  // ["Clear", "Path", "AI"]

  // Brand palette
  colorPrimary: string         // #5B4FC4 — compass bg, sidebar accents
  colorSecondary: string       // #7F77DD — "Path" in wordmark, highlights
  colorAccent: string          // #1D9E75 — "AI" in wordmark, success
  colorAccentLight: string     // #5DCAA5 — path line, beacon, active indicators
  colorNeural: string          // #85B7EB — neural nodes, info accents

  // UI palette
  colorButtonPrimary: string   // indigo-600 equivalent — primary buttons/links
  colorButtonHover: string     // indigo-500 equivalent
  colorSidebarBg: string       // sidebar background
  colorSidebarText: string     // sidebar text
  colorNavActive: string       // active nav link bg

  // Surface colors — Light mode
  lightPageBg: string          // main page background
  lightCardBg: string          // card/panel background
  lightBorder: string          // borders
  lightTextPrimary: string     // primary text
  lightTextSecondary: string   // secondary/muted text
  lightTextTertiary: string    // very faint text

  // Surface colors — Dark mode (chat area, modals, sidebar)
  darkPageBg: string           // dark page background
  darkCardBg: string           // dark card/panel background
  darkBorder: string           // dark borders
  darkTextPrimary: string      // primary text on dark
  darkTextSecondary: string    // secondary text on dark
  darkTextTertiary: string     // very faint text on dark

  // Mode preference
  colorMode: 'system' | 'light' | 'dark'

  // Logo
  useCustomLogo: boolean
  customLogoDataUrl: string | null   // base64 data URL for custom logo

  // Advanced
  borderRadius: 'rounded' | 'sharp' | 'pill'  // Global border-radius style
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_BRANDING: BrandingConfig = {
  appName: 'ClearPathAI',
  appTagline: 'No code. No confusion. Just go.',
  wordmarkParts: ['Clear', 'Path', 'AI'],

  colorPrimary: '#5B4FC4',
  colorSecondary: '#7F77DD',
  colorAccent: '#1D9E75',
  colorAccentLight: '#5DCAA5',
  colorNeural: '#85B7EB',

  colorButtonPrimary: '#4F46E5',   // indigo-600
  colorButtonHover: '#6366F1',     // indigo-500
  colorSidebarBg: '#111827',       // gray-900
  colorSidebarText: '#9CA3AF',     // gray-400
  colorNavActive: '#4F46E5',       // indigo-600

  // Light mode surfaces
  lightPageBg: '#F3F4F6',         // gray-100
  lightCardBg: '#FFFFFF',         // white
  lightBorder: '#E5E7EB',         // gray-200
  lightTextPrimary: '#111827',    // gray-900
  lightTextSecondary: '#6B7280',  // gray-500
  lightTextTertiary: '#9CA3AF',   // gray-400

  // Dark mode surfaces
  darkPageBg: '#111827',          // gray-900
  darkCardBg: '#1F2937',          // gray-800
  darkBorder: '#374151',          // gray-700
  darkTextPrimary: '#F9FAFB',     // gray-50
  darkTextSecondary: '#9CA3AF',   // gray-400
  darkTextTertiary: '#6B7280',    // gray-500

  colorMode: 'system',

  useCustomLogo: false,
  customLogoDataUrl: null,

  borderRadius: 'rounded',
}

// ── Presets ──────────────────────────────────────────────────────────────────

export interface BrandPreset {
  id: string
  name: string
  preview: string[]  // 3-5 hex colors for the preview swatch
  config: Partial<BrandingConfig>
}

const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'default',
    name: 'ClearPath Default',
    preview: ['#5B4FC4', '#1D9E75', '#111827', '#F3F4F6', '#FFFFFF'],
    config: {},
  },
  {
    id: 'midnight',
    name: 'Midnight',
    preview: ['#0F172A', '#6366F1', '#1E293B', '#F8FAFC', '#FFFFFF'],
    config: {
      colorPrimary: '#312E81',
      colorSecondary: '#818CF8',
      colorAccent: '#6366F1',
      colorAccentLight: '#A5B4FC',
      colorNeural: '#C7D2FE',
      colorButtonPrimary: '#6366F1',
      colorButtonHover: '#818CF8',
      colorSidebarBg: '#0F172A',
      colorSidebarText: '#94A3B8',
      colorNavActive: '#6366F1',
      lightPageBg: '#F8FAFC',
      lightCardBg: '#FFFFFF',
      lightBorder: '#E2E8F0',
      lightTextPrimary: '#0F172A',
      lightTextSecondary: '#64748B',
      lightTextTertiary: '#94A3B8',
      darkPageBg: '#0F172A',
      darkCardBg: '#1E293B',
      darkBorder: '#334155',
      darkTextPrimary: '#F1F5F9',
      darkTextSecondary: '#94A3B8',
      darkTextTertiary: '#64748B',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    preview: ['#14532D', '#22C55E', '#1A2E1A', '#F0FDF4', '#FFFFFF'],
    config: {
      colorPrimary: '#14532D',
      colorSecondary: '#4ADE80',
      colorAccent: '#22C55E',
      colorAccentLight: '#86EFAC',
      colorNeural: '#BBF7D0',
      colorButtonPrimary: '#16A34A',
      colorButtonHover: '#22C55E',
      colorSidebarBg: '#1A2E1A',
      colorSidebarText: '#86EFAC',
      colorNavActive: '#16A34A',
      lightPageBg: '#F0FDF4',
      lightCardBg: '#FFFFFF',
      lightBorder: '#DCFCE7',
      lightTextPrimary: '#14532D',
      lightTextSecondary: '#4D7C56',
      lightTextTertiary: '#86EFAC',
      darkPageBg: '#1A2E1A',
      darkCardBg: '#1E3A1E',
      darkBorder: '#2D5A2D',
      darkTextPrimary: '#ECFDF5',
      darkTextSecondary: '#86EFAC',
      darkTextTertiary: '#4ADE80',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    preview: ['#7C2D12', '#F97316', '#2A1A0E', '#FFF7ED', '#FFFFFF'],
    config: {
      colorPrimary: '#7C2D12',
      colorSecondary: '#FB923C',
      colorAccent: '#F97316',
      colorAccentLight: '#FDBA74',
      colorNeural: '#FED7AA',
      colorButtonPrimary: '#EA580C',
      colorButtonHover: '#F97316',
      colorSidebarBg: '#2A1A0E',
      colorSidebarText: '#FDBA74',
      colorNavActive: '#EA580C',
      lightPageBg: '#FFF7ED',
      lightCardBg: '#FFFFFF',
      lightBorder: '#FFEDD5',
      lightTextPrimary: '#431407',
      lightTextSecondary: '#9A3412',
      lightTextTertiary: '#C2410C',
      darkPageBg: '#2A1A0E',
      darkCardBg: '#3B2012',
      darkBorder: '#5C3418',
      darkTextPrimary: '#FFF7ED',
      darkTextSecondary: '#FDBA74',
      darkTextTertiary: '#FB923C',
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    preview: ['#4C0519', '#F43F5E', '#2A0E14', '#FFF1F2', '#FFFFFF'],
    config: {
      colorPrimary: '#881337',
      colorSecondary: '#FB7185',
      colorAccent: '#F43F5E',
      colorAccentLight: '#FDA4AF',
      colorNeural: '#FECDD3',
      colorButtonPrimary: '#E11D48',
      colorButtonHover: '#F43F5E',
      colorSidebarBg: '#2A0E14',
      colorSidebarText: '#FDA4AF',
      colorNavActive: '#E11D48',
      lightPageBg: '#FFF1F2',
      lightCardBg: '#FFFFFF',
      lightBorder: '#FFE4E6',
      lightTextPrimary: '#4C0519',
      lightTextSecondary: '#9F1239',
      lightTextTertiary: '#E11D48',
      darkPageBg: '#2A0E14',
      darkCardBg: '#3B1420',
      darkBorder: '#5C1D30',
      darkTextPrimary: '#FFF1F2',
      darkTextSecondary: '#FDA4AF',
      darkTextTertiary: '#FB7185',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    preview: ['#0C4A6E', '#0EA5E9', '#0A1929', '#F0F9FF', '#FFFFFF'],
    config: {
      colorPrimary: '#0C4A6E',
      colorSecondary: '#38BDF8',
      colorAccent: '#0EA5E9',
      colorAccentLight: '#7DD3FC',
      colorNeural: '#BAE6FD',
      colorButtonPrimary: '#0284C7',
      colorButtonHover: '#0EA5E9',
      colorSidebarBg: '#0A1929',
      colorSidebarText: '#7DD3FC',
      colorNavActive: '#0284C7',
      lightPageBg: '#F0F9FF',
      lightCardBg: '#FFFFFF',
      lightBorder: '#E0F2FE',
      lightTextPrimary: '#0C4A6E',
      lightTextSecondary: '#075985',
      lightTextTertiary: '#0284C7',
      darkPageBg: '#0A1929',
      darkCardBg: '#0F2744',
      darkBorder: '#1E3A5F',
      darkTextPrimary: '#F0F9FF',
      darkTextSecondary: '#7DD3FC',
      darkTextTertiary: '#38BDF8',
    },
  },
  {
    id: 'clean-blue',
    name: 'Clean Blue',
    preview: ['#1A3E6F', '#0D6EFD', '#0E2340', '#F4F7FA', '#FFFFFF'],
    config: {
      colorPrimary: '#1A3E6F',
      colorSecondary: '#4A90D9',
      colorAccent: '#0D6EFD',
      colorAccentLight: '#6EA8E5',
      colorNeural: '#B3D4F7',
      colorButtonPrimary: '#1A3E6F',
      colorButtonHover: '#245694',
      colorSidebarBg: '#0E2340',
      colorSidebarText: '#8FAEC8',
      colorNavActive: '#1A3E6F',
      lightPageBg: '#F4F7FA',
      lightCardBg: '#FFFFFF',
      lightBorder: '#D6E0EB',
      lightTextPrimary: '#0E2340',
      lightTextSecondary: '#3D5A80',
      lightTextTertiary: '#7A97B3',
      darkPageBg: '#0E2340',
      darkCardBg: '#162F52',
      darkBorder: '#264166',
      darkTextPrimary: '#EDF2F7',
      darkTextSecondary: '#8FAEC8',
      darkTextTertiary: '#4A90D9',
    },
  },
  {
    id: 'clean-green',
    name: 'Clean Green',
    preview: ['#4B8B3B', '#6DB33F', '#243B2A', '#F5F8F5', '#FFFFFF'],
    config: {
      colorPrimary: '#4B8B3B',
      colorSecondary: '#6DB33F',
      colorAccent: '#4B8B3B',
      colorAccentLight: '#8DC63F',
      colorNeural: '#C5E1A5',
      colorButtonPrimary: '#4B8B3B',
      colorButtonHover: '#5A9F47',
      colorSidebarBg: '#243B2A',
      colorSidebarText: '#A8C5AE',
      colorNavActive: '#4B8B3B',
      lightPageBg: '#F5F8F5',
      lightCardBg: '#FFFFFF',
      lightBorder: '#DCE8DC',
      lightTextPrimary: '#1A2E1D',
      lightTextSecondary: '#4A6950',
      lightTextTertiary: '#7D9A82',
      darkPageBg: '#243B2A',
      darkCardBg: '#2D4A34',
      darkBorder: '#3D6044',
      darkTextPrimary: '#EFF5F0',
      darkTextSecondary: '#A8C5AE',
      darkTextTertiary: '#6DB33F',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    preview: ['#1E293B', '#64748B', '#0F172A', '#F8FAFC', '#FFFFFF'],
    config: {
      colorPrimary: '#1E293B',
      colorSecondary: '#94A3B8',
      colorAccent: '#475569',
      colorAccentLight: '#CBD5E1',
      colorNeural: '#E2E8F0',
      colorButtonPrimary: '#475569',
      colorButtonHover: '#64748B',
      colorSidebarBg: '#0F172A',
      colorSidebarText: '#94A3B8',
      colorNavActive: '#475569',
      lightPageBg: '#F8FAFC',
      lightCardBg: '#FFFFFF',
      lightBorder: '#E2E8F0',
      lightTextPrimary: '#1E293B',
      lightTextSecondary: '#475569',
      lightTextTertiary: '#94A3B8',
      darkPageBg: '#0F172A',
      darkCardBg: '#1E293B',
      darkBorder: '#334155',
      darkTextPrimary: '#F1F5F9',
      darkTextSecondary: '#94A3B8',
      darkTextTertiary: '#64748B',
    },
  },
]

// ── Store ────────────────────────────────────────────────────────────────────

const store = new Store<{ branding: BrandingConfig }>({
  name: 'clear-path-branding',
  encryptionKey: getStoreEncryptionKey(),
  defaults: { branding: DEFAULT_BRANDING },
})

// ── Registration ─────────────────────────────────────────────────────────────

export function registerBrandingHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('branding:get', () => store.get('branding'))

  ipcMain.handle('branding:set', (_e, args: Partial<BrandingConfig>) => {
    const current = store.get('branding')
    const updated = { ...current, ...args }
    store.set('branding', updated)
    return updated
  })

  ipcMain.handle('branding:reset', () => {
    store.set('branding', DEFAULT_BRANDING)
    return DEFAULT_BRANDING
  })

  ipcMain.handle('branding:apply-preset', (_e, args: { presetId: string }) => {
    const preset = BRAND_PRESETS.find((p) => p.id === args.presetId)
    if (!preset) return { error: 'Unknown preset' }
    const updated = { ...DEFAULT_BRANDING, ...preset.config }
    store.set('branding', updated)
    return updated
  })

  ipcMain.handle('branding:get-presets', () => BRAND_PRESETS)
}
