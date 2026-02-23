import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Apple touch icon — same simplified mandala design as icon.tsx
 * but with a solid dark background (Apple requires non-transparent icons).
 * iOS will apply its own superellipse mask.
 */
export default function AppleIcon() {
    const S = size.width
    const cx = S / 2
    const cy = S / 2

    // Scaled-down ring definitions: [diameter, borderWidth, color, glowColor]
    const rings: [number, number, string, string][] = [
        [164, 9, '#be3a30', 'rgba(190, 58, 48, 0.35)'],
        [136, 8, '#1a8a7d', 'rgba(26, 138, 125, 0.30)'],
        [110, 7, '#d4952b', 'rgba(212, 149, 43, 0.30)'],
        [88, 5, '#2a5aad', 'rgba(42, 90, 173, 0.30)'],
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
                }}
            >
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
                            boxShadow: `0 0 ${bw * 1.2}px ${glow}`,
                        }}
                    />
                ))}

                {/* Center orb — brand violet */}
                <div
                    style={{
                        position: 'absolute',
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle at 40% 35%, #a855f7, #7c3aed 50%, #5b21b6 100%)',
                        top: cy - 28,
                        left: cx - 28,
                        boxShadow: '0 0 14px rgba(124,58,237,0.5)',
                    }}
                />
            </div>
        ),
        { ...size }
    )
}
