import type { Metadata } from "next"
import { getT } from "@/i18n/server"
import { GuideView } from "@/components/help/GuideView"
import { HELP_GUIDES } from "@/lib/help/guides"

export async function generateMetadata(): Promise<Metadata> {
    const t = await getT()
    return { title: t(HELP_GUIDES.after.titleKey) }
}

export default function HelpAfterPage() {
    return <GuideView slug="after" />
}
