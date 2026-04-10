// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

beforeEach(() => {
  setupElectronAPI()
})

import TeamHub from './TeamHub'

describe('TeamHub', () => {
  it('renders page heading', () => {
    render(<TeamHub />)
    expect(screen.getByText('Team Hub')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<TeamHub />)
    expect(screen.getByText(/Share configurations, browse the marketplace/)).toBeInTheDocument()
  })

  it('renders all tab buttons', () => {
    render(<TeamHub />)
    expect(screen.getByText('Config Bundle')).toBeInTheDocument()
    expect(screen.getByText('Shared Folder')).toBeInTheDocument()
    expect(screen.getByText('Setup Wizard')).toBeInTheDocument()
    expect(screen.getByText('Marketplace')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
  })

  it('shows Config Bundle tab by default', () => {
    render(<TeamHub />)
    const bundleBtn = screen.getByText('Config Bundle')
    expect(bundleBtn.className).toContain('border-indigo-600')
  })

  it('switches tabs when clicked', () => {
    render(<TeamHub />)
    fireEvent.click(screen.getByText('Marketplace'))
    const marketplaceBtn = screen.getByText('Marketplace')
    expect(marketplaceBtn.className).toContain('border-indigo-600')
  })

  it('calls app:get-cwd on mount', () => {
    const { mockInvoke } = setupElectronAPI()
    render(<TeamHub />)
    expect(mockInvoke).toHaveBeenCalledWith('app:get-cwd')
  })
})
