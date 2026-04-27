'use client'

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from 'cmdk'
import { useEffect, useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { DropdownCell, type DropdownCellProps } from './DropdownCell'

// v51-01-01: chromatic 12-major + 12-minor data, replacing the prior
// frequency-ordered KEY_OPTIONS_DATA.
//
// Storage values preserved verbatim from the prior data so existing
// setlists (24 legacy + ongoing) continue to round-trip correctly:
// the major triad uses 'Db' / 'Eb' / 'Ab' / 'Bb' (flat side) and 'F#'
// (sharp side); the minor triad uses 'C#m' / 'F#m' / 'G#m' (sharp
// side) and 'Ebm' / 'Bbm' (flat side). Display labels unify the
// enharmonic pair as "C♯/D♭" / "C♯m/D♭m" so musicians see both glyphs
// regardless of which side the storage value lives on.

export const KEY_OPTIONS_MAJOR: Array<{ value: string; label: string }> = [
    { value: 'C',  label: 'C' },
    { value: 'Db', label: 'C♯/D♭' },
    { value: 'D',  label: 'D' },
    { value: 'Eb', label: 'D♯/E♭' },
    { value: 'E',  label: 'E' },
    { value: 'F',  label: 'F' },
    { value: 'F#', label: 'F♯/G♭' },
    { value: 'G',  label: 'G' },
    { value: 'Ab', label: 'G♯/A♭' },
    { value: 'A',  label: 'A' },
    { value: 'Bb', label: 'A♯/B♭' },
    { value: 'B',  label: 'B' },
]

export const KEY_OPTIONS_MINOR: Array<{ value: string; label: string }> = [
    { value: 'Cm',  label: 'Cm' },
    { value: 'C#m', label: 'C♯m/D♭m' },
    { value: 'Dm',  label: 'Dm' },
    { value: 'Ebm', label: 'D♯m/E♭m' },
    { value: 'Em',  label: 'Em' },
    { value: 'Fm',  label: 'Fm' },
    { value: 'F#m', label: 'F♯m/G♭m' },
    { value: 'Gm',  label: 'Gm' },
    { value: 'G#m', label: 'G♯m/A♭m' },
    { value: 'Am',  label: 'Am' },
    { value: 'Bbm', label: 'A♯m/B♭m' },
    { value: 'Bm',  label: 'Bm' },
]

// Flat union exported for BatchActionBar's bulk-key popover, which
// renders both major + minor in one list. Preserves the prior export
// contract (single KEY_OPTIONS_DATA array) so the BatchActionBar
// import keeps working.
export const KEY_OPTIONS_DATA: Array<{ value: string; label: string }> = [
    ...KEY_OPTIONS_MAJOR,
    ...KEY_OPTIONS_MINOR,
]

function inferDefaultTab(value: string | undefined): 'major' | 'minor' {
    if (!value) return 'major'
    return value.endsWith('m') ? 'minor' : 'major'
}

export type KeyCellProps = Omit<
    DropdownCellProps,
    'options' | 'placeholder' | 'allowFreeText' | 'ariaLabel' | 'mode' | 'renderPickerContent'
> & {
    ariaLabel?: string
}

export function KeyCell(props: KeyCellProps) {
    const { value } = props

    return (
        <DropdownCell
            {...props}
            // Pass an empty options list — the picker content is fully
            // overridden via renderPickerContent below. Keeps the
            // DropdownCell shell (trigger, focus, commit plumbing).
            options={[]}
            placeholder="Pick key"
            mode="discrete"
            ariaLabel={props.ariaLabel ?? 'Track key'}
            renderPickerContent={({ commit }) => (
                <KeyPickerTabs currentValue={value} onPick={commit} />
            )}
        />
    )
}

interface KeyPickerTabsProps {
    currentValue: string | undefined
    onPick: (value: string) => void
}

function KeyPickerTabs({ currentValue, onPick }: KeyPickerTabsProps) {
    const [tab, setTab] = useState<'major' | 'minor'>(() =>
        inferDefaultTab(currentValue),
    )

    // Keep tab in sync if the cell's value changes externally (e.g.,
    // bulk-edit landed) while the picker is open.
    useEffect(() => {
        setTab(inferDefaultTab(currentValue))
    }, [currentValue])

    return (
        <Tabs
            value={tab}
            onValueChange={(next) => setTab(next as 'major' | 'minor')}
            className="w-[16rem] gap-0"
            data-testid="key-picker-tabs"
        >
            <TabsList className="m-2 grid grid-cols-2">
                <TabsTrigger
                    value="major"
                    data-testid="key-picker-tab-major"
                    className="[@media(pointer:coarse)]:min-h-[44px]"
                >
                    Major
                </TabsTrigger>
                <TabsTrigger
                    value="minor"
                    data-testid="key-picker-tab-minor"
                    className="[@media(pointer:coarse)]:min-h-[44px]"
                >
                    Minor
                </TabsTrigger>
            </TabsList>
            <TabsContent value="major" className="mt-0">
                <KeyList
                    options={KEY_OPTIONS_MAJOR}
                    currentValue={currentValue}
                    onPick={onPick}
                    testIdSuffix="major"
                />
            </TabsContent>
            <TabsContent value="minor" className="mt-0">
                <KeyList
                    options={KEY_OPTIONS_MINOR}
                    currentValue={currentValue}
                    onPick={onPick}
                    testIdSuffix="minor"
                />
            </TabsContent>
        </Tabs>
    )
}

interface KeyListProps {
    options: Array<{ value: string; label: string }>
    currentValue: string | undefined
    onPick: (value: string) => void
    testIdSuffix: string
}

function KeyList({ options, currentValue, onPick, testIdSuffix }: KeyListProps) {
    return (
        <Command loop data-testid={`key-picker-list-${testIdSuffix}`}>
            <CommandList className="max-h-72 overflow-y-auto py-1">
                <CommandEmpty className="px-3 py-2 text-sm text-muted-foreground">
                    No matches.
                </CommandEmpty>
                <CommandGroup>
                    {options.map((opt) => (
                        <CommandItem
                            key={opt.value}
                            value={`${opt.label} ${opt.value}`}
                            onSelect={() => onPick(opt.value)}
                            data-testid={`key-picker-option-${opt.value}`}
                            className={cn(
                                'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm aria-selected:bg-indigo-500/15',
                                '[@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:py-2',
                                currentValue === opt.value &&
                                    'font-semibold text-indigo-200 bg-indigo-500/10',
                            )}
                        >
                            <span className="truncate">{opt.label}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    )
}
