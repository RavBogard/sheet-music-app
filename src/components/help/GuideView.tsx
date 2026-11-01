import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { getT } from "@/i18n/server"
import { PageContainer } from "@/components/layout/Page"
import { HELP_GUIDES, type HelpBlock, type HelpSlug } from "@/lib/help/guides"
import type { T } from "@/i18n/core"
import { inline } from "./inline"
import { PrintButton } from "./PrintButton"

const BODY = "text-[15px] leading-relaxed text-foreground"

function Block({ block, t }: { block: HelpBlock; t: T }) {
    switch (block.kind) {
        case "heading":
            return <h2 className="help-h2 mt-6 text-base font-extrabold leading-tight text-foreground">{t(block.key)}</h2>
        case "p":
            return <p className={BODY}>{inline(t(block.key))}</p>
        case "ol":
            return (
                <ol className={`${BODY} list-decimal space-y-2 ps-6 marker:font-bold marker:text-muted-foreground`}>
                    {block.keys.map((key) => (
                        <li key={key} className="help-item">{inline(t(key))}</li>
                    ))}
                </ol>
            )
        case "ul":
            return (
                <ul className={`${BODY} list-disc space-y-2 ps-6 marker:text-muted-foreground`}>
                    {block.keys.map((key) => (
                        <li key={key} className="help-item">{inline(t(key))}</li>
                    ))}
                </ul>
            )
        case "checks":
            // Plain tick boxes: they tick on screen and are not saved anywhere.
            return (
                <ul className={`${BODY} space-y-1`} data-testid="help-checklist">
                    {block.keys.map((key) => (
                        <li key={key} className="help-item">
                            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
                                <input type="checkbox" className="help-check mt-0.5 size-6 shrink-0 cursor-pointer accent-primary" />
                                <span>{inline(t(key))}</span>
                            </label>
                        </li>
                    ))}
                </ul>
            )
        case "table":
            return (
                <div className="help-table overflow-x-auto rounded-lg border border-rule">
                    <table className={`${BODY} w-full border-collapse text-start`}>
                        <thead>
                            <tr className="border-b border-rule bg-muted">
                                {block.head.map((h, i) => (
                                    <th key={i} scope="col" className="px-3 py-2 text-start align-top text-sm font-bold">
                                        {h === null ? null : t(h)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {block.rows.map((row, r) => (
                                <tr key={r} className="border-b border-rule last:border-b-0">
                                    {row.map((key, c) =>
                                        c === 0 && block.rowHeader ? (
                                            <th key={key} scope="row" className="px-3 py-2 text-start align-top font-bold">{inline(t(key))}</th>
                                        ) : (
                                            <td key={key} className="px-3 py-2 align-top">{inline(t(key))}</td>
                                        ),
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
    }
}

/** One guide, as a printable one-column page. */
export async function GuideView({ slug }: { slug: HelpSlug }) {
    const t = await getT()
    const guide = HELP_GUIDES[slug]
    return (
        <PageContainer>
            <article data-testid={`help-guide-${slug}`} className="help-guide mx-auto flex max-w-[44rem] flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                    <Link
                        href="/help"
                        data-testid="help-back"
                        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
                    >
                        <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:-scale-x-100" />
                        {t("helpGuides.allGuides")}
                    </Link>
                    <PrintButton label={t("helpGuides.printGuide")} />
                </div>
                <h1 className="help-h1 text-xl font-extrabold leading-tight text-foreground">{t(guide.titleKey)}</h1>
                {guide.blocks.map((block, i) => (
                    <Block key={i} block={block} t={t} />
                ))}
            </article>
        </PageContainer>
    )
}
