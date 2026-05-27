// landr-panu — SegmentChips render + interaction coverage.
//
// Focus: chip activation, save-button visibility, segment creation flow
// (dialog → input → submit writes to localStorage), manage flow
// (rename + delete), and findActiveSegment set-equality.

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SegmentChips } from './SegmentChips'
import {
  createSegment,
  findActiveSegment,
  getSegments,
  storageKey,
  type Segment,
} from '@/lib/segments'

// ---- mocks -----------------------------------------------------------

// Stub the tags API — SegmentChips uses fetchTags() to colour the
// saved-segment tooltip and pipes operatorId into TagPicker which calls
// the same function. We return a fixed tag set so the dialog can mount.
vi.mock('@/lib/tags', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tags')>(
    '@/lib/tags',
  )
  return {
    ...actual,
    fetchTags: vi.fn().mockResolvedValue([
      { id: 'tag-vip', operator_id: 'op-1', name: 'VIP', color: '#ef4444', created_at: '', updated_at: '' },
      { id: 'tag-ret', operator_id: 'op-1', name: 'Returning', color: '#22c55e', created_at: '', updated_at: '' },
    ]),
  }
})

// Stub sonner so the toast call inside save/delete doesn't blow up.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// ---- harness ---------------------------------------------------------

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function Harness({
  operatorId = 'op-1',
  initial = [] as string[],
}: {
  operatorId?: string | null
  initial?: string[]
}) {
  const [selected, setSelected] = useState<string[]>(initial)
  return (
    <SegmentChips
      operatorId={operatorId}
      selectedTagIds={selected}
      onSelectedTagIdsChange={setSelected}
    />
  )
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  vi.clearAllMocks()
})

// ---- tests -----------------------------------------------------------

describe('findActiveSegment', () => {
  const segments: Segment[] = [
    { id: 's1', name: 'VIP', tagIds: ['vip'], color: '#fff', createdAt: '' },
    {
      id: 's2',
      name: 'VIP Returning',
      tagIds: ['vip', 'ret'],
      color: '#fff',
      createdAt: '',
    },
  ]

  it('matches set-equality regardless of order', () => {
    expect(findActiveSegment(segments, ['vip'])).toBe('s1')
    expect(findActiveSegment(segments, ['ret', 'vip'])).toBe('s2')
  })

  it('returns null when the selection has no exact match', () => {
    expect(findActiveSegment(segments, [])).toBeNull()
    expect(findActiveSegment(segments, ['ret'])).toBeNull()
    expect(findActiveSegment(segments, ['vip', 'ret', 'extra'])).toBeNull()
  })
})

describe('SegmentChips — render gating', () => {
  it('renders nothing while operatorId is null', () => {
    const { container } = render(
      <Wrapper>
        <Harness operatorId={null} />
      </Wrapper>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the bar with the tag picker even when no segments exist', () => {
    render(
      <Wrapper>
        <Harness />
      </Wrapper>,
    )
    expect(screen.getByTestId('segment-chips-bar')).toBeInTheDocument()
    // No saved-segment chips, no "Manage" button.
    expect(screen.queryByTestId('segment-chips-manage')).not.toBeInTheDocument()
    // No "Save as segment…" until a tag is selected.
    expect(screen.queryByTestId('segment-chips-save')).not.toBeInTheDocument()
  })
})

describe('SegmentChips — saved-segment rendering + activation', () => {
  it('renders saved segments and toggles activation on click', async () => {
    createSegment('op-1', { name: 'VIP', tagIds: ['tag-vip'] })
    const user = userEvent.setup()

    render(
      <Wrapper>
        <Harness />
      </Wrapper>,
    )

    const chip = await screen.findByTestId(/segment-chips-segment-/)
    expect(chip).toHaveAttribute('aria-pressed', 'false')

    await user.click(chip)
    // Clicking sets selectedTagIds — the chip is now active.
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    // And the "Clear tag filter" affordance shows up.
    expect(screen.getByTestId('segment-chips-clear')).toBeInTheDocument()
    // No "Save as segment…" because the selection matches a saved one.
    expect(screen.queryByTestId('segment-chips-save')).not.toBeInTheDocument()

    // Click again to deactivate.
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows "Save as segment…" when a tag filter is active and no segment matches', () => {
    render(
      <Wrapper>
        <Harness initial={['tag-vip']} />
      </Wrapper>,
    )
    expect(screen.getByTestId('segment-chips-save')).toBeInTheDocument()
    expect(screen.getByTestId('segment-chips-clear')).toBeInTheDocument()
  })
})

describe('SegmentChips — save dialog', () => {
  it('creates a segment and persists to localStorage', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper>
        <Harness initial={['tag-vip']} />
      </Wrapper>,
    )

    await user.click(screen.getByTestId('segment-chips-save'))

    const dialog = await screen.findByTestId('segment-chips-save-dialog')
    const nameInput = within(dialog).getByTestId(
      'segment-chips-save-dialog-name-input',
    )
    await user.type(nameInput, 'VIP customers')

    await user.click(
      within(dialog).getByTestId('segment-chips-save-dialog-submit'),
    )

    // localStorage now has the segment.
    const stored = getSegments('op-1')
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('VIP customers')
    expect(stored[0].tagIds).toEqual(['tag-vip'])
  })

  it('refuses to save with a blank name', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper>
        <Harness initial={['tag-vip']} />
      </Wrapper>,
    )
    await user.click(screen.getByTestId('segment-chips-save'))
    const dialog = await screen.findByTestId('segment-chips-save-dialog')
    await user.click(
      within(dialog).getByTestId('segment-chips-save-dialog-submit'),
    )
    expect(
      within(dialog).getByTestId('segment-chips-save-dialog-error'),
    ).toBeInTheDocument()
    expect(getSegments('op-1')).toEqual([])
  })
})

describe('SegmentChips — manage dialog', () => {
  it('opens, lists existing segments, and deletes one on confirm', async () => {
    createSegment('op-1', { name: 'VIP', tagIds: ['tag-vip'] })
    createSegment('op-1', { name: 'Returning', tagIds: ['tag-ret'] })

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    render(
      <Wrapper>
        <Harness />
      </Wrapper>,
    )

    await user.click(screen.getByTestId('segment-chips-manage'))

    const dialog = await screen.findByTestId('segment-chips-manage-dialog')
    const list = within(dialog).getByTestId(
      'segment-chips-manage-dialog-list',
    )
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)

    // Delete the first one — confirm() returns true via the spy.
    const target = getSegments('op-1')[0]
    await user.click(
      within(dialog).getByTestId(
        `segment-chips-manage-dialog-delete-${target.id}`,
      ),
    )

    expect(confirmSpy).toHaveBeenCalled()

    // Storage now has only the survivor.
    const after = getSegments('op-1')
    expect(after).toHaveLength(1)
    expect(after[0].id).not.toBe(target.id)
  })

  it('shows an empty state when no segments exist (opened via key)', async () => {
    // Pre-seed one so the Manage button mounts, then delete-via-storage
    // to land in the empty state with the dialog already open.
    const seg = createSegment('op-1', { name: 'VIP', tagIds: ['tag-vip'] })!
    const user = userEvent.setup()

    render(
      <Wrapper>
        <Harness />
      </Wrapper>,
    )

    await user.click(screen.getByTestId('segment-chips-manage'))
    // Now wipe localStorage and dispatch the same-tab event so the
    // hook re-reads and renders the empty list.
    window.localStorage.removeItem(storageKey('op-1'))
    window.dispatchEvent(
      new CustomEvent('landr:segments-changed', { detail: 'op-1' }),
    )

    expect(
      await screen.findByTestId('segment-chips-manage-dialog-empty'),
    ).toBeInTheDocument()

    // Reference suppresses unused-var hint while preserving setup
    // intent: a segment existed at mount time.
    expect(seg.id).toBeTruthy()
  })
})
