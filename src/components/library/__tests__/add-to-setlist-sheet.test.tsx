import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock radix dialog portal to render inline (no DOM portal in test env)
vi.mock('@radix-ui/react-dialog', async () => {
  const actual = await vi.importActual<typeof import('@radix-ui/react-dialog')>('@radix-ui/react-dialog')
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

import { AddToSetlistSheet } from '@/components/library/AddToSetlistSheet'
import type { Setlist } from '@/types/models'

const makeSetlist = (overrides: Partial<Setlist> = {}): Setlist => ({
  id: 'sl-1',
  name: 'Shabbat Morning',
  date: new Date('2026-03-15'),
  updatedAt: new Date('2026-03-15'),
  tracks: [
    { id: 't1', title: 'Song A', type: 'song' },
    { id: 't2', title: 'Song B', type: 'song' },
  ],
  trackCount: 2,
  ownerId: 'user-1',
  ...overrides,
})

describe('AddToSetlistSheet', () => {
  let onOpenChange: ReturnType<typeof vi.fn>
  let onSearchChange: ReturnType<typeof vi.fn>
  let onSelectSetlist: ReturnType<typeof vi.fn>

  const defaultSetlists = [
    makeSetlist({ id: 'sl-1', name: 'Shabbat Morning', trackCount: 5 }),
    makeSetlist({ id: 'sl-2', name: 'Friday Night', trackCount: 3 }),
  ]

  beforeEach(() => {
    onOpenChange = vi.fn()
    onSearchChange = vi.fn()
    onSelectSetlist = vi.fn()
  })

  function renderSheet(overrides: Record<string, unknown> = {}) {
    return render(
      <AddToSetlistSheet
        isOpen={true}
        onOpenChange={onOpenChange}
        setlists={defaultSetlists}
        loading={false}
        searchQuery=""
        onSearchChange={onSearchChange}
        onSelectSetlist={onSelectSetlist}
        pendingCount={1}
        {...overrides}
      />
    )
  }

  it('renders setlist names when open', () => {
    renderSheet()
    expect(screen.getByText('Shabbat Morning')).toBeInTheDocument()
    expect(screen.getByText('Friday Night')).toBeInTheDocument()
  })

  it('renders "Add to Setlist" title', () => {
    renderSheet()
    expect(screen.getByText('Add to Setlist')).toBeInTheDocument()
  })

  it('renders batch title when pendingCount > 1', () => {
    renderSheet({ pendingCount: 5 })
    expect(screen.getByText('Add 5 songs to Setlist')).toBeInTheDocument()
  })

  it('renders search input with placeholder', () => {
    renderSheet()
    expect(screen.getByPlaceholderText('Search setlists...')).toBeInTheDocument()
  })

  it('search input fires onSearchChange', () => {
    renderSheet()
    const input = screen.getByPlaceholderText('Search setlists...')
    fireEvent.change(input, { target: { value: 'Friday' } })
    expect(onSearchChange).toHaveBeenCalledWith('Friday')
  })

  it('clicking a setlist calls onSelectSetlist with correct args', () => {
    renderSheet()
    const button = screen.getByText('Shabbat Morning').closest('button')!
    fireEvent.click(button)
    expect(onSelectSetlist).toHaveBeenCalledWith('sl-1', defaultSetlists[0])
  })

  it('shows track count for each setlist', () => {
    renderSheet()
    expect(screen.getByText('5 songs')).toBeInTheDocument()
    expect(screen.getByText('3 songs')).toBeInTheDocument()
  })

  it('renders loading skeletons when loading', () => {
    renderSheet({ loading: true, setlists: [] })
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThanOrEqual(3)
  })

  it('shows empty state when no setlists and not loading', () => {
    renderSheet({ setlists: [], loading: false })
    expect(screen.getByText('No editable setlists found')).toBeInTheDocument()
  })

  it('shows no-results message when search yields zero results', () => {
    renderSheet({ setlists: [], loading: false, searchQuery: 'nonexistent' })
    expect(screen.getByText(/No setlists match/)).toBeInTheDocument()
    expect(screen.getByText(/nonexistent/)).toBeInTheDocument()
  })

  it('does not render content when open=false', () => {
    renderSheet({ isOpen: false })
    expect(screen.queryByText('Shabbat Morning')).not.toBeInTheDocument()
    expect(screen.queryByText('Add to Setlist')).not.toBeInTheDocument()
  })
})
