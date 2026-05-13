import { describe, it, expect } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { ImageScoreViewer } from '../ImageScoreViewer'

describe('ImageScoreViewer', () => {
    it('renders an <img> with the passed url', () => {
        render(<ImageScoreViewer url="https://example.com/chart.png" alt="Test Chart" />)
        const img = screen.getByAltText('Test Chart') as HTMLImageElement
        expect(img.tagName).toBe('IMG')
        expect(img.getAttribute('src')).toBe('https://example.com/chart.png')
    })

    it('falls back to default alt when none provided', () => {
        render(<ImageScoreViewer url="https://example.com/chart.png" />)
        expect(screen.getByAltText('Chart')).toBeTruthy()
    })

    it('shows error state on image onError', () => {
        render(<ImageScoreViewer url="https://example.com/missing.png" alt="x" />)
        const img = screen.getByAltText('x')
        fireEvent.error(img)
        expect(screen.getByText(/Image failed to load/i)).toBeTruthy()
    })

    it('shows empty-state message when url is blank', () => {
        render(<ImageScoreViewer url="" alt="x" />)
        expect(screen.getByText(/No chart to display/i)).toBeTruthy()
    })
})
