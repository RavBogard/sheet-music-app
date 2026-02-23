import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import path from 'path'

export const alt = 'Central Reform Congregation — Digital Sheet Music Library'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * OpenGraph social sharing image — congregation-forward design.
 * Features the 12 Tribes mandala artwork prominently,
 * with elegant serif text identifying the congregation.
 */
export default function OpenGraphImage() {
    let base64Logo: string | null = null
    try {
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
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    background: 'linear-gradient(135deg, #0e0d18 0%, #1a1830 40%, #12111a 100%)',
                    overflow: 'hidden',
                }}
            >
                {/* Subtle ambient glow behind artwork */}
                <div
                    style={{
                        position: 'absolute',
                        width: 600,
                        height: 600,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, rgba(26,138,125,0.06) 40%, transparent 70%)',
                        top: 15,
                        left: 60,
                    }}
                />

                {/* Layout: artwork left, text right */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 72,
                        padding: '0 80px',
                    }}
                >
                    {/* Artwork circle */}
                    <div
                        style={{
                            width: 380,
                            height: 380,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 80px rgba(124,58,237,0.25), 0 0 160px rgba(26,138,125,0.10), 0 20px 60px rgba(0,0,0,0.5)',
                            border: '3px solid rgba(255,255,255,0.08)',
                        }}
                    >
                        {base64Logo ? (
                            <img
                                src={base64Logo}
                                alt=""
                                style={{
                                    width: 380,
                                    height: 380,
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
                                    background: 'radial-gradient(circle at 40% 35%, #a855f7, #7c3aed 50%, #5b21b6 100%)',
                                    color: 'white',
                                    fontSize: 120,
                                    fontWeight: 'bold',
                                }}
                            >
                                CRC
                            </div>
                        )}
                    </div>

                    {/* Text content */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                            maxWidth: 520,
                        }}
                    >
                        {/* Congregation name */}
                        <div
                            style={{
                                fontSize: 52,
                                fontWeight: 700,
                                color: '#f0eefc',
                                lineHeight: 1.15,
                                letterSpacing: '-0.01em',
                            }}
                        >
                            Central Reform Congregation
                        </div>

                        {/* Decorative separator */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                            }}
                        >
                            <div
                                style={{
                                    width: 48,
                                    height: 2,
                                    background: 'linear-gradient(90deg, #be3a30, #d4952b)',
                                    borderRadius: 1,
                                }}
                            />
                            <div
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#1a8a7d',
                                }}
                            />
                            <div
                                style={{
                                    width: 32,
                                    height: 2,
                                    background: 'linear-gradient(90deg, #2a5aad, #7c3aed)',
                                    borderRadius: 1,
                                }}
                            />
                        </div>

                        {/* Subtitle */}
                        <div
                            style={{
                                fontSize: 22,
                                color: 'rgba(255,255,255,0.45)',
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                fontWeight: 500,
                            }}
                        >
                            Digital Sheet Music Library
                        </div>
                    </div>
                </div>

                {/* Bottom accent line */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 4,
                        display: 'flex',
                    }}
                >
                    <div style={{ flex: 1, background: '#be3a30' }} />
                    <div style={{ flex: 1, background: '#1a8a7d' }} />
                    <div style={{ flex: 1, background: '#d4952b' }} />
                    <div style={{ flex: 1, background: '#2a5aad' }} />
                    <div style={{ flex: 1, background: '#7c3aed' }} />
                </div>
            </div>
        ),
        {
            ...size,
        }
    )
}
