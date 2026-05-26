// chord-extractor-serverless-fix (Tier-1, 2026-05-26): hand-rolled minimal
// DOMMatrix polyfill for serverless Node runtimes (Vercel, Cloudflare
// Workers, AWS Lambda) that lack the browser `globalThis.DOMMatrix`.
//
// Why this exists:
//   pdfjs-dist v5 `legacy/build/pdf.mjs` constructs `new DOMMatrix()` at
//   MODULE LOAD time (`const SCALE_MATRIX = new DOMMatrix();` ~L15620 in
//   the v5.4.296 bundle). Its own polyfill block (~L14340) tries to
//   `require("@napi-rs/canvas")` for a `DOMMatrix` impl, but
//   `@napi-rs/canvas` is not a runtime dep here and the require
//   fails silently — pdfjs warns "Cannot polyfill DOMMatrix" and
//   continues, which means the module-level `new DOMMatrix()` then
//   throws "DOMMatrix is not defined" on Vercel serverless Node where
//   the global is absent.
//
//   The companion lane `f4-b-pdf-extractor-serverless-fix-v2`
//   (`6d4c37042b`) closed the F4-B text-extraction path by swapping
//   the engine to `unpdf` (which bundles its own polyfills). This
//   polyfill closes the COMPANION surface that still uses pdfjs-dist
//   directly: `src/lib/pdf-chord-extractor.ts`'s positional chord
//   extractor, which powers:
//     - `/api/setlist/print/*` (4 print routes — Daniel's gig-packet path)
//     - `/api/library/detect-key`
//     - any future server-side caller of `extractChordsFromPdf` /
//       `extractChordsFromPage`.
//
// How to use:
//   Side-effect import at the TOP of any server-side module that loads
//   pdfjs-dist via the shared `getPdfjs()`:
//     import './pdf/dommatrix-polyfill'
//   The import is idempotent (no-ops when `globalThis.DOMMatrix` is
//   already defined, e.g. browser / jsdom / Vercel Node 22.13+). Runs
//   exactly once per worker process via the module-cache + the inner
//   `if (typeof globalThis.DOMMatrix === 'undefined')` guard.
//
// Surface coverage:
//   The browser DOMMatrix is a large API. This stub implements the
//   subset pdfjs-dist v5 actually touches:
//     - constructors: no-arg (identity), 6-element array (2D affine),
//       16-element array (3D 4x4), DOMMatrix/DOMMatrixReadOnly copy.
//     - 2D properties + setters: a / b / c / d / e / f.
//     - 3D properties + setters: m11..m44.
//     - is2D / isIdentity reads.
//     - mutating methods: multiplySelf, preMultiplySelf, translateSelf,
//       scaleSelf, rotateSelf, invertSelf.
//     - non-mutating methods: multiply, translate, scale, rotate,
//       inverse, flipX, flipY, scaleNonUniform, transformPoint.
//   String-constructor (CSS transform parsing) is NOT supported and
//   throws — pdfjs-dist does not invoke it on our codepath.
//
// Math reference:
//   W3C Geometry Interfaces Module Level 1 (DOMMatrix spec).
//   2D affine: [a b 0; c d 0; e f 1] = [m11 m12 0 0; m21 m22 0 0;
//                                       0   0   1 0; m41 m42 0 1].
//
// Test parity: regression-tested at
//   `src/lib/__tests__/pdf-chord-extractor-dommatrix-absent.test.ts`,
//   which deletes `globalThis.DOMMatrix` before invoking
//   `extractChordsFromPage` / `extractChordsFromPdf` against a
//   pdf-lib-synthesized fixture, mirroring coder-5's
//   `searchable-text-dommatrix-absent.test.ts` pattern that locked in
//   the F4-B fix.

import 'server-only'

interface DOMMatrixInit {
    m11?: number; m12?: number; m13?: number; m14?: number
    m21?: number; m22?: number; m23?: number; m24?: number
    m31?: number; m32?: number; m33?: number; m34?: number
    m41?: number; m42?: number; m43?: number; m44?: number
    is2D?: boolean
}

class MinimalDOMMatrix {
    // 4x4 matrix elements; default to identity.
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1

    /** Internal 2D-vs-3D flag; flipped to false on any 3D-element write. */
    is2D = true

    constructor(init?: string | number[] | MinimalDOMMatrix | DOMMatrixInit) {
        if (init === undefined || init === null) return
        if (typeof init === 'string') {
            // CSS transform string parsing — pdfjs-dist v5 does not invoke
            // this constructor form on the server text-extraction or
            // chord-extraction codepaths. Throw so any unexpected caller
            // surfaces visibly rather than silently producing an identity.
            throw new Error(
                '[dommatrix-polyfill] string-init constructor not supported',
            )
        }
        if (Array.isArray(init)) {
            if (init.length === 6) {
                // 2D affine: [a, b, c, d, e, f]
                this.m11 = init[0]; this.m12 = init[1]
                this.m21 = init[2]; this.m22 = init[3]
                this.m41 = init[4]; this.m42 = init[5]
                this.is2D = true
                return
            }
            if (init.length === 16) {
                // 3D 4x4 column-major
                this.m11 = init[0];  this.m12 = init[1];  this.m13 = init[2];  this.m14 = init[3]
                this.m21 = init[4];  this.m22 = init[5];  this.m23 = init[6];  this.m24 = init[7]
                this.m31 = init[8];  this.m32 = init[9];  this.m33 = init[10]; this.m34 = init[11]
                this.m41 = init[12]; this.m42 = init[13]; this.m43 = init[14]; this.m44 = init[15]
                this.is2D = false
                return
            }
            throw new Error(
                `[dommatrix-polyfill] array-init must have 6 or 16 elements, got ${init.length}`,
            )
        }
        if (init instanceof MinimalDOMMatrix) {
            this.copyFrom(init)
            return
        }
        // DOMMatrixInit object literal — copy known fields.
        const lit = init as DOMMatrixInit
        if (lit.m11 !== undefined) this.m11 = lit.m11
        if (lit.m12 !== undefined) this.m12 = lit.m12
        if (lit.m13 !== undefined) { this.m13 = lit.m13; this.is2D = false }
        if (lit.m14 !== undefined) { this.m14 = lit.m14; this.is2D = false }
        if (lit.m21 !== undefined) this.m21 = lit.m21
        if (lit.m22 !== undefined) this.m22 = lit.m22
        if (lit.m23 !== undefined) { this.m23 = lit.m23; this.is2D = false }
        if (lit.m24 !== undefined) { this.m24 = lit.m24; this.is2D = false }
        if (lit.m31 !== undefined) { this.m31 = lit.m31; this.is2D = false }
        if (lit.m32 !== undefined) { this.m32 = lit.m32; this.is2D = false }
        if (lit.m33 !== undefined && lit.m33 !== 1) { this.m33 = lit.m33; this.is2D = false }
        if (lit.m34 !== undefined) { this.m34 = lit.m34; this.is2D = false }
        if (lit.m41 !== undefined) this.m41 = lit.m41
        if (lit.m42 !== undefined) this.m42 = lit.m42
        if (lit.m43 !== undefined) { this.m43 = lit.m43; this.is2D = false }
        if (lit.m44 !== undefined && lit.m44 !== 1) { this.m44 = lit.m44; this.is2D = false }
        if (lit.is2D === false) this.is2D = false
    }

    // ── 2D affine aliases (W3C Level 1 §"DOMMatrixReadOnly" 2D attrs) ──
    get a(): number { return this.m11 }
    set a(v: number) { this.m11 = v }
    get b(): number { return this.m12 }
    set b(v: number) { this.m12 = v }
    get c(): number { return this.m21 }
    set c(v: number) { this.m21 = v }
    get d(): number { return this.m22 }
    set d(v: number) { this.m22 = v }
    get e(): number { return this.m41 }
    set e(v: number) { this.m41 = v }
    get f(): number { return this.m42 }
    set f(v: number) { this.m42 = v }

    get isIdentity(): boolean {
        return (
            this.m11 === 1 && this.m12 === 0 && this.m13 === 0 && this.m14 === 0 &&
            this.m21 === 0 && this.m22 === 1 && this.m23 === 0 && this.m24 === 0 &&
            this.m31 === 0 && this.m32 === 0 && this.m33 === 1 && this.m34 === 0 &&
            this.m41 === 0 && this.m42 === 0 && this.m43 === 0 && this.m44 === 1
        )
    }

    private copyFrom(o: MinimalDOMMatrix): this {
        this.m11 = o.m11; this.m12 = o.m12; this.m13 = o.m13; this.m14 = o.m14
        this.m21 = o.m21; this.m22 = o.m22; this.m23 = o.m23; this.m24 = o.m24
        this.m31 = o.m31; this.m32 = o.m32; this.m33 = o.m33; this.m34 = o.m34
        this.m41 = o.m41; this.m42 = o.m42; this.m43 = o.m43; this.m44 = o.m44
        this.is2D = o.is2D
        return this
    }

    // ── Mutating methods ────────────────────────────────────────────
    multiplySelf(other: MinimalDOMMatrix): this {
        const r = MinimalDOMMatrix.multiplyMatrices(this, other)
        return this.copyFrom(r)
    }

    preMultiplySelf(other: MinimalDOMMatrix): this {
        const r = MinimalDOMMatrix.multiplyMatrices(other, this)
        return this.copyFrom(r)
    }

    translateSelf(tx: number, ty: number, tz = 0): this {
        const t = new MinimalDOMMatrix()
        t.m41 = tx; t.m42 = ty; t.m43 = tz
        if (tz !== 0) t.is2D = false
        return this.multiplySelf(t)
    }

    scaleSelf(sx: number, sy: number = sx, sz = 1, ox = 0, oy = 0, oz = 0): this {
        if (ox || oy || oz) this.translateSelf(ox, oy, oz)
        const s = new MinimalDOMMatrix()
        s.m11 = sx; s.m22 = sy; s.m33 = sz
        if (sz !== 1) s.is2D = false
        this.multiplySelf(s)
        if (ox || oy || oz) this.translateSelf(-ox, -oy, -oz)
        return this
    }

    rotateSelf(rotX = 0, rotY = 0, rotZ = 0): this {
        // pdfjs-dist v5 only uses rotateSelf with a single Z-rotation arg
        // (the W3C "rotate angle around Z" 1-arg form). 3D rotation is
        // included for spec parity but is currently unused by our caller.
        const single = arguments.length <= 1
        const rz = single ? rotX : rotZ
        if (rz !== 0) {
            const a = (rz * Math.PI) / 180
            const cos = Math.cos(a)
            const sin = Math.sin(a)
            const r = new MinimalDOMMatrix()
            r.m11 = cos; r.m12 = sin
            r.m21 = -sin; r.m22 = cos
            this.multiplySelf(r)
        }
        if (!single && rotY !== 0) {
            const a = (rotY * Math.PI) / 180
            const cos = Math.cos(a)
            const sin = Math.sin(a)
            const r = new MinimalDOMMatrix()
            r.m11 = cos; r.m13 = -sin
            r.m31 = sin; r.m33 = cos
            r.is2D = false
            this.multiplySelf(r)
        }
        if (!single && rotX !== 0) {
            const a = (rotX * Math.PI) / 180
            const cos = Math.cos(a)
            const sin = Math.sin(a)
            const r = new MinimalDOMMatrix()
            r.m22 = cos; r.m23 = sin
            r.m32 = -sin; r.m33 = cos
            r.is2D = false
            this.multiplySelf(r)
        }
        return this
    }

    invertSelf(): this {
        // 2D fast path: [[a b 0 0], [c d 0 0], [0 0 1 0], [e f 0 1]]
        if (this.is2D) {
            const det = this.m11 * this.m22 - this.m12 * this.m21
            if (det === 0) {
                // Spec: invalid invert sets all to NaN and flips is2D? In
                // practice pdfjs guards against this; we follow the spec
                // by leaving the matrix mutated to NaNs.
                this.m11 = NaN; this.m12 = NaN
                this.m21 = NaN; this.m22 = NaN
                this.m41 = NaN; this.m42 = NaN
                return this
            }
            const invDet = 1 / det
            const a = this.m11
            const b = this.m12
            const c = this.m21
            const d = this.m22
            const e = this.m41
            const f = this.m42
            this.m11 = d * invDet
            this.m12 = -b * invDet
            this.m21 = -c * invDet
            this.m22 = a * invDet
            this.m41 = (c * f - d * e) * invDet
            this.m42 = (b * e - a * f) * invDet
            return this
        }
        // 3D inverse: full 4x4 cofactor. pdfjs-dist's text-extraction +
        // viewport paths stay 2D, but provide the 3D branch for spec
        // parity if a future caller hits it.
        const inv = MinimalDOMMatrix.invert4x4(this)
        if (!inv) {
            this.m11 = NaN
            return this
        }
        return this.copyFrom(inv)
    }

    // ── Non-mutating methods (return new matrices) ──────────────────
    multiply(other: MinimalDOMMatrix): MinimalDOMMatrix {
        return MinimalDOMMatrix.multiplyMatrices(this, other)
    }

    translate(tx: number, ty: number, tz = 0): MinimalDOMMatrix {
        const r = new MinimalDOMMatrix(this)
        return r.translateSelf(tx, ty, tz)
    }

    scale(sx: number, sy: number = sx, sz = 1, ox = 0, oy = 0, oz = 0): MinimalDOMMatrix {
        const r = new MinimalDOMMatrix(this)
        return r.scaleSelf(sx, sy, sz, ox, oy, oz)
    }

    scaleNonUniform(sx: number, sy = 1): MinimalDOMMatrix {
        return this.scale(sx, sy)
    }

    rotate(rotX = 0, rotY = 0, rotZ = 0): MinimalDOMMatrix {
        const r = new MinimalDOMMatrix(this)
        if (arguments.length <= 1) {
            return r.rotateSelf(rotX)
        }
        return r.rotateSelf(rotX, rotY, rotZ)
    }

    inverse(): MinimalDOMMatrix {
        const r = new MinimalDOMMatrix(this)
        return r.invertSelf()
    }

    flipX(): MinimalDOMMatrix {
        const r = new MinimalDOMMatrix(this)
        r.m11 = -r.m11; r.m12 = -r.m12; r.m13 = -r.m13; r.m14 = -r.m14
        return r
    }

    flipY(): MinimalDOMMatrix {
        const r = new MinimalDOMMatrix(this)
        r.m21 = -r.m21; r.m22 = -r.m22; r.m23 = -r.m23; r.m24 = -r.m24
        return r
    }

    transformPoint(point?: { x?: number; y?: number; z?: number; w?: number }): { x: number; y: number; z: number; w: number } {
        const x = point?.x ?? 0
        const y = point?.y ?? 0
        const z = point?.z ?? 0
        const w = point?.w ?? 1
        return {
            x: this.m11 * x + this.m21 * y + this.m31 * z + this.m41 * w,
            y: this.m12 * x + this.m22 * y + this.m32 * z + this.m42 * w,
            z: this.m13 * x + this.m23 * y + this.m33 * z + this.m43 * w,
            w: this.m14 * x + this.m24 * y + this.m34 * z + this.m44 * w,
        }
    }

    toString(): string {
        if (this.is2D) {
            return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`
        }
        return (
            `matrix3d(${this.m11}, ${this.m12}, ${this.m13}, ${this.m14}, ` +
            `${this.m21}, ${this.m22}, ${this.m23}, ${this.m24}, ` +
            `${this.m31}, ${this.m32}, ${this.m33}, ${this.m34}, ` +
            `${this.m41}, ${this.m42}, ${this.m43}, ${this.m44})`
        )
    }

    // ── Static helpers ──────────────────────────────────────────────
    static multiplyMatrices(a: MinimalDOMMatrix, b: MinimalDOMMatrix): MinimalDOMMatrix {
        // c = a * b — column-major spec: c.mIJ = sum over K of a.mIK * b.mKJ
        // where I,J,K are 1..4. Implemented as four-by-four to stay correct
        // when either operand is 3D.
        const r = new MinimalDOMMatrix()
        r.m11 = a.m11 * b.m11 + a.m21 * b.m12 + a.m31 * b.m13 + a.m41 * b.m14
        r.m12 = a.m12 * b.m11 + a.m22 * b.m12 + a.m32 * b.m13 + a.m42 * b.m14
        r.m13 = a.m13 * b.m11 + a.m23 * b.m12 + a.m33 * b.m13 + a.m43 * b.m14
        r.m14 = a.m14 * b.m11 + a.m24 * b.m12 + a.m34 * b.m13 + a.m44 * b.m14

        r.m21 = a.m11 * b.m21 + a.m21 * b.m22 + a.m31 * b.m23 + a.m41 * b.m24
        r.m22 = a.m12 * b.m21 + a.m22 * b.m22 + a.m32 * b.m23 + a.m42 * b.m24
        r.m23 = a.m13 * b.m21 + a.m23 * b.m22 + a.m33 * b.m23 + a.m43 * b.m24
        r.m24 = a.m14 * b.m21 + a.m24 * b.m22 + a.m34 * b.m23 + a.m44 * b.m24

        r.m31 = a.m11 * b.m31 + a.m21 * b.m32 + a.m31 * b.m33 + a.m41 * b.m34
        r.m32 = a.m12 * b.m31 + a.m22 * b.m32 + a.m32 * b.m33 + a.m42 * b.m34
        r.m33 = a.m13 * b.m31 + a.m23 * b.m32 + a.m33 * b.m33 + a.m43 * b.m34
        r.m34 = a.m14 * b.m31 + a.m24 * b.m32 + a.m34 * b.m33 + a.m44 * b.m34

        r.m41 = a.m11 * b.m41 + a.m21 * b.m42 + a.m31 * b.m43 + a.m41 * b.m44
        r.m42 = a.m12 * b.m41 + a.m22 * b.m42 + a.m32 * b.m43 + a.m42 * b.m44
        r.m43 = a.m13 * b.m41 + a.m23 * b.m42 + a.m33 * b.m43 + a.m43 * b.m44
        r.m44 = a.m14 * b.m41 + a.m24 * b.m42 + a.m34 * b.m43 + a.m44 * b.m44

        r.is2D = a.is2D && b.is2D
        return r
    }

    /** Standard 4x4 cofactor inverse. Returns null on singular. */
    static invert4x4(m: MinimalDOMMatrix): MinimalDOMMatrix | null {
        const a00 = m.m11, a01 = m.m12, a02 = m.m13, a03 = m.m14
        const a10 = m.m21, a11 = m.m22, a12 = m.m23, a13 = m.m24
        const a20 = m.m31, a21 = m.m32, a22 = m.m33, a23 = m.m34
        const a30 = m.m41, a31 = m.m42, a32 = m.m43, a33 = m.m44

        const b00 = a00 * a11 - a01 * a10
        const b01 = a00 * a12 - a02 * a10
        const b02 = a00 * a13 - a03 * a10
        const b03 = a01 * a12 - a02 * a11
        const b04 = a01 * a13 - a03 * a11
        const b05 = a02 * a13 - a03 * a12
        const b06 = a20 * a31 - a21 * a30
        const b07 = a20 * a32 - a22 * a30
        const b08 = a20 * a33 - a23 * a30
        const b09 = a21 * a32 - a22 * a31
        const b10 = a21 * a33 - a23 * a31
        const b11 = a22 * a33 - a23 * a32

        const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
        if (det === 0) return null
        const invDet = 1 / det

        const r = new MinimalDOMMatrix()
        r.m11 = (a11 * b11 - a12 * b10 + a13 * b09) * invDet
        r.m12 = (a02 * b10 - a01 * b11 - a03 * b09) * invDet
        r.m13 = (a31 * b05 - a32 * b04 + a33 * b03) * invDet
        r.m14 = (a22 * b04 - a21 * b05 - a23 * b03) * invDet
        r.m21 = (a12 * b08 - a10 * b11 - a13 * b07) * invDet
        r.m22 = (a00 * b11 - a02 * b08 + a03 * b07) * invDet
        r.m23 = (a32 * b02 - a30 * b05 - a33 * b01) * invDet
        r.m24 = (a20 * b05 - a22 * b02 + a23 * b01) * invDet
        r.m31 = (a10 * b10 - a11 * b08 + a13 * b06) * invDet
        r.m32 = (a01 * b08 - a00 * b10 - a03 * b06) * invDet
        r.m33 = (a30 * b04 - a31 * b02 + a33 * b00) * invDet
        r.m34 = (a21 * b02 - a20 * b04 - a23 * b00) * invDet
        r.m41 = (a11 * b07 - a10 * b09 - a12 * b06) * invDet
        r.m42 = (a00 * b09 - a01 * b07 + a02 * b06) * invDet
        r.m43 = (a31 * b01 - a30 * b03 - a32 * b00) * invDet
        r.m44 = (a20 * b03 - a21 * b01 + a22 * b00) * invDet
        r.is2D = m.is2D
        return r
    }
}

// Idempotent install. The first server-side module that imports this
// polyfill assigns it; subsequent imports see the global is already set
// and skip. Wrap in a typed-cast — `globalThis.DOMMatrix` is declared
// `typeof DOMMatrix` in TS lib.dom.d.ts (a constructor type), and our
// stub is structurally a constructor that produces objects with the same
// shape.
if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
    ;(globalThis as { DOMMatrix?: unknown }).DOMMatrix =
        MinimalDOMMatrix as unknown as typeof DOMMatrix
}

// Exported for unit testing — production callers should NOT import
// `MinimalDOMMatrix` directly; they should access `globalThis.DOMMatrix`
// (or any consumer that already does, like pdfjs-dist).
export { MinimalDOMMatrix as __MinimalDOMMatrixForTests }
