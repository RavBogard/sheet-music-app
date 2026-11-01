import { ImageResponse } from 'next/og'
import { BrandMark, requestIdentity } from './_brand/mark'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

/**
 * Favicon: the app mark (an open page ruled by the four section bands) on the
 * tenant's top-bar cloth. Per tenant: the proxy's `x-org-id` picks CRC's
 * book-cloth blue or Brothers Lazaroff's teal (src/lib/org/identity.ts).
 */
export default async function Icon() {
    const id = await requestIdentity()
    return new ImageResponse(<BrandMark S={size.width} id={id} rounded />, { ...size })
}
