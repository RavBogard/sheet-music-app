import '@testing-library/jest-dom'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    DeleteConfirmProvider,
    useDeleteConfirm,
    useDeleteConfirmOptional,
} from '../DeleteConfirmProvider'

// A tiny consumer component lets us drive `confirm()` from a button click.
function ConfirmTester({
    info,
    onResolve,
}: {
    info: Parameters<ReturnType<typeof useDeleteConfirm>['confirm']>[0]
    onResolve: (ok: boolean) => void
}) {
    const { confirm } = useDeleteConfirm()
    return (
        <button
            type="button"
            data-testid="trigger"
            onClick={async () => {
                const ok = await confirm(info)
                onResolve(ok)
            }}
        >
            Trigger
        </button>
    )
}

describe('DeleteConfirmProvider', () => {
    afterEach(() => {
        cleanup()
    })

    it('renders children + portal-mounted dialog (initially closed)', () => {
        render(
            <DeleteConfirmProvider>
                <span data-testid="child">hi</span>
            </DeleteConfirmProvider>,
        )
        expect(screen.getByTestId('child')).toBeInTheDocument()
        expect(
            screen.queryByTestId('delete-confirm-dialog'),
        ).not.toBeInTheDocument()
    })

    it('confirm({kind:"row"}) opens dialog with title="Delete row?" and quoted row title in description', async () => {
        const resolved: boolean[] = []
        render(
            <DeleteConfirmProvider>
                <ConfirmTester
                    info={{ kind: 'row', title: 'Adon Olam' }}
                    onResolve={(ok) => resolved.push(ok)}
                />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(screen.getByTestId('trigger'))
        await screen.findByTestId('delete-confirm-dialog')

        expect(screen.getByTestId('delete-confirm-title')).toHaveTextContent(
            'Delete row?',
        )
        expect(
            screen.getByTestId('delete-confirm-description'),
        ).toHaveTextContent('Adon Olam')
    })

    it('confirm({kind:"bulk", count: 5}) renders pluralized "Delete 5 rows?"', async () => {
        const resolved: boolean[] = []
        render(
            <DeleteConfirmProvider>
                <ConfirmTester
                    info={{ kind: 'bulk', count: 5 }}
                    onResolve={(ok) => resolved.push(ok)}
                />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(screen.getByTestId('trigger'))
        await screen.findByTestId('delete-confirm-dialog')

        expect(screen.getByTestId('delete-confirm-title')).toHaveTextContent(
            'Delete 5 rows?',
        )
    })

    it('confirm({kind:"bulk", count: 1}) singularizes to "1 row" not "1 rows"', async () => {
        const resolved: boolean[] = []
        render(
            <DeleteConfirmProvider>
                <ConfirmTester
                    info={{ kind: 'bulk', count: 1 }}
                    onResolve={(ok) => resolved.push(ok)}
                />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(screen.getByTestId('trigger'))
        await screen.findByTestId('delete-confirm-dialog')
        expect(screen.getByTestId('delete-confirm-title')).toHaveTextContent(
            'Delete 1 row?',
        )
    })

    it('Cancel resolves the promise with false and closes the dialog', async () => {
        const resolved: boolean[] = []
        render(
            <DeleteConfirmProvider>
                <ConfirmTester
                    info={{ kind: 'row', title: 'Aleinu' }}
                    onResolve={(ok) => resolved.push(ok)}
                />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(screen.getByTestId('trigger'))
        await screen.findByTestId('delete-confirm-dialog')
        fireEvent.click(screen.getByTestId('delete-confirm-cancel'))

        await waitFor(() => expect(resolved).toEqual([false]))
        await waitFor(() =>
            expect(
                screen.queryByTestId('delete-confirm-dialog'),
            ).not.toBeInTheDocument(),
        )
    })

    it('Delete resolves the promise with true and closes the dialog', async () => {
        const resolved: boolean[] = []
        render(
            <DeleteConfirmProvider>
                <ConfirmTester
                    info={{ kind: 'row', title: 'Aleinu' }}
                    onResolve={(ok) => resolved.push(ok)}
                />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(screen.getByTestId('trigger'))
        await screen.findByTestId('delete-confirm-dialog')
        fireEvent.click(screen.getByTestId('delete-confirm-action'))

        await waitFor(() => expect(resolved).toEqual([true]))
        await waitFor(() =>
            expect(
                screen.queryByTestId('delete-confirm-dialog'),
            ).not.toBeInTheDocument(),
        )
    })

    it('Escape (via Radix onOpenChange→false) resolves the promise with false', async () => {
        const resolved: boolean[] = []
        render(
            <DeleteConfirmProvider>
                <ConfirmTester
                    info={{ kind: 'row', title: 'Aleinu' }}
                    onResolve={(ok) => resolved.push(ok)}
                />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(screen.getByTestId('trigger'))
        const dialog = await screen.findByTestId('delete-confirm-dialog')
        fireEvent.keyDown(dialog, { key: 'Escape' })

        await waitFor(() => expect(resolved).toEqual([false]))
    })

    it('cancel-and-replace: opening a second confirm while the first is open resolves the first as false', async () => {
        const resolved: boolean[] = []
        function DoubleTrigger() {
            const { confirm } = useDeleteConfirm()
            return (
                <>
                    <button
                        type="button"
                        data-testid="trigger-1"
                        onClick={async () => {
                            const ok = await confirm({
                                kind: 'row',
                                title: 'First',
                            })
                            resolved.push(ok)
                        }}
                    >
                        First
                    </button>
                    <button
                        type="button"
                        data-testid="trigger-2"
                        onClick={async () => {
                            const ok = await confirm({
                                kind: 'bulk',
                                count: 7,
                            })
                            resolved.push(ok)
                        }}
                    >
                        Second
                    </button>
                </>
            )
        }
        render(
            <DeleteConfirmProvider>
                <DoubleTrigger />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(screen.getByTestId('trigger-1'))
        await screen.findByTestId('delete-confirm-dialog')

        fireEvent.click(screen.getByTestId('trigger-2'))

        // First confirm should have resolved as false; second is now in flight.
        await waitFor(() => expect(resolved).toEqual([false]))
        await waitFor(() =>
            expect(screen.getByTestId('delete-confirm-title')).toHaveTextContent(
                'Delete 7 rows?',
            ),
        )

        fireEvent.click(screen.getByTestId('delete-confirm-action'))
        await waitFor(() => expect(resolved).toEqual([false, true]))
    })

    it('useDeleteConfirmOptional returns null when no provider is mounted', () => {
        function Probe() {
            const ctx = useDeleteConfirmOptional()
            return (
                <span data-testid="probe-result">
                    {ctx === null ? 'null' : 'present'}
                </span>
            )
        }
        render(<Probe />)
        expect(screen.getByTestId('probe-result')).toHaveTextContent('null')
    })

    it('useDeleteConfirm throws if used outside the provider', () => {
        function Bad() {
            useDeleteConfirm()
            return null
        }
        // Suppress React's error log for this expected throw.
        const spy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        expect(() => render(<Bad />)).toThrow(
            'useDeleteConfirm must be used inside <DeleteConfirmProvider>',
        )
        spy.mockRestore()
    })
})
