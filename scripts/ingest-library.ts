import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// Helper to convert ALL CAPS to Title Case (excluding typical small words if needed, but simple for now)
function toTitleCase(str: string) {
    return str.toLowerCase().replace(
        /\b([a-z])/g,
        (char) => char.toUpperCase()
    ).replace(
        /'S\b/g,
        "'s" // fix "Don'T" and "It'S" if they exist, mostly for author names
    );
}

// Extract Title and Author from filename
// Examples: 
// "993122D001 ABANIBI (HIRSCH) - ACHSHAV (FOLK).pdf"
// "993122D005 AL TIRA (PIK).pdf"
function parseFilename(filename: string) {
    const withoutExt = filename.replace(/\.pdf$/i, '')
    
    // Strip leading ID block: e.g. "993122D001 "
    const match = withoutExt.match(/^[0-9A-Z]+\s+(.+)$/)
    
    if (!match) {
        return { cleanName: withoutExt, parseFailed: true }
    }
    
    const remainder = match[1]
    
    // We can just Title Case the whole remainder to keep it simple,
    // e.g. "Abanibi (Hirsch) - Achshav (Folk)"
    // Or we could try to extract "Title" and "Author" systematically. 
    // Given the UI just searches 'name', setting a nice descriptive name is best.
    
    const titleCased = toTitleCase(remainder)
    
    // Some minor cleanups: 
    // " (hirsch)" -> " (Hirsch)" - TitleCase does this automatically mostly.
    // " - " -> " - "
    
    return { cleanName: titleCased, parseFailed: false }
}

async function dryRun(inputDir: string) {
    console.log(`Starting dry run for directory: ${inputDir}\n`)
    
    let processed = 0
    let failed = 0
    
    const files = fs.readdirSync(inputDir).filter(f => f.toLowerCase().endsWith('.pdf'))
    console.log(`Found ${files.length} PDFs.\n`)
    
    for (const file of files) {
        const { cleanName, parseFailed } = parseFilename(file)
        
        if (parseFailed) {
            console.warn(`[WARN] Could not parse: ${file}`)
            failed++
            continue
        }
        
        // Let's just output the first 10 for review
        if (processed < 10) {
            console.log(`Original: "${file}"`)
            console.log(`Cleaned:  "${cleanName}"\n`)
        }
        
        processed++
    }
    
    console.log(`\nDry run complete. Success: ${processed}, Failed: ${failed}`)
}

import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { uploadToStorage } from '@/lib/firebase-storage'
import crypto from 'crypto'

async function processFile(inputDir: string, filename: string, db: FirebaseFirestore.Firestore) {
    const { cleanName, parseFailed } = parseFilename(filename)
    if (parseFailed) {
        console.warn(`[WARN] Skipping ${filename} - Parse failed`)
        return false
    }
        
    const inputPath = path.join(inputDir, filename)
    
    // Read and strip first page
    const pdfBytes = fs.readFileSync(inputPath)
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const totalPages = pdfDoc.getPageCount()
    
    if (totalPages <= 1) {
        console.warn(`[WARN] Skipping ${filename} - only has ${totalPages} page(s)`)
        return false
    }
    
    const newPdf = await PDFDocument.create()
    const pageIndices = Array.from({ length: totalPages - 1 }, (_, i) => i + 1)
    
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices)
    copiedPages.forEach(page => newPdf.addPage(page))
    
    const newPdfBytes = await newPdf.save()
    const buffer = Buffer.from(newPdfBytes)
    
    // Generate an ID for Firestore and Storage
    const fileId = crypto.randomUUID()
    const finalName = `${cleanName}.pdf`
    
    console.log(`Uploading ${finalName}... (ID: ${fileId})`)
    
    // Upload to Firebase Storage
    await uploadToStorage(fileId, buffer, 'application/pdf')
    
    // Save metadata to Firestore
    await db.collection('library_index').doc(fileId).set({
        id: fileId,
        name: finalName,
        nameLower: finalName.toLowerCase(),
        mimeType: 'application/pdf',
        collection: 'supplemental',
        lastSyncedAt: new Date().toISOString(),
        source: 'local_upload'
    })
    
    return true
}

async function processAll(inputDir: string) {
    console.log(`Starting processing for directory: ${inputDir}\n`)
    
    initAdmin()
    const db = getFirestore()
    
    const files = fs.readdirSync(inputDir).filter(f => f.toLowerCase().endsWith('.pdf'))
    console.log(`Found ${files.length} PDFs to process.\n`)
    
    let success = 0
    let failed = 0
    
    for (const file of files) {
        try {
            const result = await processFile(inputDir, file, db)
            if (result) success++
            else failed++
        } catch (err) {
            console.error(`[ERROR] Failed to process ${file}:`, err)
            failed++
        }
    }
    
    console.log(`\nProcessing complete. Success: ${success}, Failed: ${failed}`)
}

// If run directly
if (require.main === module) {
    const mode = process.argv[2]
    const inputDir = process.argv[3]
    
    if (!inputDir) {
        console.error("Please provide an input directory. Usage: npx tsx scripts/ingest-library.ts [dry-run|process] [input-dir]")
        process.exit(1)
    }
    
    if (mode === 'dry-run') {
        dryRun(inputDir).catch(console.error)
    } else if (mode === 'process') {
        processAll(inputDir).catch(console.error)
    } else {
        console.log("Usage: npx tsx scripts/ingest-library.ts [dry-run|process] [input-dir]")
    }
}
