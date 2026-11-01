import type { Metadata } from "next"
import { getT } from "@/i18n/server"
import { GuideView } from "@/components/help/GuideView"
import { HELP_GUIDES } from "@/lib/help/guides"

export async function generateMetadata(): Promise<Metadata> {
    const t = await getT()
    return { title: t(HELP_GUIDES.drew.titleKey) }
}

export default function HelpDrewPage() {
    return <GuideView slug="drew" />
}
