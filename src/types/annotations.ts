export interface Annotation {
    id: string
    type: "freehand" | "text" | "highlight"
    /** SVG path data (normalized 0-1 coordinate space) */
    path?: string
    /** Text content for text annotations */
    text?: string
    /** Normalized x position (0-1) */
    x?: number
    /** Normalized y position (0-1) */
    y?: number
    /** Color hex */
    color: string
    /** Stroke width (for freehand) */
    strokeWidth?: number
    /** Page number (1-indexed) */
    pageNumber: number
    /** Creation timestamp */
    createdAt: number
}

export interface PageAnnotations {
    [pageNumber: string]: Annotation[]
}

export interface AnnotationDocument {
    fileId: string
    pageAnnotations: PageAnnotations
    updatedAt: number
}

export type AnnotationTool = "freehand" | "text" | "highlight"
export type AnnotationColor = "#ef4444" | "#3b82f6" | "#22c55e" | "#f59e0b"

export const ANNOTATION_COLORS: { hex: AnnotationColor; label: string }[] = [
    { hex: "#ef4444", label: "Red" },
    { hex: "#3b82f6", label: "Blue" },
    { hex: "#22c55e", label: "Green" },
    { hex: "#f59e0b", label: "Amber" },
]
