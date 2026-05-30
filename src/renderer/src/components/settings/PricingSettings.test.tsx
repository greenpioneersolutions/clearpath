// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'
import PricingSettings from './PricingSettings'
import { PricingProvider } from '../../contexts/PricingContext'

/**
 * Build an `pricing:get-effective` payload for the test mock. Defaults to a
 * subset that covers the three providers — keeps test output readable vs.
 * shipping all 22 real models on every assertion.
 */
function effectiveFixture(overrides?: Record<string, { input: number; output: number; source?: string; aliasOf?: string }>) {
  const baseline = {
    'claude-sonnet-4.5': { input: 3,   output: 15,  provider: 'anthropic', source: 'default' },
    'claude-opus-4.5':   { input: 5,   output: 25,  provider: 'anthropic', source: 'default' },
    'sonnet':            { input: 3,   output: 15,  provider: 'anthropic', source: 'default', aliasOf: 'claude-sonnet-4.5' },
    'gpt-5':             { input: 5,   output: 15,  provider: 'openai',    source: 'default' },
    'gpt-5-mini':        { input: 0.4, output: 1.6, provider: 'openai',    source: 'default' },
    'gemini-3-pro':      { input: 3.5, output: 10.5,provider: 'google',    source: 'default' },
  }
  if (overrides) {
    for (const [id, patch] of Object.entries(overrides)) {
      const existing = (baseline as Record<string, unknown>)[id] as Record<string, unknown> | undefined
      ;(baseline as Record<string, unknown>)[id] = {
        ...(existing ?? { provider: 'anthropic' }),
        ...patch,
      }
    }
  }
  return { lastUpdated: 'test', source: 'test', models: baseline }
}

function renderWithProvider(ui: React.ReactElement) {
  return render(<PricingProvider>{ui}</PricingProvider>)
}

beforeEach(() => {
  setupElectronAPI({
    'pricing:get-effective': effectiveFixture(),
    'pricing:get-settings': {
      remoteSyncEnabled: false,
      remoteUrl: '',
      lastSyncAt: null,
      lastSyncError: null,
    },
    'pricing:set-override': null,
    'pricing:clear-override': null,
    'pricing:set-settings': null,
    'pricing:sync-now': { ok: true, syncedAt: 0 },
  })
})

describe('PricingSettings', () => {
  it('renders the header and a row per model, grouped by provider', async () => {
    renderWithProvider(<PricingSettings />)
    expect(screen.getByText('Cost & Pricing')).toBeInTheDocument()
    // Wait for the effective table to load via PricingContext.
    await waitFor(() => {
      expect(screen.getByTestId('pricing-table-anthropic')).toBeInTheDocument()
    })
    expect(screen.getByTestId('pricing-table-openai')).toBeInTheDocument()
    expect(screen.getByTestId('pricing-table-google')).toBeInTheDocument()
    // Specific rows render.
    expect(screen.getByTestId('pricing-row-claude-sonnet-4.5')).toBeInTheDocument()
    expect(screen.getByTestId('pricing-row-gpt-5')).toBeInTheDocument()
    expect(screen.getByTestId('pricing-row-gemini-3-pro')).toBeInTheDocument()
  })

  it('shows the source badge for each row', async () => {
    setupElectronAPI({
      'pricing:get-effective': effectiveFixture({
        'gpt-5-mini': { input: 0, output: 0, source: 'included' },
        'claude-opus-4.5': { input: 6, output: 30, source: 'override' },
      }),
      'pricing:get-settings': { remoteSyncEnabled: false, remoteUrl: '', lastSyncAt: null, lastSyncError: null },
    })
    renderWithProvider(<PricingSettings />)
    await waitFor(() => {
      expect(screen.getByTestId('pricing-row-gpt-5-mini-source')).toHaveTextContent('Included in plan')
    })
    expect(screen.getByTestId('pricing-row-claude-opus-4.5-source')).toHaveTextContent('Override')
    expect(screen.getByTestId('pricing-row-claude-sonnet-4.5-source')).toHaveTextContent('Default')
  })

  it('disables price inputs and shows checkbox checked when a row is included in plan', async () => {
    setupElectronAPI({
      'pricing:get-effective': effectiveFixture({
        'gpt-5-mini': { input: 0, output: 0, source: 'included' },
      }),
      'pricing:get-settings': { remoteSyncEnabled: false, remoteUrl: '', lastSyncAt: null, lastSyncError: null },
    })
    renderWithProvider(<PricingSettings />)
    await waitFor(() => screen.getByTestId('pricing-row-gpt-5-mini'))
    const includedToggle = screen.getByTestId('pricing-row-gpt-5-mini-included') as HTMLInputElement
    expect(includedToggle.checked).toBe(true)
    const row = screen.getByTestId('pricing-row-gpt-5-mini')
    const inputs = within(row).getAllByRole('spinbutton') as HTMLInputElement[]
    expect(inputs[0].disabled).toBe(true)
    expect(inputs[1].disabled).toBe(true)
  })

  it('toggling Included calls pricing:set-override with includedInPlan=true', async () => {
    const { mockInvoke } = setupElectronAPI({
      'pricing:get-effective': effectiveFixture(),
      'pricing:get-settings': { remoteSyncEnabled: false, remoteUrl: '', lastSyncAt: null, lastSyncError: null },
    })
    renderWithProvider(<PricingSettings />)
    await waitFor(() => screen.getByTestId('pricing-row-gpt-5-mini-included'))
    fireEvent.click(screen.getByTestId('pricing-row-gpt-5-mini-included'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pricing:set-override', {
        model: 'gpt-5-mini',
        override: { includedInPlan: true },
      })
    })
  })

  it('unchecking Included for an included row clears the override', async () => {
    const { mockInvoke } = setupElectronAPI({
      'pricing:get-effective': effectiveFixture({
        'gpt-5-mini': { input: 0, output: 0, source: 'included' },
      }),
      'pricing:get-settings': { remoteSyncEnabled: false, remoteUrl: '', lastSyncAt: null, lastSyncError: null },
    })
    renderWithProvider(<PricingSettings />)
    await waitFor(() => screen.getByTestId('pricing-row-gpt-5-mini-included'))
    fireEvent.click(screen.getByTestId('pricing-row-gpt-5-mini-included'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pricing:clear-override', { model: 'gpt-5-mini' })
    })
  })

  it('typing a new input price and blurring commits an override', async () => {
    const { mockInvoke } = setupElectronAPI({
      'pricing:get-effective': effectiveFixture(),
      'pricing:get-settings': { remoteSyncEnabled: false, remoteUrl: '', lastSyncAt: null, lastSyncError: null },
    })
    renderWithProvider(<PricingSettings />)
    await waitFor(() => screen.getByTestId('pricing-row-claude-sonnet-4.5'))
    const row = screen.getByTestId('pricing-row-claude-sonnet-4.5')
    const inputs = within(row).getAllByRole('spinbutton') as HTMLInputElement[]
    fireEvent.change(inputs[0], { target: { value: '6' } })
    fireEvent.blur(inputs[0])
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pricing:set-override', {
        model: 'claude-sonnet-4.5',
        override: expect.objectContaining({ input: 6 }),
      })
    })
  })

  it('Reset button is disabled when the row is at default and enabled when overridden', async () => {
    setupElectronAPI({
      'pricing:get-effective': effectiveFixture({
        'claude-opus-4.5': { input: 6, output: 30, source: 'override' },
      }),
      'pricing:get-settings': { remoteSyncEnabled: false, remoteUrl: '', lastSyncAt: null, lastSyncError: null },
    })
    renderWithProvider(<PricingSettings />)
    await waitFor(() => screen.getByTestId('pricing-row-claude-opus-4.5-reset'))
    const overriddenReset = screen.getByTestId('pricing-row-claude-opus-4.5-reset') as HTMLButtonElement
    expect(overriddenReset.disabled).toBe(false)
    const defaultReset = screen.getByTestId('pricing-row-claude-sonnet-4.5-reset') as HTMLButtonElement
    expect(defaultReset.disabled).toBe(true)
  })

  it('Sync URL input is disabled while remote sync is off', async () => {
    renderWithProvider(<PricingSettings />)
    await waitFor(() => screen.getByTestId('pricing-sync-url'))
    expect((screen.getByTestId('pricing-sync-url') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('pricing-sync-now') as HTMLButtonElement).disabled).toBe(true)
  })

  it('toggling remote sync persists the new setting', async () => {
    const { mockInvoke } = setupElectronAPI({
      'pricing:get-effective': effectiveFixture(),
      'pricing:get-settings': { remoteSyncEnabled: false, remoteUrl: '', lastSyncAt: null, lastSyncError: null },
    })
    renderWithProvider(<PricingSettings />)
    await waitFor(() => screen.getByTestId('pricing-sync-toggle'))
    fireEvent.click(screen.getByTestId('pricing-sync-toggle'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pricing:set-settings', {
        settings: expect.objectContaining({ remoteSyncEnabled: true }),
      })
    })
  })

  it('Sync now invokes pricing:sync-now and shows the result message', async () => {
    const { mockInvoke } = setupElectronAPI({
      'pricing:get-effective': effectiveFixture(),
      'pricing:get-settings': {
        remoteSyncEnabled: true,
        remoteUrl: 'https://example.com/p.json',
        lastSyncAt: null,
        lastSyncError: null,
      },
      'pricing:sync-now': { ok: true, syncedAt: Date.now() },
    })
    renderWithProvider(<PricingSettings />)
    await waitFor(() => screen.getByTestId('pricing-sync-now'))
    fireEvent.click(screen.getByTestId('pricing-sync-now'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pricing:sync-now')
    })
    await waitFor(() => {
      expect(screen.getByText(/Sync complete/i)).toBeInTheDocument()
    })
  })

  it('renders an alias row tagged with its alias target', async () => {
    renderWithProvider(<PricingSettings />)
    await waitFor(() => screen.getByTestId('pricing-row-sonnet'))
    expect(within(screen.getByTestId('pricing-row-sonnet')).getByText(/claude-sonnet-4\.5/)).toBeInTheDocument()
  })
})
