// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { setupElectronAPI } from '../../../test/ipc-mock-helper'

beforeEach(() => {
  setupElectronAPI()
})

import SubAgentPopout from './SubAgentPopout'

describe('SubAgentPopout', () => {
  it('shows error when no sub-agent ID provided', () => {
    render(
      <MemoryRouter initialEntries={['/popout']}>
        <Routes>
          <Route path="/popout" element={<SubAgentPopout />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('No sub-agent ID provided')).toBeInTheDocument()
  })

  it('renders output viewer when ID is provided', () => {
    render(
      <MemoryRouter initialEntries={['/popout/agent-123']}>
        <Routes>
          <Route path="/popout/:id" element={<SubAgentPopout />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByText('No sub-agent ID provided')).not.toBeInTheDocument()
  })
})
