/**
 * Scans a Canvas to find horizontal "strips" of text that are likely chords.
 * Algorithm:
 * 1. Convert to grayscale/binary.
 * 2. Calculate horizontal projection profile (sum of dark pixels per row).
 * 3. Find peaks/clusters in the profile to identify text lines.
 * 4. Determine which lines are "Chords" (usually sparse, above dense "Lyrics").
 */

export interface ScanResult {
    strips: ChordStrip[];
    debugImage?: string; // Base64 of the debug overlay
}

export interface ChordStrip {
    id: string;
    y: number;      // Top Y position
    height: number; // Height of the strip
    image: string;  // Base64 of the strip (for AI)
}

export async function scanForChordStrips(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D
): Promise<ScanResult> {
    const width = canvas.width;
    const height = canvas.height;

    // 1. Get Pixel Data
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;

    // 2. Horizontal Projection (Count dark pixels per row)
    const rowDensity = new Int32Array(height);
    for (let y = 0; y < height; y++) {
        let darkPixels = 0;
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            // Simple luminosity
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const avg = (r + g + b) / 3;
            if (avg < 200) { // Threshold for "ink"
                darkPixels++;
            }
        }
        rowDensity[y] = darkPixels;
    }

    // 3. Find Text Blocks (Consecutive rows with ink)
    const blocks: { y: number, h: number, density: number }[] = [];
    let currentBlock: { y: number, h: number, inkSum: number } | null = null;

    for (let y = 0; y < height; y++) {
        if (rowDensity[y] > 5) { // Noise threshold
            if (!currentBlock) {
                currentBlock = { y, h: 0, inkSum: 0 };
            }
            currentBlock.h++;
            currentBlock.inkSum += rowDensity[y];
        } else {
            if (currentBlock) {
                // End of block
                if (currentBlock.h > 10) { // Min height for text line
                    blocks.push({
                        y: currentBlock.y,
                        h: currentBlock.h,
                        density: currentBlock.inkSum / (currentBlock.h * width) // Average density
                    });
                }
                currentBlock = null;
            }
        }
    }

    // 4. Heuristic: Chords vs Lyrics
    // Chords are usually:
    // - Sparse (Low density)
    // - Followed closely by a denser line (Lyrics)

    const chordStrips: ChordStrip[] = [];
    const minGap = 5; // Max gap between Chord and Lyric to be associated

    // We look for pairs or just sparse lines?
    // Let's grab ALL lines for now, but mark them?
    // User wants "Line Scanner" approach.
    // Simple heuristic: If density < 0.15 (15% coverage), it's likely chords. Lyrics are 20%+.
    // This is fragile. Better: "Every line above a gap > X is a candidate"?

    // Let's export ALL lines that look "text-like" and let the AI decide? 
    // Or optimize by only sending the sparse ones? 
    // The prompt says "Extract musical chords". If we send lyrics, it might just return empty.
    // Cost optimization: Only send likely candidates.

    for (const block of blocks) {
        // Very rough heuristic for now: Chords are often short text.
        // We will send the block Image relative to the canvas.

        // Crop the strip
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = block.h + 20; // Add padding
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, block.h + 20);
            // Draw original image slice
            ctx.drawImage(canvas, 0, block.y - 10, width, block.h + 20, 0, 0, width, block.h + 20);

            chordStrips.push({
                id: crypto.randomUUID(),
                y: block.y - 10,
                height: block.h + 20,
                image: tempCanvas.toDataURL('image/jpeg', 0.8).split(',')[1] // base64 body
            });
        }
    }

    return {
        strips: chordStrips
    };
}
