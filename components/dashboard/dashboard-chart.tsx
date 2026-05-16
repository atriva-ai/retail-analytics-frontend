"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChartTooltip } from "@/components/ui/chart"

interface HourlyPoint {
  time: string
  visitors: number
}

interface DashboardChartProps {
  data: HourlyPoint[]
}

export default function DashboardChart({ data }: DashboardChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" />
        <YAxis allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="visitors"
          stroke="#0ea5e9"
          fill="#0ea5e9"
          fillOpacity={0.4}
          name="Visitors"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
