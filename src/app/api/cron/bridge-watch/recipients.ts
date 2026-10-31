/**
 * Who a bridge alert is pushed to (MIXER-11). Admins, the sound-engineer flag
 * holders (Drew), and a configurable list of extra uids in
 * `config/monitor.bridgeAlertRecipients` (Michael, who powers the studio PC).
 * Band leaders are still not paged: only people who can act on the bridge are.
 */
export interface RecipientMember {
    uid: string
    role: string
    soundEngineer?: boolean
}

export function bridgeAlertRecipients(
    members: RecipientMember[],
    monitorConfig: Record<string, unknown> | undefined,
): string[] {
    const out = new Set<string>()
    for (const m of members) {
        if (m.role === "pending" || m.role === "denied") continue
        if (m.role === "admin" || m.soundEngineer === true) out.add(m.uid)
    }
    const extra = monitorConfig?.bridgeAlertRecipients
    if (Array.isArray(extra)) {
        for (const u of extra) if (typeof u === "string" && u.length > 0) out.add(u)
    }
    return [...out]
}
