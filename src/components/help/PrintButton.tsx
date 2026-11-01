"use client"

import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Opens the browser's print dialog. The guide's own print styles do the rest. */
export function PrintButton({ label }: { label: string }) {
    return (
        <Button type="button" variant="outline" onClick={() => window.print()} className="gap-2 print:hidden" data-testid="help-print">
            <Printer aria-hidden="true" className="h-4 w-4" />
            {label}
        </Button>
    )
}
