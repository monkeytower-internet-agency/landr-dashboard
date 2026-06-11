// Contract checks for the shared PasswordInput — locks the toggle behaviour
// and a11y aria-label that all four call sites rely on.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PasswordInput } from './PasswordInput'

describe('PasswordInput', () => {
  it('renders as a password field when show=false', () => {
    render(
      <PasswordInput
        show={false}
        onToggleShow={() => {}}
        value=""
        onChange={() => {}}
      />,
    )
    // type="password" inputs don't have an ARIA textbox role — query directly
    expect(document.querySelector('input')).toHaveAttribute('type', 'password')
  })

  it('renders as a text field when show=true', () => {
    render(
      <PasswordInput
        show={true}
        onToggleShow={() => {}}
        value=""
        onChange={() => {}}
      />,
    )
    expect(document.querySelector('input')).toHaveAttribute('type', 'text')
  })

  it('has aria-label "Show password" when show=false', () => {
    render(
      <PasswordInput
        show={false}
        onToggleShow={() => {}}
        value=""
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Show password')
  })

  it('has aria-label "Hide password" when show=true', () => {
    render(
      <PasswordInput
        show={true}
        onToggleShow={() => {}}
        value=""
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Hide password')
  })

  it('calls onToggleShow when the toggle button is clicked', async () => {
    const onToggleShow = vi.fn()
    const user = userEvent.setup()
    render(
      <PasswordInput
        show={false}
        onToggleShow={onToggleShow}
        value=""
        onChange={() => {}}
      />,
    )
    await user.click(screen.getByRole('button'))
    expect(onToggleShow).toHaveBeenCalledTimes(1)
  })

  it('disables the toggle button when disabled=true', async () => {
    const onToggleShow = vi.fn()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(
      <PasswordInput
        show={false}
        onToggleShow={onToggleShow}
        value=""
        onChange={() => {}}
        disabled
      />,
    )
    await user.click(screen.getByRole('button'))
    expect(onToggleShow).not.toHaveBeenCalled()
  })

  it('forwards id and name to the underlying input', () => {
    render(
      <PasswordInput
        id="my-password"
        name="my-password"
        show={false}
        onToggleShow={() => {}}
        value=""
        onChange={() => {}}
      />,
    )
    const input = document.querySelector('input')
    expect(input).toHaveAttribute('id', 'my-password')
    expect(input).toHaveAttribute('name', 'my-password')
  })
})
