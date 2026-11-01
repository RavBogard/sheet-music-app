import { headers } from 'next/headers'
import { coerceOrgId } from '@/lib/org/registry'
import { getOrgIdentity, type OrgIdentity } from '@/lib/org/identity'

/** The request's tenant identity (the Edge proxy sets `x-org-id`; none → CRC). */
export async function requestIdentity(): Promise<OrgIdentity> {
    const orgId = coerceOrgId((await headers()).get('x-org-id'))
    return getOrgIdentity(orgId)
}

/**
 * The app mark: an open page on the top-bar cloth, ruled by the four section
 * bands, the way a setlist opens each section on a full-hue band. Flat, no
 * glow or gradient (DESIGN.md "Don't"). `S` is the square's edge in px;
 * `rounded` rounds the field (the favicon; iOS masks the Apple icon itself).
 */
export function BrandMark({ S, id, rounded }: { S: number; id: OrgIdentity; rounded: boolean }) {
    const pageW = Math.round(S * 0.62)
    const pageH = Math.round(S * 0.7)
    const bandH = Math.max(2, Math.round(S * 0.085))
    const gap = Math.max(2, Math.round(S * 0.055))
    const pad = Math.round(S * 0.08)
    return (
        <div
            style={{
                width: S,
                height: S,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: id.shell,
                borderRadius: rounded ? Math.round(S * 0.2) : 0,
            }}
        >
            <div
                style={{
                    width: pageW,
                    height: pageH,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap,
                    padding: pad,
                    background: id.paper,
                    borderRadius: Math.round(S * 0.05),
                }}
            >
                {id.bands.map((color, i) => (
                    <div
                        key={i}
                        style={{
                            height: bandH,
                            width: i % 2 === 0 ? '100%' : '78%',
                            background: color,
                            borderRadius: Math.max(1, Math.round(bandH * 0.25)),
                        }}
                    />
                ))}
            </div>
        </div>
    )
}
