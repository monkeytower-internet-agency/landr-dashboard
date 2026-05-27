// landr-sj2z — coverage for the shared skeleton row primitives. The
// table variant is wrapped in a <table><tbody> so React doesn't warn about
// detached <tr>s, and the list variant in a <ul> for the same reason.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SkeletonListRows, SkeletonTableRows } from './SkeletonTableRows'

describe('SkeletonTableRows', () => {
  it('renders the requested number of rows with the requested column count', () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRows
            count={5}
            columnCount={4}
            data-testid="t1"
          />
        </tbody>
      </table>,
    )
    // 5 rows × 4 cells = 20 skeleton bars total. Each cell contains a
    // div with data-slot="skeleton" from the shadcn primitive.
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBe(20)
    // Each row has a stable testid so callers can assert.
    expect(screen.getByTestId('t1-row-0')).toBeInTheDocument()
    expect(screen.getByTestId('t1-row-4')).toBeInTheDocument()
    expect(screen.queryByTestId('t1-row-5')).not.toBeInTheDocument()
  })

  it('defaults to 6 rows when count is omitted', () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRows columnCount={3} data-testid="defaultcount" />
        </tbody>
      </table>,
    )
    expect(screen.getByTestId('defaultcount-row-0')).toBeInTheDocument()
    expect(screen.getByTestId('defaultcount-row-5')).toBeInTheDocument()
    expect(screen.queryByTestId('defaultcount-row-6')).not.toBeInTheDocument()
  })

  it('marks every skeleton row as aria-hidden so AT does not announce placeholders', () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRows count={2} columnCount={2} data-testid="ah" />
        </tbody>
      </table>,
    )
    expect(screen.getByTestId('ah-row-0')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})

describe('SkeletonListRows', () => {
  it('renders the requested number of list items', () => {
    render(
      <ul>
        <SkeletonListRows count={4} data-testid="lst" />
      </ul>,
    )
    expect(screen.getByTestId('lst-row-0')).toBeInTheDocument()
    expect(screen.getByTestId('lst-row-3')).toBeInTheDocument()
    expect(screen.queryByTestId('lst-row-4')).not.toBeInTheDocument()
  })

  it('renders the default 6 items when count is omitted', () => {
    render(
      <ul>
        <SkeletonListRows data-testid="lstd" />
      </ul>,
    )
    expect(screen.getByTestId('lstd-row-0')).toBeInTheDocument()
    expect(screen.getByTestId('lstd-row-5')).toBeInTheDocument()
    expect(screen.queryByTestId('lstd-row-6')).not.toBeInTheDocument()
  })
})
