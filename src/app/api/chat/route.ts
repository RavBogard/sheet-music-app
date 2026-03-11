// NOTE: This route uses withAuth directly instead of createApiHandler because:
// 1. Rate limiting runs before auth (reject spam before token verification)
// 2. Returns streaming Response (not NextResponse) for SSE
// 3. Custom body parsing with early return pattern
import { NextResponse, NextRequest } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { z } from "zod"

import { getFullServiceContext, getNextFriday, getNextSaturday } from "@/lib/liturgical-calendar"
import { getUsageSummaries } from "@/lib/song-usage"
import { getTemplate, buildSetlistFromTemplate, generateSetlistName, TEMPLATE_LABELS, getAllTemplateKeys, TemplateContext } from "@/lib/liturgical-templates"
import { parseTemplateRequest } from "@/lib/template-parser"

const chatBodySchema = z.object({
    messages: z.array(z.object({
        role: z.string(),
        content: z.string(),
    })).min(1),
    currentSetlist: z.array(z.any()).optional().default([]),
    libraryFiles: z.array(z.any()).optional().default([]),
    setlistName: z.string().optional(),
    rabbi: z.string().optional(),
    matrixContext: z.any().optional(),
})

// New System Prompt Definition used for the 'Agent' persona
const SYSTEM_PROMPT = `
You are an expert Jewish Music Director and Service Leader (Shaliach Tzibur) for a Reform Jewish congregation.
You are now an AGENT capable of executing actions in the application.

Your capabilities:
1. **Setlist Management**: Create, Edit, and Organize setlists.
2. **Calendar**: Schedule setlists by setting their date.
3. **Administration** (Admin Only): Manage users (approve/promote).
4. **Navigation**: Open specific charts or views.
5. **Liturgical Knowledge**: You know the Reform Jewish liturgical order and can build service-appropriate setlists.
6. **Cross-Setlist Operations**: You can see ALL existing setlists and copy songs between them.

You have access to:
1. The user's "Current Setlist" (the one open in the editor right now).
2. "All Setlists" — every setlist in the system with their full track listings. You can reference these by name to copy songs, compare, or build new setlists from existing ones.
3. A "Library" of available sheet music.
4. (If Admin) A list of "Users" in the system.
5. The current Jewish calendar context (parasha, holidays, upcoming Shabbat).

**Output Format**:
You must return a JSON object with this structure:
{
  "message": "Your text response to the user...",
  "commands": [
    { "type": "CREATE_SETLIST", "payload": { "name": "Shabbat 1", "isPublic": false, "tracks": [] } },
    { "type": "ADD_TO_SETLIST", "payload": { "fileId": "123", "title": "Adon Olam" } },
    { "type": "REMOVE_FROM_SETLIST", "payload": { "index": 0 } },
    { "type": "REMOVE_FROM_SETLIST", "payload": { "all": true } },
    { "type": "PUBLISH_SETLIST", "payload": { "setlistId": "id", "date": "2024-02-09" } },
    { "type": "TRANSPOSE_CHART", "payload": { "steps": 2 } },
    { "type": "SEARCH_LIBRARY", "payload": { "query": "Shabbat" } },
    { "type": "ADMIN_ACTION", "payload": { "action": "set_role", "userId": "uid", "targetRole": "admin" } },
    { "type": "NAVIGATE", "payload": { "path": "/library" } },
    { "type": "OPEN_CHART", "payload": { "fileId": "123" } }
  ],
  "edits": []
}

**Rules**:
- Only use ADMIN_ACTION if the user is authorized (you will see 'User Role: admin' in context).
- **Service Flow Validation**: When asked to "check the flow", "review the service order", or "validate the setlist", analyze the current setlist for liturgical correctness. Check:
  * Are major liturgical sections in the standard Reform order? (e.g., Sh'ma before Amidah, Bar'chu before Sh'ma)
  * Are any essential elements missing for the service type? (e.g., no Kaddish, no Torah service on Shabbat morning)
  * Are there unusual placements that might be intentional but worth flagging?
  * Return findings in your "message" as a concise checklist: ✅ for correct, ⚠️ for suggestions, ❌ for likely errors.
  * Do NOT issue commands for this — just analyze and report in the message field.
- If asked to "Make Bob an admin", look up Bob in the USERS context, get his ID, and issue an ADMIN_ACTION command.
- If asked to "Create a setlist", issue a CREATE_SETLIST command.
- **Cross-setlist operations**: If asked to "add everything from [setlist name]" or "copy songs from [setlist name]", look up that setlist in the ALL SETLISTS context, find matching tracks, and issue ADD_TO_SETLIST commands for each song. When referencing another setlist, match by name (case-insensitive, partial match OK).
- NEVER use PUBLISH_SETLIST on an existing setlist from the "ALL SETLISTS" context. Updating the date on an old setlist destroys historical records! 
- If asked to schedule or reuse a **past setlist** for a new date, FIRST use CREATE_SETLIST with the tracks from that past setlist, then use PUBLISH_SETLIST to set the new date on the newly created setlist.
- If asked to build a setlist for a specific service (e.g., "Build me a setlist for this Friday", "Shabbat morning setlist"), create a CREATE_SETLIST with pre-populated tracks matched from the library. Follow the standard Reform liturgical order. Include section headers as tracks with type "header".
- When building liturgical setlists, generate a FULL SERVICE FLOW — not just songs. Include non-song liturgical moments as tracks with these types:
  * 'song': A musical piece linked to a chart in the library (must include fileId if found)
  * 'header': A section divider (e.g., "Kabbalat Shabbat", "T'filah")
  * 'reading': Torah reading, Haftarah, responsive reading (include performer + estimatedMinutes)
  * 'prayer': Silent prayer, Mourner's Kaddish, congregational prayer (include performer + estimatedMinutes)
  * 'transition': Musical interlude, procession, moment of silence (include estimatedMinutes)
  * 'note': Stage direction, timing cue, reminder (include performer if applicable)
- Non-song tracks format: { "title": "Silent Prayer", "type": "prayer", "performer": "Congregation", "estimatedMinutes": 2 }
- When building liturgical setlists, follow this order for Friday night: Welcome → Candle Lighting → Kabbalat Shabbat header → Hinei Mah Tov → Shalom Aleichem → L'cha Dodi → Bar'chu → Shema → V'ahavta → Mi Chamocha → Hashkiveinu → T'filah header → Silent Prayer → Oseh Shalom → Torah Service header → Torah Reading → Aleinu → Mourner's Kaddish → Closing Song → Kiddush.
- When building Shabbat morning setlists: Birchot HaShachar header → Morning Blessings → P'sukei D'zimra header → Ashrei → Nishmat → Bar'chu → Shema → V'ahavta → Mi Chamocha → T'filah header → Silent Prayer → Torah Service header → Torah Processional → Torah Reading → Haftarah → Returning the Torah → Sermon → Aleinu → Mourner's Kaddish → Adon Olam/Ein Keloheinu → Kiddush.
- Search the library context to find matching files for each liturgical slot.
- When SONG USAGE HISTORY is available, use it to rotate repertoire: prefer songs not used recently over ones used last week. Mention rotation reasoning if asked.
- **Matrix Review**: When provided with MATRIX CONTEXT, analyze the multi-week rotational grid. Suggest additions for upcoming columns that prevent repetition ("You played X last week, try Y this week"). Recommend repertoire that aligns with the specific parasha or holiday provided in the columns.
- **Rabbi-Specific Preferences**: Each rabbi has their own style and preferences. The "ALL SETLISTS" context shows which rabbi led each past service. When building or suggesting setlists, study past setlists tagged with the same rabbi to learn their patterns — typical song choices, service flow ordering, liturgical emphasis, and preferred musicians. If the current setlist has a rabbi assigned, tailor your suggestions to match that rabbi's established patterns. If asked about differences between rabbis, compare their past setlists.
- If asked to "Add Adon Olam to the setlist", use context to find the fileId and issue ADD_TO_SETLIST with both "title" and "fileId".
- ADD_TO_SETLIST payload uses "title" (not "fileName") for the display name. Include "fileId" if found in the library. For non-song items, include "type", "performer", "estimatedMinutes".
- If asked to "Remove the first song", issue REMOVE_FROM_SETLIST with index 0.
- If asked to "Delete everything", "Clear the setlist", or "Start over", issue REMOVE_FROM_SETLIST with { "all": true }. Then add new tracks.
- When combining "delete everything and rebuild", ALWAYS issue the REMOVE_FROM_SETLIST { "all": true } command FIRST, then ADD_TO_SETLIST commands for the new tracks.
- If asked to "Transpose up 2 steps", issue TRANSPOSE_CHART.
- If asked "Search for...", issue SEARCH_LIBRARY.
- If asked to "Show me the chart for Adon Olam", issue a NAVIGATE command to "/perform/[fileId]".
- **Template-Based Creation**: When the user asks to "create a [service type] for [date]" (e.g., "Create a Daniel Friday for March 14"), the server will automatically use the template engine to build a pre-populated setlist. You do NOT need to generate tracks manually. Simply issue a CREATE_SETLIST command and the server will fill in the tracks.
- When adding songs, you can specify "key" and "bpm" in the ADD_TO_SETLIST payload: { "title": "Mi Chamocha", "key": "Am", "bpm": 120 }.
- When the user says "in Am" or "in the key of G", set the "key" field on the ADD_TO_SETLIST payload.
- When the user says "after the responsive reading" or "after [title]", set "afterTitle" in the ADD_TO_SETLIST payload so the track is inserted after the specified track: { "title": "Mi Chamocha", "key": "Am", "afterTitle": "Responsive Reading" }.
- **BUILD_TEMPLATE**: When the user asks to "build a template", "create a template", or describes a service order they want saved as a template (e.g., "Saturday morning template: modeh ani, mah tovu, barchu, shema..."), generate a BUILD_TEMPLATE command:
  { "type": "BUILD_TEMPLATE", "payload": { "templateKey": "shabbat_morning", "slots": [ { "label": "Modeh Ani", "type": "song", "queries": ["modeh ani"], "fileId": "...", "fileName": "..." }, ... ] } }
  - For templateKey, infer from the user's description: "Saturday morning" → "shabbat_morning", "Friday night" → "friday_night", "Kol Nidre" → "kol_nidre", etc.
  - For each item in the user's list: search the LIBRARY FILES context for a match. If found, set fileId and fileName from the library. Always set queries with the song name lowercased as fallback.
  - For non-song items (prayers, readings, headers), set the appropriate type and do NOT set fileId.
  - Include section headers (type: "header") to organize the service flow.
  - The server will save the template to Firebase automatically.
- **Available Templates**: ${Object.entries(TEMPLATE_LABELS).map(([k, v]) => `${v.label} (${k})`).join(', ')}
`

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20 AI requests/min
    const limited = await checkRateLimit(request, 'ai')
    if (limited) return limited

    // 1. Authenticate first (reject before parsing body)
    const auth = await withAuth(request)
    if (auth instanceof NextResponse) return auth // 401 — reject unauthenticated

    const rawBody = await request.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const validation = chatBodySchema.safeParse(rawBody)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      )
    }

    const { messages, currentSetlist, libraryFiles, setlistName, rabbi, matrixContext } = validation.data

    // ── Template Auto-Fill: detect "Create a X for Y" and use template engine ──
    const lastMessage = messages[messages.length - 1]?.content || ''
    const templateRequest = parseTemplateRequest(lastMessage)

    if (templateRequest && (lastMessage.toLowerCase().includes('create') || lastMessage.toLowerCase().includes('build') || lastMessage.toLowerCase().includes('make'))) {
        const template = getTemplate(templateRequest.templateKey)
        if (template) {
            // Build service context for the template engine
            const targetDate = templateRequest.date || new Date()
            let serviceContext: TemplateContext
            try {
                const fullCtx = await getFullServiceContext(targetDate)
                serviceContext = { ...fullCtx, type: templateRequest.templateKey, rabbi: templateRequest.rabbi }
            } catch {
                serviceContext = {
                    type: templateRequest.templateKey,
                    date: targetDate,
                    hebrewDate: { display: '', year: '', month: '', day: 0 },
                    parasha: null,
                    holiday: null,
                    isShabbat: false,
                    rabbi: templateRequest.rabbi,
                }
            }

            // Build tracks using the template engine with the user's library
            const libFiles = libraryFiles.map((f: { id: string; name: string }) => ({
                id: f.id,
                name: f.name,
                mimeType: 'application/pdf',
            }))
            const tracks = buildSetlistFromTemplate(template, libFiles, serviceContext)
            const setlistGeneratedName = generateSetlistName(serviceContext)
            const templateLabel = TEMPLATE_LABELS[templateRequest.templateKey]?.label || templateRequest.templateKey

            // Return SSE response with template-generated tracks
            const encoder = new TextEncoder()
            const responsePayload = {
                done: true,
                message: `Created a ${templateLabel} setlist${templateRequest.rabbi ? ` for Rabbi ${templateRequest.rabbi.replace('_', ' & ')}` : ''} on ${targetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} with ${tracks.length} items from the template. Review and adjust as needed!`,
                commands: [{
                    type: 'CREATE_SETLIST',
                    payload: {
                        name: setlistGeneratedName,
                        isPublic: false,
                        tracks: tracks.map(t => ({
                            title: t.title,
                            fileId: t.fileId,
                            type: t.type,
                            performer: t.performer,
                            estimatedMinutes: t.estimatedMinutes,
                            key: t.key,
                        })),
                    },
                }],
                edits: [],
            }
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(responsePayload)}\n\n`))
                    controller.close()
                },
            })
            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            })
        }
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY

    // 2. Check Role & Build User Context
    const userRole = auth.role || 'member'
    let userContext = ""
    const missingContexts: string[] = []

    try {
      if (auth.isAdmin || auth.isBandLeader) {
        const usersSnap = await getFirestore().collection('users').limit(50).get()
        const users = usersSnap.docs.map(d => {
          const data = d.data()
          return `${data.displayName} (${data.email}) [ID: ${d.id}] [Role: ${data.role || 'member'}]${data.soundEngineer ? ' [Sound Engineer]' : ''}`
        }).join('\n')
        userContext = `\n--- ADMIN CONTEXT (USERS) ---\n${users}\n-----------------------------\n`
      }
    } catch (e) {
      logger.warn("[Chat] Admin context fetch failed:", e)
      missingContexts.push("admin users")
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: { responseMimeType: "application/json" }
    })

    // Construct the context
    const libraryContext = libraryFiles.slice(0, 500).map((f: { name: string; id: string }) => `${f.name} (ID: ${f.id})`).join("\n")
    const setlistContext = currentSetlist.map((t: { title: string }, i: number) => `${i + 1}. ${t.title}`).join("\n")

    // Fetch ALL setlists so the AI can reference them by name
    let allSetlistsContext = ""
    try {
      const firestore = getFirestore()
      // Only include public setlists + the requesting user's own setlists (privacy)
      const [publicSnap, ownSnap] = await Promise.all([
        firestore.collection('setlists')
          .where('isPublic', '==', true)
          .orderBy('date', 'desc')
          .limit(80)
          .get(),
        firestore.collection('setlists')
          .where('ownerId', '==', auth.uid)
          .orderBy('date', 'desc')
          .limit(20)
          .get(),
      ])

      // Merge and deduplicate
      const seen = new Set<string>()
      const allDocs = [...publicSnap.docs, ...ownSnap.docs].filter(doc => {
        if (seen.has(doc.id)) return false
        seen.add(doc.id)
        return true
      })

      if (allDocs.length > 0) {
        const setlistLines = allDocs.map(doc => {
          const data = doc.data()
          const rabbiTag = data.rabbi ? ` [Rabbi: ${data.rabbi}]` : ''
          const trackList = (data.tracks || [])
            .filter((t: { type?: string }) => !t.type || t.type === 'song')
            .map((t: { title: string; fileId?: string }, i: number) =>
              `  ${i + 1}. ${t.title}${t.fileId ? ` (fileId: ${t.fileId})` : ''}`
            )
            .join('\n')
          return `📋 "${data.name}" (ID: ${doc.id}, ${data.isPublic ? 'public' : 'private'}, ${data.trackCount || 0} tracks${rabbiTag})\n${trackList}`
        }).join('\n\n')
        allSetlistsContext = `\n--- ALL SETLISTS ---\n${setlistLines}\n--------------------\n`
      }
    } catch (e) {
      logger.warn("[Chat] Failed to fetch setlists for AI context:", e)
      missingContexts.push("setlists")
    }

    // Add liturgical calendar context
    let liturgicalContext = ""
    try {
      const nextFri = getNextFriday()
      const nextSat = getNextSaturday()
      const friCtx = await getFullServiceContext(nextFri)
      const satCtx = await getFullServiceContext(nextSat)
      const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

      liturgicalContext = `\n--- JEWISH CALENDAR CONTEXT ---
Today: ${todayStr}
Next Friday (${nextFri.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}): ${friCtx.holiday || 'Regular Shabbat'}${friCtx.parasha ? `, Parashat ${friCtx.parasha}` : ''}
Next Saturday (${nextSat.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}): ${satCtx.holiday || 'Regular Shabbat'}${satCtx.parasha ? `, Parashat ${satCtx.parasha}` : ''}
Hebrew Date: ${friCtx.hebrewDate.display}
-------------------------------\n`
    } catch (e) {
      logger.warn("[Chat] Liturgical context fetch failed:", e)
      missingContexts.push("calendar")
    }

    // Song usage context — helps AI avoid repeating songs too often
    let usageContext = ""
    try {
      const setlistFileIds = currentSetlist
        .filter((t: { fileId?: string }) => t.fileId)
        .map((t: { fileId: string }) => t.fileId)
      if (setlistFileIds.length > 0) {
        const summaries = await getUsageSummaries(setlistFileIds)
        if (summaries.size > 0) {
          const lines: string[] = []
          for (const [fileId, summary] of summaries) {
            const track = currentSetlist.find((t: { fileId?: string }) => t.fileId === fileId)
            const dateStr = summary.lastUsedDate instanceof Date
              ? summary.lastUsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'unknown'
            lines.push(`${track?.title || fileId}: last used ${dateStr}, total ${summary.totalUses}×`)
          }
          usageContext = `\n--- SONG USAGE HISTORY ---\n${lines.join('\n')}\n--------------------------\n`
        }
      }
    } catch (e) {
      logger.warn("[Chat] Song usage context fetch failed:", e)
      missingContexts.push("song usage")
    }

    let matrixStr = ""
    if (matrixContext && matrixContext.columns) {
      matrixStr = `\n--- MATRIX CONTEXT (8-WEEK ROTATION) ---\n`
      matrixStr += `This represents the past 3 weeks and upcoming 4 weeks of repertoire.\n`
      matrixStr += JSON.stringify(matrixContext, null, 2)
      matrixStr += `\n----------------------------------------\n`
    }

    const missingContextNote = missingContexts.length > 0
      ? `\n--- MISSING CONTEXT (failed to load) ---\n${missingContexts.join(', ')}\nPlease note these data sources are unavailable for this response.\n---------------------------------------\n`
      : ''

    const prompt = `
${SYSTEM_PROMPT}

CURRENT USER ROLE: ${userRole.toUpperCase()}

CONTEXT:
--- LIBRARY FILES (Top 500) ---
${libraryContext}
-------------------------------

--- CURRENT SETLIST${setlistName ? ` ("${setlistName}")` : ''}${rabbi ? ` [Rabbi: ${rabbi}]` : ''} ---
${setlistContext}
-----------------------
${allSetlistsContext}${liturgicalContext}${usageContext}${matrixStr}${userContext}${missingContextNote}
USER MESSAGE:
${messages[messages.length - 1].content}
`

    const result = await model.generateContentStream(prompt)

    // Stream response as Server-Sent Events
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let accumulated = ""
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              accumulated += text
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: text, accumulated })}\n\n`))
            }
          }
          // Final event with complete parsed response
          try {
            const parsed = JSON.parse(accumulated)

            // Handle BUILD_TEMPLATE server-side: save to Firestore and strip from client commands
            if (parsed.commands && Array.isArray(parsed.commands)) {
              const buildCmd = parsed.commands.find((c: { type: string }) => c.type === 'BUILD_TEMPLATE')
              if (buildCmd?.payload?.templateKey && buildCmd?.payload?.slots) {
                try {
                  const firestore = getFirestore()
                  const templateKey = buildCmd.payload.templateKey as string
                  const slots = buildCmd.payload.slots as Record<string, unknown>[]
                  // Sanitize slots: ensure required fields and strip undefined
                  const cleanSlots = slots.map((s: Record<string, unknown>) => {
                    const slot: Record<string, unknown> = {
                      label: s.label || 'Untitled',
                      queries: Array.isArray(s.queries) ? s.queries : [],
                    }
                    if (s.type) slot.type = s.type
                    if (s.fileId) { slot.fileId = s.fileId; slot.fileName = s.fileName || '' }
                    if (s.pageNumber) slot.pageNumber = s.pageNumber
                    if (s.defaultPerformer) slot.defaultPerformer = s.defaultPerformer
                    if (s.estimatedMinutes) slot.estimatedMinutes = s.estimatedMinutes
                    if (s.description) slot.description = s.description
                    return slot
                  })
                  await firestore.collection('templates').doc(templateKey).set({
                    slots: cleanSlots,
                    updatedAt: new Date(),
                    updatedBy: auth.uid,
                  })
                  const templateLabel = TEMPLATE_LABELS[templateKey]?.label || templateKey
                  parsed.message = (parsed.message || '') + `\n\nTemplate "${templateLabel}" saved with ${cleanSlots.length} slots.`
                } catch (saveErr) {
                  logger.error("Failed to save BUILD_TEMPLATE:", saveErr)
                  parsed.message = (parsed.message || '') + '\n\n⚠️ Failed to save template to Firebase.'
                }
                // Remove BUILD_TEMPLATE from commands sent to client
                parsed.commands = parsed.commands.filter((c: { type: string }) => c.type !== 'BUILD_TEMPLATE')
              }
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, ...parsed })}\n\n`))
          } catch {
            // If JSON parse fails, send raw text as message
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, message: accumulated, commands: [] })}\n\n`))
          }
        } catch (err) {
          logger.error("[Chat] Stream error:", err)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`))
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })

  } catch (error: unknown) {
    logger.error("[Chat] Request failed:", error)
    return NextResponse.json(
      { error: "Chat request failed" },
      { status: 500 }
    )
  }
}
