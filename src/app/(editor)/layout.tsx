import { ChatPanel } from "@/components/setlist/ChatPanel"

export default function EditorLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-background text-foreground">
            {children}
            <ChatPanel />
        </div>
    )
}
