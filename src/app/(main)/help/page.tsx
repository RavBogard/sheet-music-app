import type { Metadata } from "next"
import { getT } from "@/i18n/server"
import { HelpIndex } from "@/components/help/HelpIndex"

export async function generateMetadata(): Promise<Metadata> {
    const t = await getT()
    return { title: t("helpGuides.indexTitle") }
}

export default function HelpPage() {
    return <HelpIndex />
}
