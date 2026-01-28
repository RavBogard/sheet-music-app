import { NextResponse } from "next/server"
import { verifyIdToken } from "@/lib/firebase-admin"
import { globalLimiter } from "@/lib/rate-limit"
import { ZodError } from "zod"

type ApiHandler = (req: Request, context: any) => Promise<NextResponse>

interface MiddlewareOptions {
    isPublic?: boolean
    rateLimit?: boolean
}

export function withAuth(handler: ApiHandler, options: MiddlewareOptions = {}): ApiHandler {
    return async (req: Request, context: any) => {
        try {
            // 1. Rate Limiting
            if (options.rateLimit !== false) {
                const ip = req.headers.get("x-forwarded-for") || "unknown"
                if (!globalLimiter.check(ip)) {
                    return NextResponse.json(
                        { error: "Too Many Requests", code: "rate_limit_exceeded" },
                        { status: 429 }
                    )
                }
            }

            // 2. Authentication
            if (!options.isPublic) {
                const authHeader = req.headers.get("Authorization")
                const token = authHeader?.split("Bearer ")[1]

                if (!token) {
                    return NextResponse.json(
                        { error: "Unauthorized", code: "missing_token" },
                        { status: 401 }
                    )
                }

                const decodedToken = await verifyIdToken(token)
                if (!decodedToken) {
                    return NextResponse.json(
                        { error: "Invalid Token", code: "invalid_token" },
                        { status: 403 }
                    )
                }

                // Optional: Attach user to request if needed, but Request is immutable.
                // We trust the handler to re-verify if it needs specific claims, 
                // or we could pass it as a third arg if we change the handler signature.
            }

            // 3. Execution
            return await handler(req, context)

        } catch (error) {
            console.error("[API Middleware Error]:", error)

            if (error instanceof ZodError) {
                return NextResponse.json(
                    { error: "Validation Error", details: (error as any).issues || (error as any).errors },
                    { status: 400 }
                )
            }

            return NextResponse.json(
                { error: "Internal Server Error", message: String(error) },
                { status: 500 }
            )
        }
    }
}
