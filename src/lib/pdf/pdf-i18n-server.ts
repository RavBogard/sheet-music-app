import "server-only"

import { i18nStateFor, translatorFor } from "@/i18n/server"
import { getOrgConfig } from "@/lib/org/get-org-config"
import type { OrgId } from "@/lib/org/types"
import type { PdfI18n } from "./pdf-i18n"

/**
 * Multi-tenant phase 7: the PDF label language for a tenant when there is no
 * user to ask (MCP tools, background jobs): the tenant's own language, with
 * its vocabulary overrides and tokens. No ui-lang cookie is consulted. CRC and
 * Brothers Lazaroff resolve to English, so their PDFs are unchanged.
 */
export async function pdfI18nForOrg(orgId: OrgId): Promise<PdfI18n> {
    const config = await getOrgConfig(orgId)
    const state = i18nStateFor(orgId, config, null)
    return { t: translatorFor(state), lang: state.lang }
}
