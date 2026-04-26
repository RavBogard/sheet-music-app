'use client'

import { DropdownCell, type DropdownCellProps } from './DropdownCell'

// 24-entry chromatic key set (12 majors, 12 minors). Display order roughly
// follows worship-band frequency; exact ranking by recency is a Task 3
// enhancement. cmdk's fuzzy filter handles "type to find" against this list.
const KEY_OPTIONS_DATA: Array<{ value: string; label: string }> = [
    { value: 'Dm', label: 'Dm' },
    { value: 'D', label: 'D' },
    { value: 'F', label: 'F' },
    { value: 'G', label: 'G' },
    { value: 'A', label: 'A' },
    { value: 'Bb', label: 'B♭' },
    { value: 'C', label: 'C' },
    { value: 'E', label: 'E' },
    { value: 'Em', label: 'Em' },
    { value: 'Am', label: 'Am' },
    { value: 'Gm', label: 'Gm' },
    { value: 'Ab', label: 'A♭' },
    { value: 'B', label: 'B' },
    { value: 'Cm', label: 'Cm' },
    { value: 'C#m', label: 'C♯m' },
    { value: 'Eb', label: 'E♭' },
    { value: 'Ebm', label: 'E♭m' },
    { value: 'F#', label: 'F♯' },
    { value: 'F#m', label: 'F♯m' },
    { value: 'Fm', label: 'Fm' },
    { value: 'Bbm', label: 'B♭m' },
    { value: 'Bm', label: 'Bm' },
    { value: 'Db', label: 'D♭' },
    { value: 'G#m', label: 'G♯m' },
]

export type KeyCellProps = Omit<
    DropdownCellProps,
    'options' | 'placeholder' | 'allowFreeText' | 'ariaLabel'
> & {
    ariaLabel?: string
}

export function KeyCell(props: KeyCellProps) {
    return (
        <DropdownCell
            {...props}
            options={KEY_OPTIONS_DATA}
            placeholder="Pick key"
            ariaLabel={props.ariaLabel ?? 'Track key'}
        />
    )
}
