#!/usr/bin/env node

/**
 * Verify that monitor types are in sync between app and bridge.
 *
 * Canonical source: src/types/monitor.ts
 * Mirror:          bridge/src/types.ts
 *
 * Checks that all exported interfaces and type aliases in the canonical
 * source exist (by name) in the bridge mirror. Does NOT require byte-identical
 * files — the bridge can have extra types (like X32State) and different comments.
 *
 * Usage:
 *   node scripts/check-types-sync.js          # exits 0 if in sync
 *   node scripts/check-types-sync.js --fix    # copies canonical → mirror
 */

const fs = require('fs')
const path = require('path')

const CANONICAL = path.join(__dirname, '..', 'src', 'types', 'monitor.ts')
const MIRROR = path.join(__dirname, '..', 'bridge', 'src', 'types.ts')

function extractTypeNames(content) {
    const names = new Set()
    const re = /export\s+(?:interface|type)\s+(\w+)/g
    let m
    while ((m = re.exec(content)) !== null) {
        names.add(m[1])
    }
    return names
}

function extractTypeBlock(content, name) {
    // Extract the full declaration for comparison
    const interfaceRe = new RegExp(
        `export\\s+interface\\s+${name}\\s*\\{[^}]*\\}`,
        's'
    )
    const typeRe = new RegExp(
        `export\\s+type\\s+${name}\\s*=[^;]+;`,
        's'
    )
    const m = content.match(interfaceRe) || content.match(typeRe)
    return m ? m[0] : null
}

function normalizeBlock(block) {
    return block ? block.replace(/\s+/g, ' ').trim() : null
}

const fix = process.argv.includes('--fix')

if (!fs.existsSync(CANONICAL)) {
    console.error(`Canonical file not found: ${CANONICAL}`)
    process.exit(1)
}

if (!fs.existsSync(MIRROR)) {
    if (fix) {
        fs.copyFileSync(CANONICAL, MIRROR)
        console.log('✅ Copied canonical → bridge (mirror was missing)')
        process.exit(0)
    }
    console.error(`Mirror file not found: ${MIRROR}`)
    console.error('Run with --fix to copy canonical source to bridge.')
    process.exit(1)
}

const canonical = fs.readFileSync(CANONICAL, 'utf8')
const mirror = fs.readFileSync(MIRROR, 'utf8')

const canonicalNames = extractTypeNames(canonical)
const mirrorNames = extractTypeNames(mirror)

let drifted = false
const issues = []

for (const name of canonicalNames) {
    if (!mirrorNames.has(name)) {
        issues.push(`❌ Missing in bridge: ${name}`)
        drifted = true
        continue
    }

    const canonicalBlock = extractTypeBlock(canonical, name)
    const mirrorBlock = extractTypeBlock(mirror, name)

    if (canonicalBlock && mirrorBlock && normalizeBlock(canonicalBlock) !== normalizeBlock(mirrorBlock)) {
        issues.push(`⚠️  Drifted: ${name}`)
        drifted = true
    }
}

if (drifted) {
    console.log('Monitor types are out of sync:\n')
    issues.forEach(i => console.log(`  ${i}`))
    console.log('')

    if (fix) {
        // Read bridge-only types (like X32State) and append them
        const bridgeOnlyNames = [...mirrorNames].filter(n => !canonicalNames.has(n))
        let output = canonical

        if (bridgeOnlyNames.length > 0) {
            const bridgeOnlyBlocks = bridgeOnlyNames
                .map(name => {
                    const block = extractTypeBlock(mirror, name)
                    return block ? `\n${block}` : null
                })
                .filter(Boolean)
                .join('\n')

            output += `\n\n// ─── Bridge-only types ───\n${bridgeOnlyBlocks}\n`
        }

        fs.writeFileSync(MIRROR, output)
        console.log('✅ Fixed: canonical → bridge (preserved bridge-only types)')
    } else {
        console.log('Run with --fix to sync, or update manually.')
        process.exit(1)
    }
} else {
    console.log('✅ Monitor types in sync')
}
