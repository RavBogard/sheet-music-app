import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import path from 'path'
import { headers } from 'next/headers'
import { coerceOrgId } from '@/lib/org/registry'
import { getOrgConfig } from '@/lib/org/get-org-config'
import { codeOrgConfig } from '@/lib/org/config-code'
import { orgString } from '@/lib/org/strings'
import { getOrgIdentity } from '@/lib/org/identity'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** The request's tenant, its config primed so orgString reads it. */
async function requestOrg() {
    const orgId = coerceOrgId((await headers()).get('x-org-id'))
    await getOrgConfig(orgId).catch(() => null)
    return orgId
}

/**
 * Multi-tenant: per-tenant alt text (a static `alt` export is baked at build).
 * crc and Brothers Lazaroff read the same catalogue text they always showed.
 */
export async function generateImageMetadata() {
    // Also called at build time (no request) to list the image ids; the id is
    // always 'card', so the build only needs that and the default text.
    const orgId = await requestOrg().catch(() => coerceOrgId(null))
    return [{ id: 'card', alt: orgString(orgId, 'og.alt'), size, contentType }]
}

/**
 * OpenGraph / Twitter card in the web-refresh identity: the tenant's top-bar
 * cloth across the top, the page ground below, the congregation's artwork in a
 * plain frame, the name in ink at 800, and the four section bands as a flat
 * rule along the foot. No glow or gradient (DESIGN.md "Don't"). Colours come
 * from src/lib/org/identity.ts, so Brothers Lazaroff renders in its own teal.
 */
export default async function OpenGraphImage() {
    const orgId = await requestOrg()
    const id = getOrgIdentity(orgId)
    // The mandala artwork is CRC's; tenants created through config get the monogram.
    const ownArtwork = codeOrgConfig(orgId) !== null
    let base64Logo: string | null = null
    if (ownArtwork) try {
        const logo = readFileSync(path.join(process.cwd(), 'public', 'logo.jpg'))
        base64Logo = `data:image/jpeg;base64,${logo.toString('base64')}`
    } catch {
        // Will use fallback design
    }

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: id.ground,
                }}
            >
                {/* Top bar: the tenant's cloth */}
                <div style={{ height: 56, display: 'flex', background: id.shell }} />

                {/* Artwork left, text right */}
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 64,
                        padding: '0 80px',
                    }}
                >
                    <div
                        style={{
                            width: 340,
                            height: 340,
                            borderRadius: 24,
                            overflow: 'hidden',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: id.paper,
                            border: `2px solid ${id.shell}`,
                        }}
                    >
                        {base64Logo ? (
                            <img
                                src={base64Logo}
                                alt=""
                                style={{
                                    width: 340,
                                    height: 340,
                                    objectFit: 'cover',
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: id.shell,
                                    color: id.shellInk,
                                    fontSize: 120,
                                    fontWeight: 800,
                                }}
                            >
                                {orgString(orgId, 'og.monogram')}
                            </div>
                        )}
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 20,
                            maxWidth: 560,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 56,
                                fontWeight: 800,
                                color: id.ink,
                                lineHeight: 1.1,
                                letterSpacing: '-0.01em',
                            }}
                        >
                            {orgString(orgId, 'og.title')}
                        </div>
                        <div
                            style={{
                                fontSize: 22,
                                color: id.muted,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                fontWeight: 700,
                            }}
                        >
                            {/* i18n-ignore: link-preview PNG rendered without a viewer language (and without Hebrew glyphs in the default og font); tenant-branded, same text as the tenant og.alt */}
                            Digital Sheet Music Library
                        </div>
                    </div>
                </div>

                {/* Foot: the four section bands as one flat rule */}
                <div style={{ height: 14, display: 'flex' }}>
                    {id.bands.map((color, i) => (
                        <div key={i} style={{ flex: 1, background: color }} />
                    ))}
                </div>
            </div>
        ),
        {
            ...size,
        }
    )
}
