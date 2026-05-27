// landr-7dya.2 — OriginChip rendering tests.
// landr-7dya.3 — CardStatusIcons rendering tests.
//
// Both components are pure display (no hooks) so tests are straightforward
// render + assertion over visible elements and aria attributes.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OriginChip } from './CardVisuals'
import { CardStatusIcons } from './CardVisuals'
import type { AssignableUser } from '@/lib/tickets'

// ---- OriginChip ---------------------------------------------------------------

describe('OriginChip', () => {
  it('renders PROD chip for prod tier', () => {
    render(<OriginChip tier="prod" />)
    expect(screen.getByTestId('origin-chip')).toHaveTextContent('PROD')
  })

  it('renders STAGING chip for staging tier', () => {
    render(<OriginChip tier="staging" />)
    expect(screen.getByTestId('origin-chip')).toHaveTextContent('STAGING')
  })

  it('renders nothing when tier is null', () => {
    const { container } = render(<OriginChip tier={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('includes operator label in tooltip for staging chip', () => {
    render(<OriginChip tier="staging" operatorLabel="Para42" />)
    const chip = screen.getByTestId('origin-chip')
    expect(chip).toHaveAttribute('title', 'Relayed from staging (Para42)')
  })

  it('has generic tooltip when no operator label is provided for staging', () => {
    render(<OriginChip tier="staging" />)
    const chip = screen.getByTestId('origin-chip')
    expect(chip).toHaveAttribute('title', 'Relayed from staging')
  })

  it('uses provided data-testid', () => {
    render(<OriginChip tier="prod" data-testid="my-chip" />)
    expect(screen.getByTestId('my-chip')).toBeInTheDocument()
  })
})

// ---- CardStatusIcons ----------------------------------------------------------

const baseHumanAssignee: AssignableUser = {
  id: 'user-1',
  email: 'olaf.klein@example.com',
  is_landr_staff: true,
  is_claude_agent: false,
}

const baseAgentAssignee: AssignableUser = {
  id: 'agent-1',
  email: 'claude@example.com',
  is_landr_staff: false,
  is_claude_agent: true,
}

function makeStatusIcons(
  overrides: Partial<React.ComponentProps<typeof CardStatusIcons>> = {},
) {
  return render(
    <CardStatusIcons
      attachmentCount={0}
      isWatching={false}
      assignee={null}
      priority="p2"
      commentCount={0}
      moscow={null}
      blocked={false}
      {...overrides}
    />,
  )
}

describe('CardStatusIcons', () => {
  it('renders the icon row', () => {
    makeStatusIcons()
    expect(screen.getByTestId('card-status-icons')).toBeInTheDocument()
  })

  describe('priority badge', () => {
    it('shows P0 for p0 priority', () => {
      makeStatusIcons({ priority: 'p0' })
      expect(screen.getByTestId('card-status-priority')).toHaveTextContent('P0')
    })

    it('shows P1 for p1 priority', () => {
      makeStatusIcons({ priority: 'p1' })
      expect(screen.getByTestId('card-status-priority')).toHaveTextContent('P1')
    })

    it('shows P2 for p2 priority', () => {
      makeStatusIcons({ priority: 'p2' })
      expect(screen.getByTestId('card-status-priority')).toHaveTextContent('P2')
    })
  })

  describe('attachment indicator', () => {
    it('shows attachment count when > 0', () => {
      makeStatusIcons({ attachmentCount: 3 })
      expect(screen.getByTestId('card-status-attachments')).toBeInTheDocument()
      expect(screen.getByTestId('card-status-attachments')).toHaveTextContent('3')
    })

    it('hides attachment indicator when count is 0', () => {
      makeStatusIcons({ attachmentCount: 0 })
      expect(
        screen.queryByTestId('card-status-attachments'),
      ).not.toBeInTheDocument()
    })
  })

  describe('comment count', () => {
    it('shows comment count when > 0', () => {
      makeStatusIcons({ commentCount: 5 })
      expect(screen.getByTestId('card-status-comments')).toHaveTextContent('5')
    })

    it('hides comment count when 0', () => {
      makeStatusIcons({ commentCount: 0 })
      expect(
        screen.queryByTestId('card-status-comments'),
      ).not.toBeInTheDocument()
    })
  })

  describe('watch indicator', () => {
    it('shows watch icon when isWatching is true', () => {
      makeStatusIcons({ isWatching: true })
      expect(screen.getByTestId('card-status-watching')).toBeInTheDocument()
    })

    it('hides watch icon when not watching', () => {
      makeStatusIcons({ isWatching: false })
      expect(
        screen.queryByTestId('card-status-watching'),
      ).not.toBeInTheDocument()
    })
  })

  describe('blocked indicator', () => {
    it('shows blocked icon when blocked is true', () => {
      makeStatusIcons({ blocked: true })
      expect(screen.getByTestId('card-status-blocked')).toBeInTheDocument()
    })

    it('hides blocked icon when not blocked', () => {
      makeStatusIcons({ blocked: false })
      expect(
        screen.queryByTestId('card-status-blocked'),
      ).not.toBeInTheDocument()
    })
  })

  describe('MoSCoW badge', () => {
    it('shows must badge for must moscow', () => {
      makeStatusIcons({ moscow: 'must' })
      expect(screen.getByTestId('card-status-moscow')).toHaveTextContent('M')
    })

    it('shows should badge for should moscow', () => {
      makeStatusIcons({ moscow: 'should' })
      expect(screen.getByTestId('card-status-moscow')).toHaveTextContent('S')
    })

    it('shows could badge for could moscow', () => {
      makeStatusIcons({ moscow: 'could' })
      expect(screen.getByTestId('card-status-moscow')).toHaveTextContent('C')
    })

    it('shows wont badge for wont moscow', () => {
      makeStatusIcons({ moscow: 'wont' })
      expect(screen.getByTestId('card-status-moscow')).toHaveTextContent('W')
    })

    it('hides moscow badge when null', () => {
      makeStatusIcons({ moscow: null })
      expect(
        screen.queryByTestId('card-status-moscow'),
      ).not.toBeInTheDocument()
    })
  })

  describe('assignee avatar', () => {
    it('shows human initials for human assignee', () => {
      makeStatusIcons({ assignee: baseHumanAssignee })
      const avatar = screen.getByTestId('card-status-assignee')
      expect(avatar).toBeInTheDocument()
      // 'olaf.klein' → initials 'OK'
      expect(avatar).toHaveTextContent('OK')
    })

    it('shows robot icon for agent assignee', () => {
      makeStatusIcons({ assignee: baseAgentAssignee })
      const avatar = screen.getByTestId('card-status-assignee')
      expect(avatar).toBeInTheDocument()
      // robot icon renders as an SVG; avatar element is the wrapper span
      expect(avatar.querySelector('svg')).toBeInTheDocument()
    })

    it('hides assignee avatar when no assignee', () => {
      makeStatusIcons({ assignee: null })
      expect(
        screen.queryByTestId('card-status-assignee'),
      ).not.toBeInTheDocument()
    })
  })
})

