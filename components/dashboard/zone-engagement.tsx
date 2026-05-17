"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChartTooltip } from "@/components/ui/chart"

interface ZonePoint {
  zone: string
  events: number
}

interface ZoneEngagementProps {
  data: ZonePoint[]
}

export default function ZoneEngagement({ data }: ZoneEngagementProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="zone" angle={-35} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="events" name="Events" fill="#10b981" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
