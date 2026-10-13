'use client'

import {
    ArrowRight,
    BookOpen,
    Heading,
    Heart,
    Music,
    StickyNote,
} from 'lucide-react'

import { useMemo } from 'react'

import { DirectionalIcon } from '@/components/i18n/DirectionalIcon'
import { useT } from '@/i18n/client'
import type { T } from '@/i18n/core'

import {
    DropdownCell,
    type DropdownCellProps,
    type DropdownOption,
} from './DropdownCell'

// Exported for v50-05-03 BatchActionBar reuse — single source of truth for
// the type list across the cell editor and the bulk-edit toolbar. Labels are
// catalogue keys (phase 7): `typeOptions(t)` resolves them.
export const TYPE_OPTION_SPECS = [
    {
        value: 'song',
        labelKey: 'setlistGrid.typeSong',
        displayKey: 'setlistGrid.typeSongDisplay',
        icon: <Music className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'reading',
        labelKey: 'setlistGrid.typeReading',
        displayKey: 'setlistGrid.typeReadingDisplay',
        icon: <BookOpen className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'prayer',
        labelKey: 'setlistGrid.typePrayer',
        displayKey: 'setlistGrid.typePrayerDisplay',
        icon: <Heart className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'transition',
        labelKey: 'setlistGrid.typeTransition',
        displayKey: 'setlistGrid.typeTransitionDisplay',
        icon: <DirectionalIcon icon={ArrowRight} className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'section',
        labelKey: 'setlistGrid.typeSection',
        displayKey: 'setlistGrid.typeSectionDisplay',
        icon: <Heading className="h-3.5 w-3.5" aria-hidden />,
    },
    {
        value: 'note',
        labelKey: 'setlistGrid.typeNote',
        displayKey: 'setlistGrid.typeNoteDisplay',
        icon: <StickyNote className="h-3.5 w-3.5" aria-hidden />,
    },
] as const

export function typeOptions(t: T): DropdownOption[] {
    return TYPE_OPTION_SPECS.map((o) => ({ value: o.value, label: t(o.labelKey), icon: o.icon }))
}

export type TypeCellProps = Omit<
    DropdownCellProps,
    'options' | 'placeholder' | 'allowFreeText' | 'ariaLabel'
> & {
    ariaLabel?: string
}

export function TypeCell(props: TypeCellProps) {
    const t = useT()
    const options = useMemo(() => typeOptions(t), [t])
    return (
        <DropdownCell
            {...props}
            options={options}
            placeholder={t('setlistGrid.pickTypePlaceholder')}
            mode="discrete"
            ariaLabel={props.ariaLabel ?? t('setlistGrid.trackTypeGridAria')}
            renderDisplay={(value) => {
                const v = (value ?? 'song') as string
                const spec = TYPE_OPTION_SPECS.find((o) => o.value === v)
                return (
                    <span className="inline-flex items-center gap-1.5 capitalize text-muted-foreground">
                        {spec?.icon ?? null}
                        {/* Lower-case display form is its own catalogue entry (no toLowerCase on translated text). */}
                        <span>{spec ? t(spec.displayKey) : v}</span>
                    </span>
                )
            }}
        />
    )
}
