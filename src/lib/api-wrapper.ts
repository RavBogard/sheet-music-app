import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { AuthRole, AuthResult, withAuth } from "./api-auth"
import { logger } from "./logger"

export interface ProtectedApiContext<P = any, B = any> {
    req: NextRequest
    auth: AuthResult
    params?: P
    body?: B
}

interface ApiOptions<TBody extends z.ZodType> {
    role?: AuthRole
    schema?: TBody
}

/**
 * Creates a standard API route handler that automatically handles:
 * 1. Authentication & Role Verification (via Firebase Admin)
 * 2. Zod Request Body Validation
 * 3. Error Catching & Logging
 */
export function createApiHandler<TParams = any, TBody extends z.ZodType = any>(
    handler: (ctx: ProtectedApiContext<TParams, z.infer<TBody>>) => Promise<NextResponse> | NextResponse,
    options?: ApiOptions<TBody>
) {
    return async (req: NextRequest, context?: any): Promise<NextResponse> => {
        try {
            // 1. Authenticate Request
            const authResponse = await withAuth(req, options?.role)
            if (authResponse instanceof NextResponse) {
                return authResponse // auth failed (401 or 403)
            }

            // 2. Validate Body (if schema provided and applicable request type)
            let parsedBody: z.infer<TBody> | undefined = undefined
            if (options?.schema && ["POST", "PUT", "PATCH"].includes(req.method)) {
                try {
                    const rawBody = await req.json()
                    const validation = options.schema.safeParse(rawBody)

                    if (!validation.success) {
                        return NextResponse.json(
                            { error: "Validation failed", details: validation.error.format() },
                            { status: 400 }
                        )
                    }
                    parsedBody = validation.data
                } catch (err) {
                    return NextResponse.json(
                        { error: "Invalid JSON format" },
                        { status: 400 }
                    )
                }
            }

            // params is a Promise in Next.js 15+
            const resolvedParams = context?.params ? await context.params : undefined;

            // 3. Execute Handler
            const ctx: ProtectedApiContext<TParams, z.infer<TBody>> = {
                req,
                auth: authResponse,
                params: resolvedParams,
                body: parsedBody
            }

            return await handler(ctx)
        } catch (error) {
            const pathname = new URL(req.url).pathname
            logger.error(`[API ${req.method} ${pathname}]`, error)
            return NextResponse.json(
                { error: "Internal server error", details: { route: `${req.method} ${pathname}` } },
                { status: 500 }
            )
        }
    }
}
