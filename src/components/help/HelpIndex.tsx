import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { getT } from "@/i18n/server"
import { PageContainer, PageHeader } from "@/components/layout/Page"
import { HELP_GUIDES, HELP_SLUGS } from "@/lib/help/guides"

/** /help: one card per guide. */
export async function HelpIndex() {
    const t = await getT()
    return (
        <PageContainer className="flex flex-col gap-3" data-testid="help-index">
            <PageHeader title={t("helpGuides.indexTitle")} />
            <ul className="mx-auto flex w-full max-w-[44rem] flex-col gap-2">
                {HELP_SLUGS.map((slug) => (
                    <li key={slug}>
                        <Link
                            href={`/help/${slug}`}
                            data-testid={`help-card-${slug}`}
                            className="group flex min-h-14 items-center justify-between gap-3 rounded-lg border border-rule bg-card px-4 py-3 text-base font-extrabold leading-tight text-foreground transition-colors hover:bg-accent/60 active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                            <span>{t(HELP_GUIDES[slug].cardKey)}</span>
                            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground rtl:-scale-x-100" />
                        </Link>
                    </li>
                ))}
            </ul>
        </PageContainer>
    )
}
