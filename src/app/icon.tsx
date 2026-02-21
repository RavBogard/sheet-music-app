import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import path from 'path'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
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
                        borderRadius: '50%',
                        overflow: 'hidden',
                        backgroundColor: 'transparent',
                    }}
                >
                    <img src={base64Logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
            ),
            { ...size }
        )
    } catch (e) {
        // Fallback if logo.jpg is missing
        return new ImageResponse(
            (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        backgroundColor: '#8b5cf6',
                        color: 'white',
                        fontSize: 256,
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
