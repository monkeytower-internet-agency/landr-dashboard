// Contract checks for the shared FormErrorAlert — locks the role="alert"
// and conditional render behaviour that all six call sites rely on.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormErrorAlert } from './FormErrorAlert'

describe('FormErrorAlert', () => {
  it('renders the message text', () => {
    render(<FormErrorAlert message="Something went wrong" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('has role="alert"', () => {
    render(<FormErrorAlert message="Error" />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('renders nothing when message is null', () => {
    const { container } = render(<FormErrorAlert message={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when message is undefined', () => {
    const { container } = render(<FormErrorAlert message={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when message is an empty string', () => {
    const { container } = render(<FormErrorAlert message="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('applies an extra className when provided', () => {
    render(<FormErrorAlert message="Oops" className="mb-4" />)
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('mb-4')
  })

  it('always applies the destructive banner base classes', () => {
    render(<FormErrorAlert message="Error" />)
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('bg-destructive/10')
    expect(alert.className).toContain('border-destructive/50')
  })
})
