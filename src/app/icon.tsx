import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

/**
 * Simplified mandala favicon — concentric luminous rings
 * inspired by the 12 Tribes mandala (logo.jpg) color palette.
 *
 * Colors drawn from the original artwork:
 *   Crimson, teal, amber, royal blue, brand violet.
 */
export default function Icon() {
    const S = size.width
    const cx = S / 2
    const cy = S / 2

    // Ring definitions: [diameter, borderWidth, color, glowColor]
    const rings: [number, number, string, string][] = [
        [468, 24, '#be3a30', 'rgba(190, 58, 48, 0.35)'],   // crimson
        [388, 22, '#1a8a7d', 'rgba(26, 138, 125, 0.30)'],  // teal
        [316, 20, '#d4952b', 'rgba(212, 149, 43, 0.30)'],   // amber
        [250, 16, '#2a5aad', 'rgba(42, 90, 173, 0.30)'],    // royal blue
    ]

    return new ImageResponse(
        (
            <div
                style={{
                    width: S,
                    height: S,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    background: 'radial-gradient(circle at center, #1a1830 0%, #0e0d18 100%)',
                    borderRadius: '50%',
                    overflow: 'hidden',
                }}
            >
                {/* Subtle radial glow behind the rings */}
                <div
                    style={{
                        position: 'absolute',
                        width: 480,
                        height: 480,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
                        top: cx - 240,
                        left: cy - 240,
                    }}
                />

                {/* Concentric rings */}
                {rings.map(([d, bw, color, glow], i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            width: d,
                            height: d,
                            borderRadius: '50%',
                            border: `${bw}px solid ${color}`,
                            top: cy - d / 2,
                            left: cx - d / 2,
                            boxShadow: `0 0 ${bw * 1.5}px ${glow}, inset 0 0 ${bw}px ${glow}`,
                        }}
                    />
                ))}

                {/* Center orb — brand violet */}
                <div
                    style={{
                        position: 'absolute',
                        width: 160,
                        height: 160,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle at 40% 35%, #a855f7, #7c3aed 50%, #5b21b6 100%)',
                        top: cy - 80,
                        left: cx - 80,
                        boxShadow: '0 0 40px rgba(124,58,237,0.5), 0 0 80px rgba(124,58,237,0.2)',
                    }}
                />

                {/* Inner highlight on center orb */}
                <div
                    style={{
                        position: 'absolute',
                        width: 60,
                        height: 60,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%)',
                        top: cy - 50,
                        left: cx - 30,
                    }}
                />
            </div>
        ),
        { ...size }
    )
}
