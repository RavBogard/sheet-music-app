import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SetlistGridTopBar } from '../SetlistGridTopBar'

describe('SetlistGridTopBar', () => {
    it('renders the name and event-date label', () => {
        render(
            <SetlistGridTopBar
                name="Shabbat Morning"
                eventDateLabel="FRI MAY 16"
                onBack={vi.fn()}
            />,
        )
        expect(screen.getByText('Shabbat Morning')).toBeInTheDocument()
        expect(screen.getByText('FRI MAY 16')).toBeInTheDocument()
    })

    it('fires onBack when the back button is clicked', async () => {
        const user = userEvent.setup()
        const onBack = vi.fn()
        render(<SetlistGridTopBar name="Shabbat Morning" onBack={onBack} />)

        await user.click(screen.getByRole('button', { name: 'Back' }))
        expect(onBack).toHaveBeenCalledTimes(1)
    })

    it('renders the edit-meta pencil button and fires onEditMeta when provided', async () => {
        const user = userEvent.setup()
        const onEditMeta = vi.fn()
        render(
            <SetlistGridTopBar
                name="Shabbat Morning"
                onBack={vi.fn()}
                onEditMeta={onEditMeta}
            />,
        )

        const editBtn = screen.getByRole('button', {
            name: 'Edit setlist details',
        })
        expect(editBtn).toBeInTheDocument()
        await user.click(editBtn)
        expect(onEditMeta).toHaveBeenCalledTimes(1)
    })

    it('omits the edit-meta button when onEditMeta is not provided', () => {
        render(<SetlistGridTopBar name="Shabbat Morning" onBack={vi.fn()} />)
        expect(
            screen.queryByRole('button', { name: 'Edit setlist details' }),
        ).not.toBeInTheDocument()
    })
})
