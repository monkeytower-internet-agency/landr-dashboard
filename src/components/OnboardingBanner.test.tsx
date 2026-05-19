import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Operator } from '@/lib/operator'

const { mocks } = vi.hoisted(() => {
  return {
    mocks: {
      currentOperator: null as Operator | null,
    },
  }
})

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: mocks.currentOperator ? [mocks.currentOperator] : [],
    currentOperator: mocks.currentOperator,
    currentOperatorId: mocks.currentOperator?.id ?? null,
    loading: false,
    switchOperator: () => {},
    refreshOperators: () => {},
  }),
}))

import { OnboardingBanner } from './OnboardingBanner'

function makeOperator(overrides: Partial<Operator> = {}): Operator {
  return {
    id: 'op-1',
    slug: 'para42',
    name: 'Para42',
    onboarded_at: null,
    ...overrides,
  }
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<OnboardingBanner />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  mocks.currentOperator = null
})

afterEach(() => {
  mocks.currentOperator = null
})

describe('OnboardingBanner', () => {
  it('renders nothing when there is no current operator', () => {
    mocks.currentOperator = null
    renderAt('/')
    expect(screen.queryByTestId('onboarding-banner')).not.toBeInTheDocument()
  })

  it('renders nothing when the operator is already onboarded', () => {
    mocks.currentOperator = makeOperator({ onboarded_at: '2026-05-01T00:00:00Z' })
    renderAt('/')
    expect(screen.queryByTestId('onboarding-banner')).not.toBeInTheDocument()
  })

  it('renders nothing on /onboarding/* paths', () => {
    mocks.currentOperator = makeOperator({ onboarded_at: null })
    renderAt('/onboarding/start')
    expect(screen.queryByTestId('onboarding-banner')).not.toBeInTheDocument()
  })

  it('renders the banner when the operator is not onboarded and not on /onboarding', () => {
    mocks.currentOperator = makeOperator({ onboarded_at: null })
    renderAt('/')
    expect(screen.getByTestId('onboarding-banner')).toBeInTheDocument()
    expect(
      screen.getByText(/finish setting up your account/i),
    ).toBeInTheDocument()
  })

  it('points Resume at /onboarding/start?step=1 by default', () => {
    mocks.currentOperator = makeOperator({ id: 'op-1', onboarded_at: null })
    renderAt('/')
    const link = screen.getByRole('link', { name: /resume/i })
    expect(link).toHaveAttribute('href', '/onboarding/start?step=1')
  })

  it('points Resume at the last-saved step from localStorage', () => {
    window.localStorage.setItem('landr.dashboard.onboarding.op-1.step', '5')
    mocks.currentOperator = makeOperator({ id: 'op-1', onboarded_at: null })
    renderAt('/')
    const link = screen.getByRole('link', { name: /resume/i })
    expect(link).toHaveAttribute('href', '/onboarding/start?step=5')
  })

  it('clamps invalid stored step values back to 1', () => {
    window.localStorage.setItem('landr.dashboard.onboarding.op-1.step', '999')
    mocks.currentOperator = makeOperator({ id: 'op-1', onboarded_at: null })
    renderAt('/')
    const link = screen.getByRole('link', { name: /resume/i })
    expect(link).toHaveAttribute('href', '/onboarding/start?step=1')
  })

  it('soft-dismisses for the current session when X is clicked', async () => {
    mocks.currentOperator = makeOperator({ id: 'op-1', onboarded_at: null })
    const user = userEvent.setup()
    renderAt('/')

    expect(screen.getByTestId('onboarding-banner')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(screen.queryByTestId('onboarding-banner')).not.toBeInTheDocument()
    expect(
      window.sessionStorage.getItem(
        'landr.dashboard.onboardingBanner.dismissed.op-1',
      ),
    ).toBe('true')
  })

  it('hides the banner if sessionStorage already has the dismiss flag set', () => {
    window.sessionStorage.setItem(
      'landr.dashboard.onboardingBanner.dismissed.op-1',
      'true',
    )
    mocks.currentOperator = makeOperator({ id: 'op-1', onboarded_at: null })
    renderAt('/')
    expect(screen.queryByTestId('onboarding-banner')).not.toBeInTheDocument()
  })

  it('keeps the banner visible for an un-dismissed sibling operator', () => {
    // op-1 was dismissed in this session but the current operator is op-2.
    window.sessionStorage.setItem(
      'landr.dashboard.onboardingBanner.dismissed.op-1',
      'true',
    )
    mocks.currentOperator = makeOperator({
      id: 'op-2',
      slug: 'kayak',
      name: 'Kayak',
      onboarded_at: null,
    })
    renderAt('/')
    expect(screen.getByTestId('onboarding-banner')).toBeInTheDocument()
  })
})
