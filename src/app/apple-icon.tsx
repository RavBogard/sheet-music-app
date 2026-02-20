import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import path from 'path'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
    try {
        const logo = readFileSync(path.join(process.cwd(), 'public', 'logo.jpg'))
        const base64Logo = `data:image/jpeg;base64,${logo.toString('base64')}`

        return new ImageResponse(
            (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '20%', // Apple icons should have slight rounding, though iOS masks them anyway.
                        overflow: 'hidden',
                        backgroundColor: 'white', // Apple icons cannot be transparent
                    }}
                >
                    <img src={base64Logo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
            ),
            { ...size }
        )
    } catch (e) {
        return new ImageResponse(
            (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#8b5cf6',
                        color: 'white',
                        fontSize: 90,
                        fontWeight: 'bold',
                    }}
                >
                    C
                </div>
            ),
            { ...size }
        )
    }
}
