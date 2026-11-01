'use client'

import { useEffect, useState } from 'react'

import { useT } from '@/i18n/client'
import { useFormat } from '@/i18n/format-client'
import { isFamilyOrg, storedWeek } from '@/lib/family/week-key'
import { useOrg } from '@/lib/org/org-context'

/**
 * BET-6 — the family week in a setlist's head: a quiet parasha line
 * ("Parashat Bereshit") and, on a service linked to a Beit Mitzvah ceremony,
 * a read-only line (student names, slot, reading reference names, rehearsal
 * dates). CRC only; renders nothing for any other tenant, for a stale or
 * missing week, or when the card cannot be read.
 *
 * Inserted into the editor head and the Perform setlist head. Option B: each
 * is one compact line of small Quiet Ink metadata, no block, no pill, no
 * shadow. The full Beit Mitzvah line is in the title attribute when it
 * truncates.
 */

interface CeremonyCardData {
    ceremonyType: 'morning' | 'havdalah'
    localDate: string
    students: string[]
    slot: string | null
    torahRef: string | null
    haftarahRef: string | null
    rehearsals: string[]
}

export interface SetlistFamilyHeadProps {
    setlistId: string
    /** The live setlist (raw, serialized or local); only the BET-6 fields are read. */
    setlist: Record<string, unknown> | null | undefined
    className?: string
}

export function SetlistFamilyHead({ setlistId, setlist, className }: SetlistFamilyHeadProps) {
    const org = useOrg()
    const family = isFamilyOrg(org)
    const week = family ? storedWeek(setlist ?? null, org) : null
    const ceremonyId = family && typeof setlist?.ceremonyId === 'string' ? setlist.ceremonyId : null
    if (!week?.parasha && !ceremonyId) return null
    return (
        <div className={className} data-testid="setlist-family-head">
            {week?.parasha && <ParashaLine name={week.parasha.name} />}
            {ceremonyId && <CeremonyCard setlistId={setlistId} ceremonyId={ceremonyId} />}
        </div>
    )
}

export function ParashaLine({ name }: { name: string }) {
    const t = useT()
    return (
        <p data-testid="family-parasha" className="text-xs font-medium text-muted-foreground truncate">
            {t('familyWeek.parasha', { name })}
        </p>
    )
}

function CeremonyCard({ setlistId, ceremonyId }: { setlistId: string; ceremonyId: string }) {
    const t = useT()
    const fmt = useFormat()
    const [card, setCard] = useState<CeremonyCardData | null>(null)

    useEffect(() => {
        let live = true
        setCard(null)
        fetch(`/api/setlists/${encodeURIComponent(setlistId)}/ceremony`)
            .then((r) => (r.ok ? r.json() : null))
            .then((body: { card?: CeremonyCardData | null } | null) => {
                if (live && body?.card && typeof body.card.localDate === 'string') setCard(body.card)
            })
            // Fail quietly: an unreachable portal or an offline iPad hides the card.
            .catch(() => {})
        return () => {
            live = false
        }
    }, [setlistId, ceremonyId])

    if (!card) return null
    const day = (d: string) => fmt.date(new Date(`${d}T12:00:00Z`), { weekday: 'short', month: 'short', day: 'numeric' })
    const service = card.slot ?? t(card.ceremonyType === 'havdalah' ? 'familyWeek.havdalah' : 'familyWeek.morning')
    const rows: Array<[string, string, string]> = [
        ['service', t('familyWeek.service'), `${service} · ${day(card.localDate)}`],
    ]
    if (card.torahRef) rows.push(['torah', t('familyWeek.torah'), card.torahRef])
    if (card.haftarahRef) rows.push(['haftarah', t('familyWeek.haftarah'), card.haftarahRef])
    if (card.rehearsals.length > 0) rows.push(['rehearsals', t('familyWeek.rehearsals'), card.rehearsals.map(day).join(' · ')])
    const full = [
        t('familyWeek.cardTitle'),
        card.students.join(' · '),
        ...rows.map(([id, label, value]) => (id === 'service' ? value : `${label} ${value}`)),
    ].filter(Boolean).join(' · ')

    // Option B: one compact line. The title stays a heading (screen readers
    // jump to it); each field keeps its label and its test id.
    return (
        <section
            data-testid="family-ceremony-card"
            aria-label={t('familyWeek.cardLabel')}
            title={full}
            className="tnum flex min-w-0 items-baseline gap-x-1.5 text-xs font-medium text-muted-foreground"
        >
            <h2 className="shrink-0 text-xs font-bold text-foreground">{t('familyWeek.cardTitle')}</h2>
            <p className="min-w-0 truncate">
                {card.students.length > 0 && (
                    <span data-testid="family-ceremony-students" className="font-semibold text-foreground">
                        {card.students.join(' · ')}
                    </span>
                )}
                {rows.map(([id, label, value], i) => (
                    <span key={id} data-testid={`family-ceremony-${id}`}>
                        {card.students.length > 0 || i > 0 ? <span aria-hidden="true"> · </span> : null}
                        {id !== 'service' && <span>{label} </span>}
                        <span className="text-foreground">{value}</span>
                    </span>
                ))}
            </p>
        </section>
    )
}
