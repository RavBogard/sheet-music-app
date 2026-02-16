export function NoResultsIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Magnifying glass circle */}
            <circle cx="42" cy="42" r="20" stroke="currentColor" strokeWidth="2" opacity="0.2" />
            <circle cx="42" cy="42" r="20" fill="currentColor" opacity="0.04" />
            {/* Handle */}
            <line x1="56" y1="56" x2="72" y2="72" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.2" />
            {/* Question mark */}
            <path d="M38 36 C38 32 42 30 45 30 C48 30 50 32 50 35 C50 38 47 38 45 40 L45 43"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.25" fill="none" />
            <circle cx="45" cy="48" r="1.5" fill="currentColor" opacity="0.25" />
        </svg>
    )
}
