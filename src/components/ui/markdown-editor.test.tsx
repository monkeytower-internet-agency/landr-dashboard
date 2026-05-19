import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock the heavy MDEditor so the test stays a unit test (no codemirror).
vi.mock('@uiw/react-md-editor', () => ({
  __esModule: true,
  default: () => <div data-testid="md-editor" />,
}))

import { ThemeContext } from '@/lib/theme'
import { MarkdownEditor } from './markdown-editor'

function withThemeContext(resolvedTheme: 'light' | 'dark') {
  return (
    <ThemeContext.Provider
      value={{
        theme: resolvedTheme,
        resolvedTheme,
        setTheme: () => {},
        toggleTheme: () => {},
      }}
    >
      <MarkdownEditor />
    </ThemeContext.Provider>
  )
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
})

describe('<MarkdownEditor>', () => {
  it("sets data-color-mode='light' when the ThemeProvider says light", () => {
    const { container } = render(withThemeContext('light'))
    const wrapper = container.querySelector('[data-color-mode]')
    expect(wrapper).toHaveAttribute('data-color-mode', 'light')
  })

  it("sets data-color-mode='dark' when the ThemeProvider says dark", () => {
    const { container } = render(withThemeContext('dark'))
    const wrapper = container.querySelector('[data-color-mode]')
    expect(wrapper).toHaveAttribute('data-color-mode', 'dark')
  })

  it("falls back to <html class='dark'> when used outside the provider", () => {
    document.documentElement.classList.add('dark')
    const { container } = render(<MarkdownEditor />)
    const wrapper = container.querySelector('[data-color-mode]')
    expect(wrapper).toHaveAttribute('data-color-mode', 'dark')
  })

  it("defaults to 'light' outside the provider when no .dark class is set", () => {
    const { container } = render(<MarkdownEditor />)
    const wrapper = container.querySelector('[data-color-mode]')
    expect(wrapper).toHaveAttribute('data-color-mode', 'light')
  })
})
