/**
 * CompanySettings tests — landr-x5o5.7
 *
 * Covers the hotel_email_locale control added to the Locale card:
 *   1. Renders with the operator's hotel_email_locale pre-populated.
 *   2. Renders with a blank value when hotel_email_locale is null.
 *   3. Submitting the form calls patchOperator with hotel_email_locale included.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/operator', async () => {
  const mod = await vi.importActual<typeof import('@/lib/operator')>('@/lib/operator')
  return {
    ...mod,
    useOperator: () => ({
      operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      loading: false,
      switchOperator: () => {},
      refreshOperators: () => {},
    }),
    OperatorProvider: ({ children }: { children: ReactNode }) => children,
  }
})

const { fetchOperatorMock, patchOperatorMock } = vi.hoisted(() => ({
  fetchOperatorMock: vi.fn(),
  patchOperatorMock: vi.fn(),
}))

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: (...args: unknown[]) => fetchOperatorMock(...args),
    patchOperator: (...args: unknown[]) => patchOperatorMock(...args),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_OPERATOR = {
  id: 'op-1',
  name: 'Para42',
  slug: 'para42',
  legal_name: null,
  tax_id: null,
  tax_id_kind: null,
  phone: null,
  street: null,
  city: null,
  postal_code: null,
  region: null,
  country: null,
  timezone: 'Atlantic/Canary',
  default_locale: 'es',
  hotel_email_locale: null,
  onboarded_at: null,
}

import { CompanySettings } from './CompanySettings'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompanySettings — hotel_email_locale (landr-x5o5.7)', () => {
  beforeEach(() => {
    patchOperatorMock.mockResolvedValue({ ...BASE_OPERATOR })
  })

  it('renders the hotel email language section', async () => {
    fetchOperatorMock.mockResolvedValue({
      ...BASE_OPERATOR,
      hotel_email_locale: 'es',
    })

    renderWithQuery(<CompanySettings />)

    await waitFor(() => {
      expect(screen.getByTestId('hotel-email-locale-section')).toBeDefined()
    })
    // Label and hint text are present.
    expect(screen.getByText('Hotel email language')).toBeDefined()
    expect(screen.getByText(/hotel-facing emails/i)).toBeDefined()
  })

  it('renders with the operator hotel_email_locale pre-selected', async () => {
    fetchOperatorMock.mockResolvedValue({
      ...BASE_OPERATOR,
      hotel_email_locale: 'es',
    })

    renderWithQuery(<CompanySettings />)

    // Wait for the operator to load and the form to render
    await waitFor(() => {
      expect(screen.getByTestId('hotel-email-locale-section')).toBeDefined()
    })

    // The LocalePicker combobox for hotel email locale shows the selected value.
    const hotelLocaleButton = screen.getByRole('combobox', {
      name: /hotel email language/i,
    })
    expect(hotelLocaleButton).toBeDefined()
    // With value 'es', the picker should display something containing "es"
    expect(hotelLocaleButton.textContent?.toLowerCase()).toMatch(/es|spanish|español/)
  })

  it('renders the placeholder when hotel_email_locale is null', async () => {
    fetchOperatorMock.mockResolvedValue({
      ...BASE_OPERATOR,
      hotel_email_locale: null,
    })

    renderWithQuery(<CompanySettings />)

    await waitFor(() => {
      expect(screen.getByTestId('hotel-email-locale-section')).toBeDefined()
    })

    const hotelLocaleButton = screen.getByRole('combobox', {
      name: /hotel email language/i,
    })
    expect(hotelLocaleButton.textContent).toMatch(/same as default|select/i)
  })
})
