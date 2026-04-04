import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrandingConfig {
  appName: string
  appTagline: string
  wordmarkParts: [string, string, string]

  colorPrimary: string
  colorSecondary: string
  colorAccent: string
  colorAccentLight: string
  colorNeural: string

  colorButtonPrimary: string
  colorButtonHover: string
  colorSidebarBg: string
  colorSidebarText: string
  colorNavActive: string

  lightPageBg: string
  lightCardBg: string
  lightBorder: string
  lightTextPrimary: string
  lightTextSecondary: string
  lightTextTertiary: string

  darkPageBg: string
  darkCardBg: string
  darkBorder: string
  darkTextPrimary: string
  darkTextSecondary: string
  darkTextTertiary: string

  colorMode: 'system' | 'light' | 'dark'

  useCustomLogo: boolean
  customLogoDataUrl: string | null

  borderRadius: 'rounded' | 'sharp' | 'pill'
}

interface BrandingContextValue {
  brand: BrandingConfig
  isDark: boolean
  updateBrand: (updates: Partial<BrandingConfig>) => Promise<void>
  resetBrand: () => Promise<void>
  applyPreset: (presetId: string) => Promise<void>
  loading: boolean
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT: BrandingConfig = {
  appName: 'ClearPathAI',
  appTagline: 'No code. No confusion. Just go.',
  wordmarkParts: ['Clear', 'Path', 'AI'],
  colorPrimary: '#5B4FC4',
  colorSecondary: '#7F77DD',
  colorAccent: '#1D9E75',
  colorAccentLight: '#5DCAA5',
  colorNeural: '#85B7EB',
  colorButtonPrimary: '#4F46E5',
  colorButtonHover: '#6366F1',
  colorSidebarBg: '#111827',
  colorSidebarText: '#9CA3AF',
  colorNavActive: '#4F46E5',
  lightPageBg: '#F3F4F6',
  lightCardBg: '#FFFFFF',
  lightBorder: '#E5E7EB',
  lightTextPrimary: '#111827',
  lightTextSecondary: '#6B7280',
  lightTextTertiary: '#9CA3AF',
  darkPageBg: '#111827',
  darkCardBg: '#1F2937',
  darkBorder: '#374151',
  darkTextPrimary: '#F9FAFB',
  darkTextSecondary: '#9CA3AF',
  darkTextTertiary: '#6B7280',
  colorMode: 'system',
  useCustomLogo: false,
  customLogoDataUrl: null,
  borderRadius: 'rounded',
}

// ── Context ──────────────────────────────────────────────────────────────────

const BrandingContext = createContext<BrandingContextValue>({
  brand: DEFAULT,
  isDark: false,
  updateBrand: async () => {},
  resetBrand: async () => {},
  applyPreset: async () => {},
  loading: true,
})

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext)
}

// ── Dark mode detection ──────────────────────────────────────────────────────

function getSystemDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function resolveIsDark(mode: 'system' | 'light' | 'dark'): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return getSystemDark()
}

// ── CSS variable injection ───────────────────────────────────────────────────

function applyCSS(brand: BrandingConfig, isDark: boolean): void {
  const root = document.documentElement

  // Brand identity colors (same in both modes)
  root.style.setProperty('--brand-primary', brand.colorPrimary)
  root.style.setProperty('--brand-secondary', brand.colorSecondary)
  root.style.setProperty('--brand-accent', brand.colorAccent)
  root.style.setProperty('--brand-accent-light', brand.colorAccentLight)
  root.style.setProperty('--brand-neural', brand.colorNeural)
  root.style.setProperty('--brand-btn-primary', brand.colorButtonPrimary)
  root.style.setProperty('--brand-btn-hover', brand.colorButtonHover)
  root.style.setProperty('--brand-sidebar-bg', brand.colorSidebarBg)
  root.style.setProperty('--brand-sidebar-text', brand.colorSidebarText)
  root.style.setProperty('--brand-nav-active', brand.colorNavActive)

  // Surface colors — resolved by current mode
  const page = isDark ? brand.darkPageBg : brand.lightPageBg
  const card = isDark ? brand.darkCardBg : brand.lightCardBg
  const border = isDark ? brand.darkBorder : brand.lightBorder
  const textPri = isDark ? brand.darkTextPrimary : brand.lightTextPrimary
  const textSec = isDark ? brand.darkTextSecondary : brand.lightTextSecondary
  const textTer = isDark ? brand.darkTextTertiary : brand.lightTextTertiary

  root.style.setProperty('--brand-page-bg', page)
  root.style.setProperty('--brand-card-bg', card)
  root.style.setProperty('--brand-border', border)
  root.style.setProperty('--brand-text-primary', textPri)
  root.style.setProperty('--brand-text-secondary', textSec)
  root.style.setProperty('--brand-text-tertiary', textTer)

  // Also set the explicit dark/light surface vars for components that need both
  root.style.setProperty('--brand-light-page', brand.lightPageBg)
  root.style.setProperty('--brand-light-card', brand.lightCardBg)
  root.style.setProperty('--brand-light-border', brand.lightBorder)
  root.style.setProperty('--brand-dark-page', brand.darkPageBg)
  root.style.setProperty('--brand-dark-card', brand.darkCardBg)
  root.style.setProperty('--brand-dark-border', brand.darkBorder)

  // Border radius
  const radiusMap = { rounded: '0.75rem', sharp: '0.25rem', pill: '9999px' }
  root.style.setProperty('--brand-radius', radiusMap[brand.borderRadius])

  // Toggle dark class on html element for Tailwind dark: variant support
  root.classList.toggle('dark', isDark)
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function BrandingProvider({ children }: { children: ReactNode }): JSX.Element {
  const [brand, setBrand] = useState<BrandingConfig>(DEFAULT)
  const [isDark, setIsDark] = useState(false)
  const [loading, setLoading] = useState(true)

  const applyAll = useCallback((b: BrandingConfig) => {
    const dark = resolveIsDark(b.colorMode)
    setIsDark(dark)
    applyCSS(b, dark)
  }, [])

  const load = useCallback(async () => {
    try {
      const result = await window.electronAPI.invoke('branding:get') as BrandingConfig
      setBrand(result)
      applyAll(result)
    } catch { /* use defaults */ }
    setLoading(false)
  }, [applyAll])

  useEffect(() => { void load() }, [load])

  // Listen for system dark mode changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (brand.colorMode === 'system') {
        const dark = getSystemDark()
        setIsDark(dark)
        applyCSS(brand, dark)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [brand])

  const updateBrand = useCallback(async (updates: Partial<BrandingConfig>) => {
    const result = await window.electronAPI.invoke('branding:set', updates) as BrandingConfig
    setBrand(result)
    applyAll(result)
  }, [applyAll])

  const resetBrand = useCallback(async () => {
    const result = await window.electronAPI.invoke('branding:reset') as BrandingConfig
    setBrand(result)
    applyAll(result)
  }, [applyAll])

  const applyPreset = useCallback(async (presetId: string) => {
    const result = await window.electronAPI.invoke('branding:apply-preset', { presetId }) as BrandingConfig
    setBrand(result)
    applyAll(result)
  }, [applyAll])

  return (
    <BrandingContext.Provider value={{ brand, isDark, updateBrand, resetBrand, applyPreset, loading }}>
      {children}
    </BrandingContext.Provider>
  )
}
