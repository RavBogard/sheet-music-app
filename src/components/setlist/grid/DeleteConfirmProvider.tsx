'use client'

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

/**
 * v50-05-03 destructive-action confirmation contract. Replaces the per-row
 * `confirmDeleteWithTitle(title)` shape with a discriminated union so bulk
 * deletes can render N-row copy without string-parsing the title back out.
 * (`confirmDeleteWithTitle` stays as a legacy alias on SetlistGridProps for
 * tests and back-compat — see the prop wiring in SetlistGrid.tsx.)
 */
export type ConfirmInfo =
    | { kind: 'row'; title: string }
    | { kind: 'bulk'; count: number }

export interface DeleteConfirmContextValue {
    confirm: (info: ConfirmInfo) => Promise<boolean>
}

const DeleteConfirmContext = createContext<DeleteConfirmContextValue | null>(
    null,
)

/**
 * Throws if no provider is mounted. Use when the consumer unconditionally
 * requires the dialog (e.g., a button that only makes sense inside a wrapped
 * route).
 */
export function useDeleteConfirm(): DeleteConfirmContextValue {
    const ctx = useContext(DeleteConfirmContext)
    if (!ctx) {
        throw new Error(
            'useDeleteConfirm must be used inside <DeleteConfirmProvider>',
        )
    }
    return ctx
}

/**
 * Returns null if no provider is mounted — used by SetlistGrid which falls
 * back to the prop injection or window.confirm in test contexts that don't
 * mount the provider.
 */
export function useDeleteConfirmOptional(): DeleteConfirmContextValue | null {
    return useContext(DeleteConfirmContext)
}

interface DialogState {
    open: boolean
    payload: ConfirmInfo | null
}

export function DeleteConfirmProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<DialogState>({
        open: false,
        payload: null,
    })
    // Stash the in-flight resolver in a ref so AlertDialog button handlers
    // (which only see the latest closure) can resolve the right Promise.
    const resolverRef = useRef<((ok: boolean) => void) | null>(null)

    const confirm = useCallback(async (info: ConfirmInfo) => {
        // Cancel-and-replace: if a prior confirm is still pending, resolve it
        // as false so the caller can move on. Predictable + simple; queueing
        // is an option for future refinement if double-confirm flows show up.
        if (resolverRef.current) {
            resolverRef.current(false)
            resolverRef.current = null
        }

        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve
            setState({ open: true, payload: info })
        })
    }, [])

    const settle = useCallback((ok: boolean) => {
        const resolve = resolverRef.current
        resolverRef.current = null
        setState({ open: false, payload: null })
        resolve?.(ok)
    }, [])

    const value = useMemo<DeleteConfirmContextValue>(
        () => ({ confirm }),
        [confirm],
    )

    const payload = state.payload
    const titleText =
        payload?.kind === 'bulk'
            ? `Delete ${payload.count} ${payload.count === 1 ? 'row' : 'rows'}?`
            : 'Delete row?'
    const descriptionText =
        payload?.kind === 'row'
            ? `Delete “${payload.title || 'row'}”? This cannot be undone.`
            : 'This cannot be undone.'

    return (
        <DeleteConfirmContext.Provider value={value}>
            {children}
            <AlertDialog
                open={state.open}
                onOpenChange={(next) => {
                    if (!next) settle(false)
                }}
            >
                <AlertDialogContent data-testid="delete-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle data-testid="delete-confirm-title">
                            {titleText}
                        </AlertDialogTitle>
                        <AlertDialogDescription data-testid="delete-confirm-description">
                            {descriptionText}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            data-testid="delete-confirm-cancel"
                            onClick={() => settle(false)}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            data-testid="delete-confirm-action"
                            onClick={() => settle(true)}
                            className={cn(
                                'bg-red-600 hover:bg-red-700 text-white',
                            )}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DeleteConfirmContext.Provider>
    )
}
