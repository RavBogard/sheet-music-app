"use client"

import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
    Tooltip, CartesianGrid, LineChart, Line,
} from "recharts"
import { Calendar, TrendingUp } from "lucide-react"

interface TimelineData {
    month: string
    totalSongs: number
    uniqueSongs: number
    setlistCount: number
}

interface TimelineChartProps {
    timeline: TimelineData[]
    dateRange: { from: string; to: string }
    totalSetlists: number
}

function formatMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[parseInt(month) - 1]} ${year.slice(2)}`
}

function formatDateRange(isoStr: string): string {
    const d = new Date(isoStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const TOOLTIP_STYLE = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
}

const AXIS_TICK = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' }

export default function TimelineChart({ timeline, dateRange, totalSetlists }: TimelineChartProps) {
    const timelineData = timeline.map(t => ({
        ...t,
        label: formatMonth(t.month),
    }))

    return (
        <div className="space-y-6">
            {/* Setlist count over time */}
            <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    Services per Month
                </h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={timelineData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="label" tick={AXIS_TICK} />
                            <YAxis tick={AXIS_TICK} width={30} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="setlistCount" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} name="Services" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Songs per service trend */}
            <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                    Songs per Month
                </h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timelineData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="label" tick={AXIS_TICK} />
                            <YAxis tick={AXIS_TICK} width={30} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Line type="monotone" dataKey="totalSongs" stroke="hsl(262, 83%, 58%)" strokeWidth={2} dot={{ r: 3 }} name="Total Songs" />
                            <Line type="monotone" dataKey="uniqueSongs" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 3 }} name="Unique Songs" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Summary table */}
            <div className="text-xs text-muted-foreground">
                Showing data from {formatDateRange(dateRange.from)} to {formatDateRange(dateRange.to)}
                {' · '}{totalSetlists} total setlists
            </div>
        </div>
    )
}
