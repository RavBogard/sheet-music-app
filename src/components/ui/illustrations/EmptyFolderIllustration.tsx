export function EmptyFolderIllustration({ className = "w-24 h-24" }: { className?: string }) {
    return (
        <svg viewBox="0 0 96 96" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Folder back */}
            <path d="M16 30 L16 72 C16 74.2 17.8 76 20 76 L76 76 C78.2 76 80 74.2 80 72 L80 34 C80 31.8 78.2 30 76 30 L44 30 L38 22 L20 22 C17.8 22 16 23.8 16 26 Z"
                fill="currentColor" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
            {/* Folder tab */}
            <path d="M16 26 C16 23.8 17.8 22 20 22 L38 22 L44 30 L16 30 Z"
                fill="currentColor" opacity="0.1" />
            {/* Dashed interior box */}
            <rect x="30" y="44" width="36" height="20" rx="3"
                stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.15" />
            {/* Plus icon in center */}
            <line x1="48" y1="50" x2="48" y2="58" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
            <line x1="44" y1="54" x2="52" y2="54" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
        </svg>
    )
}
