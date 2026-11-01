// Regenerate the right-sized nav logos from public/logo.jpg (1000x1000).
// The header draws the logo at 28-32 CSS px, so a 64px file covers 2x and a
// 128px file covers 3x-4x. Run by hand when the logo changes:
//   node scripts/ops/make-logo-sizes.mjs
// sharp comes with Next (its image optimizer); no extra dependency.
import sharp from "sharp"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const src = path.join(root, "public", "logo.jpg")

for (const size of [64, 128]) {
    const base = sharp(src).resize(size, size, { fit: "cover" })
    const out = (ext) => path.join(root, "public", `logo-${size}.${ext}`)
    await base.clone().avif({ quality: 50, effort: 9, chromaSubsampling: "4:2:0" }).toFile(out("avif"))
    await base.clone().webp({ quality: 82, effort: 6 }).toFile(out("webp"))
    await base.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(out("jpg"))
}
console.log("wrote public/logo-{64,128}.{avif,webp,jpg}")
