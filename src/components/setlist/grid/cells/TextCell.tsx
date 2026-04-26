'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

export interface TextCellProps {
    value: string | number | undefined
    onCommit: (next: string) => void
    isFocused: boolean
    onFocus: () => void
    onMoveFocus?: (direction: 'up' | 'down' | 'left' | 'right') => void
    onCellKeyDown?: (event: React.KeyboardEvent) => boolean
    placeholder?: string
    type?: 'text' | 'number'
    ariaLabel: string
    className?: string
}

const PRINTABLE_KEY_RE = /^[ -~]$/ // ASCII printable

function asString(v: unknown): string {
    if (v === undefined || v === null) return ''
    return String(v)
}

export function TextCell({
    value,
    onCommit,
    isFocused,
    onFocus,
    onMoveFocus,
    onCellKeyDown,
    placeholder,
    type = 'text',
    ariaLabel,
    className,
}: TextCellProps) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState<string>(asString(value))
    const buttonRef = useRef<HTMLButtonElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Keep draft in sync when an external write replaces our value.
    useEffect(() => {
        if (!editing) setDraft(asString(value))
    }, [value, editing])

    // When focused without editing, ensure the button takes DOM focus too.
    useEffect(() => {
        if (isFocused && !editing && buttonRef.current) {
            // Defer to avoid stealing focus during a parent commit.
            const t = setTimeout(() => {
                if (
                    document.activeElement !== buttonRef.current &&
                    !editing
                ) {
                    buttonRef.current?.focus()
                }
            }, 0)
            return () => clearTimeout(t)
        }
        return
    }, [isFocused, editing])

    const enterEditMode = (initial?: string) => {
        setDraft(initial !== undefined ? initial : asString(value))
        setEditing(true)
    }

    const commit = (advance?: 'up' | 'down' | 'left' | 'right') => {
        if (draft !== asString(value)) {
            onCommit(draft)
        }
        setEditing(false)
        if (advance) onMoveFocus?.(advance)
    }

    const cancel = () => {
        setDraft(asString(value))
        setEditing(false)
    }

    const handleButtonKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            enterEditMode()
            return
        }
        if (PRINTABLE_KEY_RE.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault()
            enterEditMode(e.key)
            return
        }
        // Defer arrow keys to the grid-level handler.
        onCellKeyDown?.(e)
    }

    const handleInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            commit(e.shiftKey ? 'up' : 'down')
            return
        }
        if (e.key === 'Tab') {
            e.preventDefault()
            commit(e.shiftKey ? 'left' : 'right')
            return
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
            return
        }
        // Don't preventDefault — let arrow keys move within the input text.
    }

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commit()}
                onKeyDown={handleInputKeyDown}
                aria-label={ariaLabel}
                placeholder={placeholder}
                type={type}
                inputMode={type === 'number' ? 'numeric' : 'text'}
                autoFocus
                data-testid="text-cell-input"
                className={cn(
                    'h-10 w-full rounded-sm bg-transparent px-1 py-0',
                    'border-2 border-indigo-500',
                    'text-sm font-medium outline-none',
                    'focus-visible:outline-none',
                    className,
                )}
            />
        )
    }

    return (
        <button
            ref={buttonRef}
            type="button"
            tabIndex={isFocused ? 0 : -1}
            onFocus={onFocus}
            onClick={onFocus}
            onDoubleClick={() => enterEditMode()}
            onKeyDown={handleButtonKeyDown}
            aria-label={ariaLabel}
            data-testid="text-cell-button"
            className={cn(
                'inline-flex h-10 w-full min-w-0 items-center px-1 text-left',
                'truncate text-sm',
                'cursor-text rounded-sm border border-transparent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                isFocused && 'ring-2 ring-indigo-400/60 bg-indigo-500/5',
                className,
            )}
        >
            {asString(value) || (
                <span className="text-muted-foreground/50">
                    {placeholder ?? ''}
                </span>
            )}
        </button>
    )
}
