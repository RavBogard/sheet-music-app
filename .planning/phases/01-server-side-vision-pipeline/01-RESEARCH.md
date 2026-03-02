# Phase 1: Server-Side Vision Pipeline - Research

**Researched:** March 2, 2026
**Domain:** Optical Music Recognition & Vision APIs
**Confidence:** HIGH

## Summary

This phase replaces DOM-scraping with a server-side Vision API pipeline. The core task is building an endpoint (`/api/ai/transposer/scan`) that receives a base64 image of a sheet music page and prompts a multi-modal LLM to return absolute coordinate bounding boxes for every chord.

**Primary recommendation:** Use Google Gemini 1.5 Pro via `@google/generative-ai` with structured JSON output, as it currently leads in spatial reasoning for dense, non-standard document layouts compared to GPT-4o, though either SDK (both are installed) will work. Require the model to return coordinates as percentages (0-100) to ensure the client can render overlays correctly regardless of screen size.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — User chose to skip discuss-phase and proceed without a CONTEXT.md.

### Claude's Discretion
All implementation details are at Claude's discretion.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIS-01 | Server endpoint receives a page image and requests chord bounding boxes from Vision API (Gemini/OpenAI). | Next.js API Routes (App Router) easily handle base64 POST payloads. Both SDKs are installed. |
| VIS-02 | Vision API prompt enforces strict JSON schema returning `[text, x, y, width, height]` for each chord. | Gemini's `responseMimeType: "application/json"` and `responseSchema` support enforces this perfectly. |
| VIS-03 | Vision API coordinate percentages are normalized accurately relative to the source image dimensions. | The prompt must specifically instruct the model to return coordinates as percentages of the image width/height (0-100 or 0.0-1.0). |
| VIS-04 | Endpoint gracefully handles empty pages or pages with no discernible chords. | The prompt must instruct the model to return an empty array `[]` if no chords exist, and the endpoint must catch API errors. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/generative-ai` | ^0.24.1 | Vision LLM API | Best-in-class spatial/document reasoning for PDFs/images via Gemini 1.5 Pro. |
| `openai` | ^6.22.0 | Vision LLM API | Fallback alternative using `gpt-4o`. |
| `zod` | ^4.3.6 | Validating endpoint payloads | Validates the incoming base64 payload and the outgoing JSON array shape. |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/api/ai/transposer/scan/
│   └── route.ts             # The actual Next.js App Router POST endpoint
├── lib/
│   └── ai-vision.ts         # Abstraction for the Google/OpenAI SDK calls
```

### Pattern 1: Structured JSON Parsing with Vision
**What:** Forcing the LLM to return structured data instead of markdown text.
**When to use:** Whenever the frontend needs to map over the results (like drawing React overlays).
**Example:**
```typescript
const responseSchema = {
    type: FunctionDeclarationSchemaType.ARRAY,
    items: {
        type: FunctionDeclarationSchemaType.OBJECT,
        properties: {
            text: { type: FunctionDeclarationSchemaType.STRING, description: "The music chord, e.g. C#m7" },
            x: { type: FunctionDeclarationSchemaType.NUMBER, description: "X percentage coordinate (0-100)" },
            y: { type: FunctionDeclarationSchemaType.NUMBER, description: "Y percentage coordinate (0-100)" },
            w: { type: FunctionDeclarationSchemaType.NUMBER, description: "Width percentage (0-100)" },
            h: { type: FunctionDeclarationSchemaType.NUMBER, description: "Height percentage (0-100)" }
        }
    }
};
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AI interaction | Raw `fetch` calls to Google/OpenAI APIs | Existing SDKs (`@google/generative-ai`, `openai`) | SDKs handle auth, retries, and schema formatting automatically. |

## Common Pitfalls

### Pitfall 1: Base64 Payload Size Limits
**What goes wrong:** Next.js throws a `413 Payload Too Large` error.
**Why it happens:** Vercel/Next.js limits incoming request bodies (usually 4MB). High-res PDF canvas images easily exceed this.
**How to avoid:** The client must aggressively compress the JPEG canvas before sending it, OR the server endpoint must be configured to accept larger bodies if hosting allows.

### Pitfall 2: Absolute Pixels vs Percentages
**What goes wrong:** The AI returns chords at `x: 500px`, but the user views the PDF on a mobile phone 400px wide. Overlays render off-screen.
**Why it happens:** Image dimensions processed by the AI don't match the client's screen size.
**How to avoid:** Explicitly prompt the AI: *"Return all coordinates (X/Y/W/H) as a percentage (0 to 100) of the total image width and height."*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DOM heuristic scraping | Generative Vision API (Gemini/GPT-4o) | Mid-2024 | Massive leap in accuracy for non-linear sheet music fonts. |

## Sources

### Primary (HIGH confidence)
- `@google/generative-ai` SDK documentation (Context: known API capabilities).
- Next.js App Router Route Handler documentation (`src/app/api/.../route.ts`).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries already exist in package.json.
- Architecture: HIGH - Standard Next.js Route Handler pattern.
- Pitfalls: HIGH - Common constraints with Vision APIs and serverless payloads.

**Research date:** March 2, 2026
**Valid until:** April 2, 2026
