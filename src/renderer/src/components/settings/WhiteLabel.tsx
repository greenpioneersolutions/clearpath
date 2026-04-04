import { useState, useEffect } from 'react'
import { useBranding, type BrandingConfig } from '../../contexts/BrandingContext'

// ── Types ────────────────────────────────────────────────────────────────────

interface BrandPreset {
  id: string
  name: string
  preview: string[]
}

// ── Color picker helper ──────────────────────────────────────────────────────

function ColorField({ label, value, onChange, description }: {
  label: string; value: string; onChange: (v: string) => void; description?: string
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700">{label}</span>
          <code className="text-[10px] text-gray-400 font-mono">{value}</code>
        </div>
        {description && <p className="text-[10px] text-gray-400">{description}</p>}
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WhiteLabel(): JSX.Element {
  const { brand, updateBrand, resetBrand, applyPreset } = useBranding()
  const [presets, setPresets] = useState<BrandPreset[]>([])
  const [section, setSection] = useState<'presets' | 'identity' | 'colors' | 'ui' | 'surfaces' | 'preview'>('presets')

  useEffect(() => {
    void (window.electronAPI.invoke('branding:get-presets') as Promise<BrandPreset[]>).then(setPresets)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">White Label</h1>
        <p className="text-sm text-gray-500 mt-1">
          Customize the app's branding — colors, name, logo, and look. Changes apply instantly across the entire app.
        </p>
      </div>

      {/* Section tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {([
            ['presets', 'Theme Presets'],
            ['identity', 'Identity'],
            ['colors', 'Brand Colors'],
            ['ui', 'UI Colors'],
            ['surfaces', 'Surfaces & Mode'],
            ['preview', 'Preview'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setSection(key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                section === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Presets ────────────────────────────────────────────────────────── */}
      {section === 'presets' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {presets.map((preset) => (
              <button key={preset.id} onClick={() => void applyPreset(preset.id)}
                className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all">
                <div className="flex gap-1 mb-2">
                  {preset.preview.map((hex, i) => (
                    <div key={i} className="w-6 h-6 rounded-md" style={{ backgroundColor: hex }} />
                  ))}
                </div>
                <span className="text-xs font-semibold text-gray-800">{preset.name}</span>
              </button>
            ))}
          </div>
          <button onClick={() => void resetBrand()}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            Reset to Default
          </button>
        </div>
      )}

      {/* ── Identity ───────────────────────────────────────────────────────── */}
      {section === 'identity' && (
        <div className="space-y-5 max-w-lg">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">App Name</label>
            <input type="text" value={brand.appName}
              onChange={(e) => void updateBrand({ appName: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tagline</label>
            <input type="text" value={brand.appTagline}
              onChange={(e) => void updateBrand({ appTagline: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Wordmark Parts</label>
            <p className="text-[10px] text-gray-400 mb-2">The three parts of the wordmark, each styled with a different color.</p>
            <div className="grid grid-cols-3 gap-2">
              {brand.wordmarkParts.map((part, i) => (
                <div key={i}>
                  <label className="block text-[10px] text-gray-400 mb-0.5">
                    {i === 0 ? 'Part 1 (white)' : i === 1 ? 'Part 2 (secondary)' : 'Part 3 (accent)'}
                  </label>
                  <input type="text" value={part}
                    onChange={(e) => {
                      const next = [...brand.wordmarkParts] as [string, string, string]
                      next[i] = e.target.value
                      void updateBrand({ wordmarkParts: next })
                    }}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              ))}
            </div>
            {/* Live preview */}
            <div className="mt-3 bg-gray-900 rounded-lg px-4 py-2.5 inline-flex items-center gap-1">
              <span className="font-semibold text-sm text-white">{brand.wordmarkParts[0]}</span>
              <span className="font-semibold text-sm" style={{ color: brand.colorSecondary }}>{brand.wordmarkParts[1]}</span>
              <span className="font-semibold text-sm" style={{ color: brand.colorAccent }}>{brand.wordmarkParts[2]}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Custom Logo</label>
            <p className="text-[10px] text-gray-400 mb-2">Upload a PNG or SVG to replace the compass icon. Recommended: 32x32 or 64x64.</p>
            <div className="flex items-center gap-3">
              {brand.customLogoDataUrl ? (
                <img src={brand.customLogoDataUrl} alt="Logo" className="w-10 h-10 rounded-lg border border-gray-300 object-contain" />
              ) : (
                <div className="w-10 h-10 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">
                  None
                </div>
              )}
              <label className="px-3 py-1.5 text-xs text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors">
                Upload
                <input type="file" accept="image/png,image/svg+xml" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      void updateBrand({ useCustomLogo: true, customLogoDataUrl: reader.result as string })
                    }
                    reader.readAsDataURL(file)
                  }} />
              </label>
              {brand.useCustomLogo && (
                <button onClick={() => void updateBrand({ useCustomLogo: false, customLogoDataUrl: null })}
                  className="text-xs text-red-500 hover:text-red-400">Remove</button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Border Radius Style</label>
            <div className="flex gap-2">
              {(['sharp', 'rounded', 'pill'] as const).map((r) => (
                <button key={r} onClick={() => void updateBrand({ borderRadius: r })}
                  className={`px-4 py-2 text-xs font-medium border transition-colors capitalize ${
                    brand.borderRadius === r
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                  style={{ borderRadius: r === 'sharp' ? '4px' : r === 'rounded' ? '8px' : '9999px' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Brand Colors ───────────────────────────────────────────────────── */}
      {section === 'colors' && (
        <div className="space-y-4 max-w-lg">
          <p className="text-xs text-gray-500">
            These are the core brand identity colors used in the logo, compass, wordmark, and accent highlights.
          </p>
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <ColorField label="Primary" value={brand.colorPrimary}
              onChange={(v) => void updateBrand({ colorPrimary: v })}
              description="Compass background, sidebar brand accents" />
            <ColorField label="Secondary" value={brand.colorSecondary}
              onChange={(v) => void updateBrand({ colorSecondary: v })}
              description="Wordmark middle part, secondary highlights" />
            <ColorField label="Accent" value={brand.colorAccent}
              onChange={(v) => void updateBrand({ colorAccent: v })}
              description="Wordmark end part, success states" />
            <ColorField label="Accent Light" value={brand.colorAccentLight}
              onChange={(v) => void updateBrand({ colorAccentLight: v })}
              description="Path line, compass beacon, active indicators" />
            <ColorField label="Neural" value={brand.colorNeural}
              onChange={(v) => void updateBrand({ colorNeural: v })}
              description="Neural network nodes, informational accents" />
          </div>

          {/* Swatch preview */}
          <div className="flex gap-2">
            {[brand.colorPrimary, brand.colorSecondary, brand.colorAccent, brand.colorAccentLight, brand.colorNeural].map((hex, i) => (
              <div key={i} className="flex-1 h-12 rounded-lg" style={{ backgroundColor: hex }} />
            ))}
          </div>
        </div>
      )}

      {/* ── UI Colors ──────────────────────────────────────────────────────── */}
      {section === 'ui' && (
        <div className="space-y-4 max-w-lg">
          <p className="text-xs text-gray-500">
            These control the interactive elements — buttons, nav links, sidebar chrome.
          </p>
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <ColorField label="Button Primary" value={brand.colorButtonPrimary}
              onChange={(v) => void updateBrand({ colorButtonPrimary: v, colorNavActive: v })}
              description="Primary buttons, active nav links, and action highlights" />
            <ColorField label="Button Hover" value={brand.colorButtonHover}
              onChange={(v) => void updateBrand({ colorButtonHover: v })}
              description="Button hover state" />
            <ColorField label="Sidebar Background" value={brand.colorSidebarBg}
              onChange={(v) => void updateBrand({ colorSidebarBg: v, darkPageBg: v })}
              description="Sidebar and dark panel background — also sets the Work page and chat area background" />
            <ColorField label="Sidebar Text" value={brand.colorSidebarText}
              onChange={(v) => void updateBrand({ colorSidebarText: v })}
              description="Default sidebar text and icon color" />
            <ColorField label="Nav Active" value={brand.colorNavActive}
              onChange={(v) => void updateBrand({ colorNavActive: v })}
              description="Active navigation link highlight" />
          </div>
        </div>
      )}

      {/* ── Surfaces & Mode ──────────────────────────────────────────────── */}
      {section === 'surfaces' && (
        <div className="space-y-6 max-w-lg">
          {/* Color mode toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Color Mode</label>
            <p className="text-[10px] text-gray-400 mb-3">
              Controls whether the app uses light or dark surfaces. "System" follows your computer's display settings automatically.
            </p>
            <div className="flex gap-2">
              {(['system', 'light', 'dark'] as const).map((mode) => (
                <button key={mode} onClick={() => void updateBrand({ colorMode: mode })}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all capitalize ${
                    brand.colorMode === mode
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {mode === 'system' ? 'System (Auto)' : mode}
                </button>
              ))}
            </div>
          </div>

          {/* Light mode surface colors */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Light Mode Surfaces</h3>
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <ColorField label="Page Background" value={brand.lightPageBg}
                onChange={(v) => void updateBrand({ lightPageBg: v })}
                description="Main background behind all content" />
              <ColorField label="Card Background" value={brand.lightCardBg}
                onChange={(v) => void updateBrand({ lightCardBg: v })}
                description="Panels, cards, modals in light mode" />
              <ColorField label="Border" value={brand.lightBorder}
                onChange={(v) => void updateBrand({ lightBorder: v })}
                description="Borders and dividers in light mode" />
              <ColorField label="Primary Text" value={brand.lightTextPrimary}
                onChange={(v) => void updateBrand({ lightTextPrimary: v })}
                description="Headings and body text" />
              <ColorField label="Secondary Text" value={brand.lightTextSecondary}
                onChange={(v) => void updateBrand({ lightTextSecondary: v })}
                description="Descriptions and labels" />
              <ColorField label="Tertiary Text" value={brand.lightTextTertiary}
                onChange={(v) => void updateBrand({ lightTextTertiary: v })}
                description="Hints and placeholders" />
            </div>
          </div>

          {/* Dark mode surface colors */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Dark Mode Surfaces</h3>
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <ColorField label="Page Background" value={brand.darkPageBg}
                onChange={(v) => void updateBrand({ darkPageBg: v })}
                description="Chat area, sidebar, dark panels" />
              <ColorField label="Card Background" value={brand.darkCardBg}
                onChange={(v) => void updateBrand({ darkCardBg: v })}
                description="Message bubbles, inputs, dark cards" />
              <ColorField label="Border" value={brand.darkBorder}
                onChange={(v) => void updateBrand({ darkBorder: v })}
                description="Borders and dividers in dark mode" />
              <ColorField label="Primary Text" value={brand.darkTextPrimary}
                onChange={(v) => void updateBrand({ darkTextPrimary: v })}
                description="Headings and body text on dark" />
              <ColorField label="Secondary Text" value={brand.darkTextSecondary}
                onChange={(v) => void updateBrand({ darkTextSecondary: v })}
                description="Descriptions on dark backgrounds" />
              <ColorField label="Tertiary Text" value={brand.darkTextTertiary}
                onChange={(v) => void updateBrand({ darkTextTertiary: v })}
                description="Hints and timestamps on dark" />
            </div>
          </div>
        </div>
      )}

      {/* ── Live Preview ───────────────────────────────────────────────────── */}
      {section === 'preview' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Live preview of your branding. The sidebar and key elements update in real-time as you change settings.
          </p>

          {/* Mini app preview */}
          <div className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden" style={{ height: '400px' }}>
            <div className="flex h-full">
              {/* Mini sidebar */}
              <div className="w-48 flex flex-col" style={{ backgroundColor: brand.colorSidebarBg }}>
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: brand.colorPrimary }}>
                      <span className="text-white text-xs">C</span>
                    </div>
                    <span className="text-xs font-semibold">
                      <span className="text-white">{brand.wordmarkParts[0]}</span>
                      <span style={{ color: brand.colorSecondary }}>{brand.wordmarkParts[1]}</span>
                      <span style={{ color: brand.colorAccent }}>{brand.wordmarkParts[2]}</span>
                    </span>
                  </div>
                </div>
                <div className="px-2 space-y-0.5 flex-1">
                  {['Home', 'Work', 'Insights', 'Configure'].map((item, i) => (
                    <div key={item} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                      style={i === 0 ? { backgroundColor: brand.colorNavActive + '20', color: '#fff' } : { color: brand.colorSidebarText }}>
                      <div className="w-3.5 h-3.5 rounded bg-current opacity-40" />
                      {item}
                    </div>
                  ))}
                </div>
                <div className="p-3" style={{ color: brand.colorSidebarText }}>
                  <p className="text-[9px] opacity-50">{brand.appTagline}</p>
                </div>
              </div>

              {/* Mini content */}
              <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                <h2 className="text-lg font-bold text-gray-900">{brand.appName}</h2>
                <div className="flex gap-2">
                  <button className="px-4 py-2 text-xs text-white rounded-lg font-medium"
                    style={{ backgroundColor: brand.colorButtonPrimary }}>
                    Primary Button
                  </button>
                  <button className="px-4 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg">
                    Secondary
                  </button>
                </div>

                {/* Color swatch row */}
                <div className="flex gap-2 pt-2">
                  {[
                    { label: 'Primary', color: brand.colorPrimary },
                    { label: 'Secondary', color: brand.colorSecondary },
                    { label: 'Accent', color: brand.colorAccent },
                    { label: 'Light', color: brand.colorAccentLight },
                    { label: 'Neural', color: brand.colorNeural },
                  ].map(({ label, color }) => (
                    <div key={label} className="text-center">
                      <div className="w-12 h-12 rounded-xl mx-auto" style={{ backgroundColor: color }} />
                      <p className="text-[9px] text-gray-500 mt-1">{label}</p>
                      <p className="text-[8px] text-gray-400 font-mono">{color}</p>
                    </div>
                  ))}
                </div>

                {/* Status badges */}
                <div className="flex gap-2 pt-2">
                  <span className="px-2.5 py-1 text-[10px] text-white rounded-full font-medium" style={{ backgroundColor: brand.colorAccent }}>
                    Success
                  </span>
                  <span className="px-2.5 py-1 text-[10px] text-white rounded-full font-medium" style={{ backgroundColor: brand.colorPrimary }}>
                    Active
                  </span>
                  <span className="px-2.5 py-1 text-[10px] rounded-full font-medium" style={{ backgroundColor: brand.colorNeural + '30', color: brand.colorNeural }}>
                    Info
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
