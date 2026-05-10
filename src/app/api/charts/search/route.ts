import { NextResponse } from 'next/server'
import { geminiFlashWithSearch } from '@/lib/gemini'

export const maxDuration = 60

export async function POST(request: Request) {
    try {
        const { query } = await request.json()
        
        if (!query) {
            return NextResponse.json({ error: 'Search query is required' }, { status: 400 })
        }

        const model = geminiFlashWithSearch()
        
        const prompt = `Search the web for chords to "${query}". Focus on Ultimate Guitar or similar chord sites.
Return a JSON array of the top 3 links you found.
Respond ONLY with a JSON array in the following format. Do not include markdown code blocks (like \`\`\`json), just the raw JSON array:
[
  {
    "title": "Song Title",
    "artist": "Artist Name",
    "url": "https://..."
  }
]`

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
        
        return NextResponse.json({ results: parsed })
        
    } catch (error: any) {
        console.error('Search error:', error)
        return NextResponse.json({ error: error.message || 'Failed to search' }, { status: 500 })
    }
}
