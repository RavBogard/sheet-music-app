import { NextResponse } from 'next/server'
import { geminiFlash } from '@/lib/gemini'

export const maxDuration = 60

export async function POST(request: Request) {
    try {
        const { url } = await request.json()
        
        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 })
        }
        
        // Fetch the HTML
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        })
        
        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.statusText}`)
        }
        
        const html = await response.text()
        
        if (html.length < 5000 && html.toLowerCase().includes('cloudflare')) {
            throw new Error('Blocked by anti-bot protection. Please paste the raw text instead.')
        }

        const model = geminiFlash()
        
        const prompt = `You are a music chord extraction tool. I will provide you with the raw HTML of a webpage that contains a chord chart.
        
Your task is to:
1. Identify the Song Title.
2. Identify the Artist.
3. Extract the actual lyrics and chords. 
   - You MUST preserve the exact monospaced spacing and relative alignment of the chords above the lyrics.
   - Do NOT include any ads, sidebars, comments, or unnecessary metadata. Just the song structure (verses, choruses, intro) with chords.
   - Output the raw text of the chart exactly as it should look in a monospaced font.
   
Respond ONLY with a JSON object in the following format. Do not include markdown code blocks (like \`\`\`json), just the raw JSON object:
{
  "title": "Song Title",
  "artist": "Artist Name",
  "content": "Line 1\\nLine 2\\n..."
}

Here is the HTML (truncated if necessary):
${html.slice(0, 100000)}`

        const result = await model.generateContent(prompt)
        const text = result.response.text()
        
        let jsonString = text.trim()
        
        if (jsonString.startsWith('```')) {
            const match = jsonString.match(/```(?:json)?\n([\s\S]*?)\n```/)
            if (match) {
                jsonString = match[1]
            } else {
                jsonString = jsonString.replace(/^```json\n?/, '').replace(/\n?```$/, '')
            }
        }
        
        const parsed = JSON.parse(jsonString)
        
        return NextResponse.json(parsed)
        
    } catch (error: any) {
        console.error('Scraping error:', error)
        return NextResponse.json({ error: error.message || 'Failed to scrape chart' }, { status: 500 })
    }
}
