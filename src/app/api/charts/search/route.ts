import { NextResponse } from 'next/server'
import { geminiFlashWithSearch } from '@/lib/gemini'

export const maxDuration = 60

export async function POST(request: Request) {
    try {
        const { messages } = await request.json()
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: 'Messages array is required' }, { status: 400 })
        }

        const model = geminiFlashWithSearch()
        
        const systemInstruction = `You are an AI assistant helping a worship leader or musician find chord charts on the web. 
They might ask for a specific song, or vaguely describe a song. 
Use your Google Search tool to figure out what song they mean, and then search for chord charts on sites like Ultimate Guitar.
Respond conversationally to help them. 
ALWAYS output your response as a JSON object in this format:
{
  "message": "Your conversational reply here (e.g., 'Oh, you probably mean Carnival! Here are some charts:')",
  "results": [
    {
      "title": "Song Title",
      "artist": "Artist Name",
      "url": "https://..."
    }
  ]
}
If you need to ask a follow-up question, provide the "message" and leave "results" as an empty array.
Do not wrap your response in markdown blocks like \`\`\`json, just output the raw JSON object.`;

        // Separate previous history and the latest message
        const previousMessages = messages.slice(0, -1);
        const lastMessage = messages[messages.length - 1].content;

        const chat = model.startChat({
            history: previousMessages.map((m: any) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))
        })

        // Inject system instructions if this is the first turn
        let prompt = lastMessage;
        if (previousMessages.length === 0) {
            prompt = systemInstruction + "\n\nUser Request: " + lastMessage;
        }

        const result = await chat.sendMessage(prompt)
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
        
        // Ensure format is { message: string, results: any[] }
        const responseData = {
            message: parsed.message || "Here are some results I found.",
            results: Array.isArray(parsed.results) ? parsed.results : []
        }
        
        return NextResponse.json(responseData)
        
    } catch (error: any) {
        console.error('Search error:', error)
        return NextResponse.json({ error: error.message || 'Failed to search' }, { status: 500 })
    }
}
