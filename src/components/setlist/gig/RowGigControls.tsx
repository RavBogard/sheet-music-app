'use client'

import { ArrowRight, Plus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { DirectionalIcon } from '@/components/i18n/DirectionalIcon'
import { KEY_OPTIONS_DATA } from '@/components/setlist/grid/cells/KeyCell'
import { useT } from '@/i18n/client'
import { formatDuration, parseDuration, rowDuration, singerKeysOf } from '@/lib/gig/display'
import { SingerKeysSchema } from '@/lib/gig/model'
import { cn } from '@/lib/utils'

/**
 * BET-5 row controls for the setlist editor: the inline length field, the
 * segue toggle and the singer-keys detail. Each sits inside a row whose tap
 * opens the row editor and whose long press opens its menu, so each one keeps
 * its own pointer and key events (stopPropagation) and has a 44px target.
 */

type Patch = Record<string, unknown>

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

/** The inline mm:ss length on a row. Empty clears it; text that is not a length is refused, not saved. */
export function DurationField({
    durationSec,
    title,
    onCommit,
}: {
    durationSec: unknown
    title?: string
    onCommit: (patch: Patch) => void
}) {
    const t = useT()
    const stored = rowDuration({ durationSec })
    const shown = stored === null ? '' : formatDuration(stored)
    const [text, setText] = useState(shown)
    const [invalid, setInvalid] = useState(false)
    const errorId = useId()
    useEffect(() => {
        setText(shown)
        setInvalid(false)
    }, [shown])

    const commit = () => {
        const next = parseDuration(text)
        if (next === undefined) {
            setInvalid(true)
            return
        }
        setInvalid(false)
        if (next === stored || (next === 0 && stored === null)) {
            setText(shown)
            return
        }
        onCommit({ durationSec: next === null || next === 0 ? null : next })
    }

    return (
        <span className="relative shrink-0" onClick={stop} onPointerDown={stop}>
            <input
                type="text"
                inputMode="text"
                autoComplete="off"
                data-testid="row-duration"
                value={text}
                placeholder={t('gig.durationPlaceholder')}
                aria-label={title ? t('gig.durationAria', { title }) : t('gig.durationAriaUntitled')}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                onChange={(e) => {
                    setText(e.target.value)
                    if (invalid) setInvalid(false)
                }}
                onBlur={commit}
                onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') {
                        setText(shown)
                        setInvalid(false)
                    }
                }}
                className={cn(
                    'tnum h-11 w-[4.5rem] rounded-md border bg-background px-2 text-center text-sm font-semibold text-foreground',
                    'placeholder:font-normal placeholder:text-muted-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    invalid ? 'border-warning-line' : 'border-input',
                )}
            />
            {invalid ? (
                <span id={errorId} role="alert" className="sr-only">
                    {t('gig.durationInvalid')}
                </span>
            ) : null}
        </span>
    )
}

/** The small "→" toggle: this song runs straight into the next one. */
export function SegueToggle({ segue, onCommit }: { segue: boolean; onCommit: (patch: Patch) => void }) {
    const t = useT()
    return (
        <button
            type="button"
            data-testid="row-segue"
            aria-pressed={segue}
            aria-label={t('gig.segueToggle')}
            onClick={(e) => {
                e.stopPropagation()
                onCommit({ segue: !segue })
            }}
            onPointerDown={stop}
            onKeyDown={stop}
            className={cn(
                'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'transition-colors duration-150 motion-reduce:transition-none',
                segue ? 'bg-accent text-brand' : 'text-muted-foreground/60 hover:bg-accent hover:text-foreground',
            )}
        >
            <DirectionalIcon icon={ArrowRight} aria-hidden className={cn('h-5 w-5', segue && 'stroke-[2.75]')} />
        </button>
    )
}

interface DraftLine {
    id: number
    musician: string
    key: string
}

let nextLineId = 1
const linesOf = (singerKeys: unknown): DraftLine[] =>
    singerKeysOf({ singerKeys }).map((e) => ({ id: nextLineId++, musician: e.musician, key: e.key }))

/**
 * The row detail's singer → key list. Records what the band told the author;
 * it never fills in a key for anyone. A line is saved once it has both a name
 * and a key; the same singer twice is refused with a sentence, not saved.
 */
export function SingerKeysEditor({
    singerKeys,
    onCommit,
}: {
    singerKeys: unknown
    onCommit: (patch: Patch) => void
}) {
    const t = useT()
    const storedJson = JSON.stringify(singerKeysOf({ singerKeys }))
    const [lines, setLines] = useState<DraftLine[]>(() => linesOf(singerKeys))
    const [duplicate, setDuplicate] = useState(false)
    useEffect(() => {
        setLines(linesOf(JSON.parse(storedJson)))
        setDuplicate(false)
    }, [storedJson])

    const commit = (next: DraftLine[]) => {
        const complete = next
            .map((l) => ({ musician: l.musician.trim(), key: l.key }))
            .filter((l) => l.musician && l.key)
        const parsed = SingerKeysSchema.safeParse(complete)
        if (!parsed.success) {
            setDuplicate(true)
            return
        }
        setDuplicate(false)
        if (JSON.stringify(parsed.data) !== storedJson) onCommit({ singerKeys: parsed.data })
    }

    const update = (id: number, patch: Partial<DraftLine>) =>
        setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)))

    const inputBase =
        'h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

    return (
        <fieldset data-testid="singer-keys" className="mb-4">
            <legend className="mb-1 block text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
                {t('gig.singerKeysHeading')}
            </legend>
            <ul className="flex flex-col gap-2">
                {lines.map((line) => (
                    <li key={line.id} className="flex items-center gap-2" data-testid="singer-key-line">
                        <input
                            type="text"
                            value={line.musician}
                            maxLength={100}
                            aria-label={t('gig.singerName')}
                            placeholder={t('gig.singerName')}
                            onChange={(e) => update(line.id, { musician: e.target.value })}
                            onBlur={() => commit(lines)}
                            className={cn(inputBase, 'min-w-0 flex-1')}
                        />
                        <select
                            value={line.key}
                            aria-label={t('gig.singerKey')}
                            onChange={(e) => {
                                const next = lines.map((l) => (l.id === line.id ? { ...l, key: e.target.value } : l))
                                setLines(next)
                                commit(next)
                            }}
                            className={cn(inputBase, 'tnum w-28 font-semibold')}
                        >
                            <option value="">{t('gig.singerKeyNone')}</option>
                            {KEY_OPTIONS_DATA.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            aria-label={
                                line.musician.trim()
                                    ? t('gig.removeSinger', { name: line.musician.trim() })
                                    : t('gig.removeSingerUntitled')
                            }
                            onClick={() => {
                                const next = lines.filter((l) => l.id !== line.id)
                                setLines(next)
                                commit(next)
                            }}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X aria-hidden className="h-4 w-4" />
                        </button>
                    </li>
                ))}
            </ul>
            {duplicate ? (
                <p role="alert" data-testid="singer-keys-duplicate" className="mt-2 text-xs font-semibold text-warning-line">
                    {t('gig.singerKeysDuplicate')}
                </p>
            ) : null}
            {lines.length < 12 ? (
                <button
                    type="button"
                    data-testid="singer-key-add"
                    onClick={() => setLines((cur) => [...cur, { id: nextLineId++, musician: '', key: '' }])}
                    className="mt-2 inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-accent cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Plus aria-hidden className="h-4 w-4" />
                    {t('gig.addSinger')}
                </button>
            ) : null}
        </fieldset>
    )
}
