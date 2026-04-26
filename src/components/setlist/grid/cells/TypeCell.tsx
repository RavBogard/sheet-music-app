'use client'

import {
    ArrowRight,
    BookOpen,
    Heading,
    Heart,
    Music,
    StickyNote,
} from 'lucide-react'

import {
    DropdownCell,
    type DropdownCellProps,
    type DropdownOption,
} from './DropdownCell'

// Exported for v50-05-03 BatchActionBar reuse — single source of truth for
// the type list across the cell editor and the bulk-edit toolbar.
export const TYPE_OPTIONS: DropdownOption[] = [
    {
        value: 'song',
        label: 'Song',
        icon: <Music className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'reading',
        label: 'Reading',
        icon: <BookOpen className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'prayer',
        label: 'Prayer',
        icon: <Heart className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'transition',
        label: 'Transition',
        icon: <ArrowRight className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'section',
        label: 'Section header',
        icon: <Heading className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'note',
        label: 'Note',
        icon: <StickyNote className="h-3.5 w-3.5" aria-hidden />,
    },
]

export type TypeCellProps = Omit<
    DropdownCellProps,
    'options' | 'placeholder' | 'allowFreeText' | 'ariaLabel'
> & {
    ariaLabel?: string
}

export function TypeCell(props: TypeCellProps) {
    return (
        <DropdownCell
            {...props}
            options={TYPE_OPTIONS}
            placeholder="Pick type"
            ariaLabel={props.ariaLabel ?? 'Track type'}
            renderDisplay={(value) => {
                const v = (value ?? 'song') as string
                const opt = TYPE_OPTIONS.find((o) => o.value === v)
                return (
                    <span className="inline-flex items-center gap-1.5 capitalize text-muted-foreground">
                        {opt?.icon ?? null}
                        <span>{opt?.label.toLowerCase() ?? v}</span>
                    </span>
                )
            }}
        />
    )
}
