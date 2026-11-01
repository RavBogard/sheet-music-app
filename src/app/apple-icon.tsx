import { ImageResponse } from 'next/og'
import { BrandMark, requestIdentity } from './_brand/mark'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Apple touch icon: the same mark as icon.tsx on a full square field (Apple
 * requires an opaque icon and applies its own mask). Per tenant.
 */
export default async function AppleIcon() {
    const id = await requestIdentity()
    return new ImageResponse(<BrandMark S={size.width} id={id} rounded={false} />, { ...size })
}
