import '@testing-library/jest-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ImporterModal } from '../ImporterModal'

afterEach(cleanup)

// v70-08-03: regression guard for the cascading P1 — the CSV + Document upload
// controls must be keyboard-reachable (sr-only input + <label htmlFor>, not a
// display:none input behind a click-only <div>). Without this, the entire
// doc-import flow is keyboard-dead.
describe('ImporterModal accessibility', () => {
    it('exposes both file-upload controls with accessible names', () => {
        render(<ImporterModal open onOpenChange={() => {}} />)

        const csvInput = screen.getByLabelText(/upload a csv file/i)
        const docInput = screen.getByLabelText(
            /upload a service-outline document/i,
        )

        expect(csvInput).toBeInTheDocument()
        expect(docInput).toBeInTheDocument()
    })

    it('keeps the file inputs in the a11y tree (sr-only, not display:none)', () => {
        render(<ImporterModal open onOpenChange={() => {}} />)

        const csvInput = screen.getByLabelText(/upload a csv file/i)
        const docInput = screen.getByLabelText(
            /upload a service-outline document/i,
        )

        // `hidden` (display:none) removes an element from the tab order; the
        // dropzone fix uses `sr-only`, which keeps it focusable.
        for (const input of [csvInput, docInput]) {
            expect(input).toHaveClass('sr-only')
            expect(input).not.toHaveClass('hidden')
            expect(input).toHaveAttribute('type', 'file')
        }
    })
})
