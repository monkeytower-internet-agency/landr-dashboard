import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { EditTaxonomyButton } from './edit-taxonomy-button'

describe('<EditTaxonomyButton>', () => {
  it('renders trigger button with aria-label', () => {
    render(
      <EditTaxonomyButton title="Manage things" ariaLabel="Edit things">
        <div>body</div>
      </EditTaxonomyButton>,
    )
    expect(
      screen.getByRole('button', { name: 'Edit things' }),
    ).toBeInTheDocument()
  })

  it('opens the Sheet on trigger click and renders children', async () => {
    const user = userEvent.setup()
    render(
      <EditTaxonomyButton
        title="Manage things"
        description="Manage your stuff"
        ariaLabel="Edit things"
      >
        <div data-testid="sheet-body">body content</div>
      </EditTaxonomyButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Edit things' }))
    expect(screen.getByText('Manage things')).toBeInTheDocument()
    expect(screen.getByText('Manage your stuff')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-body')).toBeInTheDocument()
  })
})
