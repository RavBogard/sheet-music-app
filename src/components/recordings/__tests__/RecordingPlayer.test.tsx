import '@testing-library/jest-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RecordingPlayer } from '../RecordingPlayer'

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('RecordingPlayer', () => {
    it('points at the public file route and loads nothing until played', () => {
        render(<RecordingPlayer recordingId="rec1" title="Shir Shabbat" />)
        const audio = document.querySelector('audio')!
        expect(audio.getAttribute('preload')).toBe('none')
        expect(audio.getAttribute('src')).toBe('/api/recordings/file/rec1')
        expect(screen.getByText('Shir Shabbat')).toBeInTheDocument()
    })

    it('starting one player pauses the other', () => {
        vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
            Object.defineProperty(this, 'paused', { value: false, configurable: true })
            return Promise.resolve()
        })
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
            Object.defineProperty(this, 'paused', { value: true, configurable: true })
        })
        render(
            <>
                <RecordingPlayer recordingId="a" title="Take A" />
                <RecordingPlayer recordingId="b" title="Take B" />
            </>,
        )
        const [a, b] = screen.getAllByTestId('recording-player-toggle')
        const audios = document.querySelectorAll('audio')
        fireEvent.click(a)
        fireEvent.play(audios[0])
        expect(pause.mock.contexts).not.toContain(audios[0])
        fireEvent.click(b)
        fireEvent.play(audios[1])
        expect(pause.mock.contexts).toContain(audios[0])
    })

    it('compact drops the title but keeps an accessible name', () => {
        render(<RecordingPlayer recordingId="a" title="Take A" compact />)
        expect(screen.queryByText('Take A')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Take A/ })).toBeInTheDocument()
    })
})
