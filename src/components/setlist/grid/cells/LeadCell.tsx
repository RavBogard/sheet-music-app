'use client'

import { useMemo } from 'react'

import {
    DropdownCell,
    type DropdownCellProps,
    type DropdownOption,
} from './DropdownCell'

export type LeadCellProps = Omit<
    DropdownCellProps,
    'options' | 'placeholder' | 'allowFreeText' | 'ariaLabel'
> & {
    /** Musicians already used elsewhere in this setlist (top group). */
    setlistLeads?: string[]
    /** Musicians known elsewhere in the library (mid group). */
    libraryLeads?: string[]
    ariaLabel?: string
}

export function LeadCell({
    setlistLeads = [],
    libraryLeads = [],
    ...rest
}: LeadCellProps) {
    const options = useMemo<DropdownOption[]>(() => {
        const seen = new Set<string>()
        const out: DropdownOption[] = []
        for (const m of setlistLeads) {
            if (!m || seen.has(m)) continue
            seen.add(m)
            out.push({ value: m, label: m, group: 'In this setlist' })
        }
        for (const m of libraryLeads) {
            if (!m || seen.has(m)) continue
            seen.add(m)
            out.push({ value: m, label: m, group: 'Library' })
        }
        return out
    }, [setlistLeads, libraryLeads])

    return (
        <DropdownCell
            {...rest}
            options={options}
            placeholder="Pick lead"
            allowFreeText
            ariaLabel={rest.ariaLabel ?? 'Track lead musician'}
        />
    )
}
