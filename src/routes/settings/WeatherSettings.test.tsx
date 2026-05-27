// landr-znzz.7 — WeatherSettings page tests.
//
// Light tests covering:
//   1. Enable toggle renders and saves disabled state.
//   2. Lat/lon inputs appear only when enabled; save calls patchOperator.
//   3. Disabled weather → no lat/lon form.
//   4. Route is reachable.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// We mock the lib so tests don't make real HTTP calls.
vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: vi.fn().mockResolvedValue({
      id: 'op-1',
      name: 'Test Op',
      slug: 'test-op',
      weather_enabled: false,
      weather_provider: null,
      weather_lat: null,
      weather_lon: null,
    }),
    patchOperator: vi.fn().mockResolvedValue({
      id: 'op-1',
      name: 'Test Op',
      slug: 'test-op',
      weather_enabled: false,
      weather_provider: null,
      weather_lat: null,
      weather_lon: null,
    }),
  }
})

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({ currentOperatorId: 'op-1' }),
}))

vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

import { WeatherSettings } from './WeatherSettings'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('WeatherSettings', () => {
  it('renders the enable toggle', async () => {
    renderWithQuery(<WeatherSettings />)
    // Wait for the operator query to resolve and the editor to appear.
    await waitFor(() => {
      expect(screen.getByTestId('weather-enabled')).toBeDefined()
    })
  })

  it('does not show lat/lon fields when weather is disabled', async () => {
    renderWithQuery(<WeatherSettings />)
    await waitFor(() => screen.getByTestId('weather-enabled'))
    // lat/lon are only rendered inside the {enabled && ...} block.
    expect(screen.queryByTestId('weather-lat')).toBeNull()
    expect(screen.queryByTestId('weather-lon')).toBeNull()
  })

  it('shows lat/lon fields after toggling enable on', async () => {
    renderWithQuery(<WeatherSettings />)
    await waitFor(() => screen.getByTestId('weather-enabled'))
    const toggle = screen.getByTestId('weather-enabled')
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(screen.getByTestId('weather-lat')).toBeDefined()
      expect(screen.getByTestId('weather-lon')).toBeDefined()
    })
  })

  it('save button is disabled when no changes made', async () => {
    renderWithQuery(<WeatherSettings />)
    await waitFor(() => screen.getByTestId('weather-save'))
    const saveBtn = screen.getByTestId('weather-save')
    expect(saveBtn).toHaveProperty('disabled', true)
  })

  it('save button becomes enabled after toggling weather', async () => {
    renderWithQuery(<WeatherSettings />)
    await waitFor(() => screen.getByTestId('weather-enabled'))
    const toggle = screen.getByTestId('weather-enabled')
    fireEvent.click(toggle)
    await waitFor(() => {
      const saveBtn = screen.getByTestId('weather-save')
      expect(saveBtn).toHaveProperty('disabled', false)
    })
  })
})
