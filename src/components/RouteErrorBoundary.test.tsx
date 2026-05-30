// landr-a99u — tests for RouteErrorBoundary.
//
// Covers:
//   (a) renders children when no error occurs.
//   (b) renders fallback card with the error message when a child throws.
//   (c) calls captureError with the error message + pathname detail.
//   (d) fallback card contains a "Reload page" button.

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RouteErrorBoundary } from './RouteErrorBoundary'

// ---- mock @/lib/notify so captureError is a spy --------------------------
const captureErrorSpy = vi.fn()
vi.mock('@/lib/notify', () => ({
  captureError: (...args: unknown[]) => captureErrorSpy(...args),
  notifyError: vi.fn(),
}))

// ---- suppress console.error spam from the intentional throws -------------
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  captureErrorSpy.mockReset()
})

// ---- helpers ----------------------------------------------------------------

function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

function renderWithRouter(
  ui: React.ReactElement,
  { initialPath = '/' }: { initialPath?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>,
  )
}

// ---- tests ------------------------------------------------------------------

describe('<RouteErrorBoundary>', () => {
  it('(a) renders children when no error occurs', () => {
    renderWithRouter(
      <RouteErrorBoundary>
        <div data-testid="child">hello</div>
      </RouteErrorBoundary>,
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByTestId('route-error-card')).not.toBeInTheDocument()
  })

  it('(b) renders fallback card with the error message when a child throws', () => {
    renderWithRouter(
      <RouteErrorBoundary>
        <Boom message="release exploded" />
      </RouteErrorBoundary>,
    )

    expect(screen.getByTestId('route-error-card')).toBeInTheDocument()
    expect(screen.getByTestId('route-error-title')).toHaveTextContent(
      'Something went wrong',
    )
    expect(screen.getByTestId('route-error-message')).toHaveTextContent(
      'release exploded',
    )
    expect(screen.getByTestId('route-error-hint')).toHaveTextContent(
      'captured in the bell',
    )
  })

  it('(c) calls captureError with the error message + path detail', () => {
    renderWithRouter(
      <RouteErrorBoundary>
        <Boom message="null ref crash" />
      </RouteErrorBoundary>,
      { initialPath: '/release' },
    )

    expect(captureErrorSpy).toHaveBeenCalledOnce()
    const [message, opts] = captureErrorSpy.mock.calls[0] as [
      string,
      { detail: string; context: string },
    ]
    expect(message).toBe('null ref crash')
    expect(opts.context).toBe('/release')
    // detail must embed the route path
    expect(opts.detail).toContain('/release')
  })

  it('(d) fallback card contains a Reload page button', () => {
    renderWithRouter(
      <RouteErrorBoundary>
        <Boom message="broken render" />
      </RouteErrorBoundary>,
    )

    const btn = screen.getByTestId('route-error-reload')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('Reload page')
  })
})
