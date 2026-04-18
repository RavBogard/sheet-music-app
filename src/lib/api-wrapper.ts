import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { AuthRole, AuthResult, withAuth } from "./api-auth"
import { logger } from "./logger"
import {
    generateRequestId,
    getCurrentRequestId,
    requestIdStorage,
    validateInboundRequestId,
} from "./request-id"

/** Standard error response shape for all API routes */
export type ApiErrorResponse = {
    error: string
    code?: string
    details?: unknown
    requestId?: string
}

/**
 * Helper to create consistent error responses.
 * If called inside an API handler (ALS scope), the current request ID is
 * included in both the JSON body and the `x-request-id` response header.
 */
export function apiError(error: string, status: number, code?: string, details?: unknown): NextResponse {
    const requestId = getCurrentRequestId()
    const body: ApiErrorResponse = { error }
    if (code) body.code = code
    if (details !== undefined) body.details = details
    if (requestId) body.requestId = requestId
    const res = NextResponse.json(body, { status })
    if (requestId) res.headers.set("x-request-id", requestId)
    return res
}

export interface ProtectedApiContext<P = any, B = any> {
    req: NextRequest
    auth: AuthResult
    params?: P
    body?: B
}

interface ApiOptions<TBody extends z.ZodType> {
    role?: AuthRole
    schema?: TBody
    requireAuth?: boolean
}

/**
 * Creates a standard API route handler that automatically handles:
 * 1. Authentication & Role Verification (via Firebase Admin)
 * 2. Zod Request Body Validation
 * 3. Error Catching & Logging
 * 4. Request-ID propagation (AsyncLocalStorage → logger + response header)
 */
export function createApiHandler<TParams = any, TBody extends z.ZodType = any>(
    handler: (ctx: ProtectedApiContext<TParams, z.infer<TBody>>) => Promise<NextResponse | Response> | NextResponse | Response,
    options?: ApiOptions<TBody>
) {
    return async (req: NextRequest, context?: any): Promise<NextResponse | Response> => {
        const inboundId = validateInboundRequestId(req.headers.get("x-request-id"))
        const requestId = inboundId ?? generateRequestId()

        return requestIdStorage.run({ requestId }, async () => {
            const runHandler = async (): Promise<NextResponse | Response> => {
                try {
                    // 1. Authenticate Request
                    const optional = options?.requireAuth === false;
                    const authResponse = optional
                        ? await withAuth(req, options?.role, true)
                        : await withAuth(req, options?.role)
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
                                return apiError("Validation failed", 400, "VALIDATION_ERROR", validation.error.format())
                            }
                            parsedBody = validation.data
                        } catch (err) {
                            return apiError("Invalid JSON format", 400, "INVALID_JSON")
                        }
                    }

                    // params is a Promise in Next.js 15+
                    const resolvedParams = context?.params ? await context.params : undefined;

                    // 3. Execute Handler
                    const ctx: ProtectedApiContext<TParams, z.infer<TBody>> = {
                        req,
                        auth: authResponse as AuthResult,
                        params: resolvedParams,
                        body: parsedBody
                    }

                    return await handler(ctx)
                } catch (error) {
                    const pathname = new URL(req.url).pathname
                    logger.error(`[API ${req.method} ${pathname}]`, error)
                    return apiError("Internal server error", 500, "INTERNAL_ERROR")
                }
            }

            const response = await runHandler()
            // Stamp the response header — even on auth failures / validation errors
            // that came from NextResponse.json without going through apiError.
            response.headers.set("x-request-id", requestId)
            return response
        })
    }
}
