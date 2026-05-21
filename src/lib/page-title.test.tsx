// landr-fx2i — verify the page-title context is the load-bearing
// piece for the topbar title/breadcrumb system. Covers:
//   - title set from a child component appears in topbar
//   - swapping the child swaps the title
//   - unmount clears the title
//   - crumbs override title (breadcrumb mode wins)
//   - <PageTitle> outside a provider is a safe no-op (lets tests render
//     route components in isolation without wrapping in AppShell)
import { useState } from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  PageTitle,
  PageTitleProvider,
  usePageTitle,
} from './page-title'

function TitleProbe() {
  const { title, crumbs, subtitle } = usePageTitle()
  return (
    <div>
      <span data-testid="title">{title ?? '(none)'}</span>
      <span data-testid="crumbs">
        {crumbs.length === 0 ? '(empty)' : crumbs.map((c) => c.label).join(' › ')}
      </span>
      <span data-testid="subtitle">{subtitle ?? '(none)'}</span>
    </div>
  )
}

function Harness({ children }: { children: React.ReactNode }) {
  return (
    <PageTitleProvider>
      <TitleProbe />
      {children}
    </PageTitleProvider>
  )
}

describe('PageTitle / PageTitleProvider (landr-fx2i)', () => {
  it('a child <PageTitle title=…/> writes the title into the topbar context', () => {
    render(
      <Harness>
        <PageTitle title="Bookings" />
      </Harness>,
    )
    expect(screen.getByTestId('title').textContent).toBe('Bookings')
    expect(screen.getByTestId('crumbs').textContent).toBe('(empty)')
  })

  it('crumbs render as a breadcrumb (title is null in breadcrumb mode)', () => {
    render(
      <Harness>
        <PageTitle
          crumbs={[
            { label: 'Settings', to: '/settings' },
            { label: 'Company' },
          ]}
        />
      </Harness>,
    )
    expect(screen.getByTestId('crumbs').textContent).toBe('Settings › Company')
    expect(screen.getByTestId('title').textContent).toBe('(none)')
  })

  it('unmounting <PageTitle> clears the topbar context', () => {
    function Switch() {
      const [show, setShow] = useState(true)
      return (
        <>
          {show ? <PageTitle title="Bookings" /> : null}
          <button onClick={() => setShow(false)}>hide</button>
        </>
      )
    }
    render(
      <Harness>
        <Switch />
      </Harness>,
    )
    expect(screen.getByTestId('title').textContent).toBe('Bookings')
    act(() => {
      screen.getByText('hide').click()
    })
    expect(screen.getByTestId('title').textContent).toBe('(none)')
    expect(screen.getByTestId('crumbs').textContent).toBe('(empty)')
  })

  it('changing the title prop updates the topbar (re-fires effect)', () => {
    function Swapper() {
      const [which, setWhich] = useState<'a' | 'b'>('a')
      return (
        <>
          <PageTitle title={which === 'a' ? 'Bookings' : 'Calendar'} />
          <button onClick={() => setWhich('b')}>swap</button>
        </>
      )
    }
    render(
      <Harness>
        <Swapper />
      </Harness>,
    )
    expect(screen.getByTestId('title').textContent).toBe('Bookings')
    act(() => {
      screen.getByText('swap').click()
    })
    expect(screen.getByTestId('title').textContent).toBe('Calendar')
  })

  it('subtitle prop populates context alongside title (landr-fnhz)', () => {
    render(
      <Harness>
        <PageTitle title="Bookings" subtitle="124 bookings · €12.4k" />
      </Harness>,
    )
    expect(screen.getByTestId('title').textContent).toBe('Bookings')
    expect(screen.getByTestId('subtitle').textContent).toBe(
      '124 bookings · €12.4k',
    )
  })

  it('subtitle is preserved in breadcrumb mode (landr-fnhz)', () => {
    render(
      <Harness>
        <PageTitle
          crumbs={[
            { label: 'Settings', to: '/settings' },
            { label: 'Branding' },
          ]}
          subtitle="Apply your logo + brand colour"
        />
      </Harness>,
    )
    expect(screen.getByTestId('crumbs').textContent).toBe('Settings › Branding')
    expect(screen.getByTestId('subtitle').textContent).toBe(
      'Apply your logo + brand colour',
    )
  })

  it('omitting subtitle leaves it null (backwards-compat, landr-fnhz)', () => {
    render(
      <Harness>
        <PageTitle title="Bookings" />
      </Harness>,
    )
    expect(screen.getByTestId('subtitle').textContent).toBe('(none)')
  })

  it('changing the subtitle prop updates the topbar (landr-fnhz)', () => {
    function Swapper() {
      const [n, setN] = useState(1)
      return (
        <>
          <PageTitle title="Bookings" subtitle={`${n} bookings`} />
          <button onClick={() => setN(2)}>bump</button>
        </>
      )
    }
    render(
      <Harness>
        <Swapper />
      </Harness>,
    )
    expect(screen.getByTestId('subtitle').textContent).toBe('1 bookings')
    act(() => {
      screen.getByText('bump').click()
    })
    expect(screen.getByTestId('subtitle').textContent).toBe('2 bookings')
  })

  it('outside a provider, <PageTitle> is a safe no-op (returns null, no throw)', () => {
    // Renders without crashing. usePageTitle() also defaults to empty
    // state outside a provider — keeps PageTitleDisplay safe in isolation.
    expect(() =>
      render(<PageTitle title="orphan" />),
    ).not.toThrow()
  })
})
