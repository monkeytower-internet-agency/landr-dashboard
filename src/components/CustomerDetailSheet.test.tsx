import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

type ContactFixture = {
  id: string
  operator_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  preferred_locale: string | null
  preferred_timezone: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  gdpr_erased_at: string | null
  gdpr_erased_by_user_id: string | null
  gdpr_erasure_note: string | null
}

const { mock } = vi.hoisted(() => {
  const state = {
    contact: null as ContactFixture | null,
    fetchError: null as { message: string } | null,
    updateError: null as { message: string } | null,
    updatePatch: null as Record<string, unknown> | null,
  }

  const selectBuilder = () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(async () => ({
        data: state.contact,
        error: state.fetchError,
      })),
      // Used by the patchContact helper — .update().eq()
      update: vi.fn((patch: Record<string, unknown>) => {
        state.updatePatch = patch
        return {
          eq: vi.fn(async () => ({
            data: state.contact,
            error: state.updateError,
          })),
        }
      }),
    })
    return builder
  }

  const supabase = {
    from: vi.fn(() => selectBuilder()),
  }
  return { mock: { state, supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { CustomerDetailSheet } from './CustomerDetailSheet'

function makeContact(overrides: Partial<ContactFixture> = {}): ContactFixture {
  return {
    id: 'c-1',
    operator_id: 'op-1',
    first_name: 'Carol',
    last_name: 'Chen',
    email: 'carol@example.com',
    phone: '+34600111222',
    preferred_locale: 'en',
    preferred_timezone: null,
    created_at: '2026-05-10T09:00:00.000Z',
    updated_at: '2026-05-10T09:00:00.000Z',
    deleted_at: null,
    gdpr_erased_at: null,
    gdpr_erased_by_user_id: null,
    gdpr_erasure_note: null,
    ...overrides,
  }
}

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  mock.state.contact = makeContact()
  mock.state.fetchError = null
  mock.state.updateError = null
  mock.state.updatePatch = null
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('CustomerDetailSheet', () => {
  it('renders nothing when contactId is null', () => {
    render(<CustomerDetailSheet contactId={null} onOpenChange={() => {}} />)
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument()
  })

  it('fetches the contact and seeds the form with its values', async () => {
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    expect(
      await screen.findByLabelText(/first name/i),
    ).toHaveValue('Carol')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Chen')
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('carol@example.com')
    expect(screen.getByLabelText(/phone/i)).toHaveValue('+34600111222')
  })

  it('widens the SheetContent to ~60vw on desktop (landr-li8e)', () => {
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)
    const content = document.querySelector('[data-slot="sheet-content"]')
    expect(content).not.toBeNull()
    // Stays as a Sheet (not modal) so the contacts list behind it remains
    // visible for quick triage. 60vw gives the contact form room.
    expect(content?.className).toMatch(/sm:max-w-\[60vw\]/)
  })

  it('disables Save until something changes, then PATCHes the contact', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={onOpenChange} />)

    const phoneInput = await screen.findByLabelText(/phone/i)
    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    expect(saveBtn).toBeDisabled()

    await user.clear(phoneInput)
    await user.type(phoneInput, '+34699000111')

    await waitFor(() => expect(saveBtn).toBeEnabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(mock.state.updatePatch).toMatchObject({ phone: '+34699000111' })
    })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('blocks Save and shows a field error for an invalid email', async () => {
    const user = userEvent.setup()
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    const emailInput = await screen.findByLabelText(/^email$/i)
    await user.clear(emailInput)
    await user.type(emailInput, 'not-an-email')

    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    await waitFor(() => expect(saveBtn).toBeDisabled())
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
  })

  it('shows a discard-changes confirm dialog when closing dirty', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={onOpenChange} />)

    const firstName = await screen.findByLabelText(/first name/i)
    await user.clear(firstName)
    await user.type(firstName, 'Caroline')

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByRole('heading', { name: /discard unsaved changes/i }),
    ).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /^discard$/i }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('persists the preferred_locale change in the PATCH payload', async () => {
    const user = userEvent.setup()
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    const localeSelect = await screen.findByLabelText(/preferred language/i)
    await user.selectOptions(localeSelect, 'de')

    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    await waitFor(() => expect(saveBtn).toBeEnabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(mock.state.updatePatch).toMatchObject({ preferred_locale: 'de' })
    })
  })

  it('preserves an unknown preferred_locale by including it as an option', async () => {
    mock.state.contact = makeContact({ preferred_locale: 'pt' })
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    const select = (await screen.findByLabelText(
      /preferred language/i,
    )) as HTMLSelectElement
    expect(select.value).toBe('pt')
    expect(
      within(select).getByRole('option', { name: 'pt' }),
    ).toBeInTheDocument()
  })

  it('surfaces fetch errors in an alert', async () => {
    mock.state.contact = null
    mock.state.fetchError = { message: 'no row' }
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no row/i)
  })
})
