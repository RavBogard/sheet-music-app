export function NoSearchResultsIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
            {/* Magnifying glass */}
            <circle cx="42" cy="42" r="18" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <line x1="55" y1="55" x2="72" y2="72" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.3" />
            {/* Question mark inside */}
            <path d="M38 36 C38 32 42 30 46 32 C50 34 48 38 44 40 L44 44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" fill="none" />
            <circle cx="44" cy="48" r="1" fill="currentColor" opacity="0.25" />
        </svg>
    )
}
