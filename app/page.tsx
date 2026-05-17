"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ChartWrapper } from "@/components/ui/chart"
import { DashboardChart, ZoneEngagement } from "@/components/dashboard"
import { CameraStatusTable } from "@/components/cameras"
import { apiClient } from "@/lib/api"
import { Clock, Users, UserCheck, TrendingUp, RefreshCw, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsEventSummary {
  camera_id: number
  analytics_id: number
  analytics_type: string
  total_in: number
  total_out: number
  current_zone_count: number
  event_count: number
  last_event_at: string | null
}

interface AnalyticsEvent {
  id: number
  camera_id: number
  analytics_id: number
  event_type: string
  value: Record<string, any> | null
  created_at: string
}

interface AnalyticsEngine {
  id: number
  name: string
  type: string
}

interface Camera {
  id: number
  name: string
}

type TimeFilter = "today" | "week" | "month"

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTimeRange(filter: TimeFilter): { start: Date; end: Date } {
  const end = new Date()
  const start = new Date()
  if (filter === "today")  start.setHours(0, 0, 0, 0)
  if (filter === "week")   start.setDate(start.getDate() - 7)
  if (filter === "month")  start.setDate(start.getDate() - 30)
  return { start, end }
}

function formatDwell(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatHour(isoString: string): string {
  const h = new Date(isoString).getHours()
  if (h === 0)  return "12AM"
  if (h < 12)   return `${h}AM`
  if (h === 12) return "12PM"
  return `${h - 12}PM`
}

const LINE_TYPES = new Set(["line_cross_count", "entrance"])
const ZONE_TYPES = new Set(["people_counting_by_zone", "dwell_time_by_zone"])

const ALERT_LABELS: Record<string, string> = {
  dwell_alert:            "Loitering",
  zone_enter:             "Zone Entry",
  line_cross_in:          "Entry",
  line_cross_out:         "Exit",
  people_count_snapshot:  "Headcount",
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today")
  const [summaries, setSummaries]   = useState<AnalyticsEventSummary[]>([])
  const [crossEvents, setCrossEvents] = useState<AnalyticsEvent[]>([])
  const [alertEvents, setAlertEvents] = useState<AnalyticsEvent[]>([])
  const [analyticsMap, setAnalyticsMap] = useState<Record<number, AnalyticsEngine>>({})
  const [cameraMap, setCameraMap]       = useState<Record<number, Camera>>({})
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else       setLoading(true)

    const { start, end } = getTimeRange(timeFilter)
    const base = new URLSearchParams({
      start_time: start.toISOString(),
      end_time:   end.toISOString(),
    })

    try {
      const [sums, crosses, alerts, anals, cams] = await Promise.all([
        apiClient.get<AnalyticsEventSummary[]>(`/api/v1/analytics-events/summary?${base}`),
        apiClient.get<AnalyticsEvent[]>(
          `/api/v1/analytics-events/?event_type=line_cross_in&limit=500&${base}`
        ),
        apiClient.get<AnalyticsEvent[]>(
          `/api/v1/analytics-events/?event_type=dwell_alert&limit=10&${base}`
        ),
        apiClient.get<AnalyticsEngine[]>("/api/v1/analytics/"),
        apiClient.get<Camera[]>("/api/v1/cameras/"),
      ])

      setSummaries(sums || [])
      setCrossEvents(crosses || [])
      setAlertEvents(alerts || [])
      setAnalyticsMap(Object.fromEntries((anals || []).map(a => [a.id, a])))
      setCameraMap(Object.fromEntries((cams || []).map(c => [c.id, c])))
    } catch (err) {
      console.error("Dashboard fetch error", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [timeFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived KPIs ──────────────────────────────────────────────────────────

  const totalVisitors = useMemo(
    () => summaries.filter(s => LINE_TYPES.has(s.analytics_type)).reduce((n, s) => n + s.total_in, 0),
    [summaries]
  )

  const currentOccupancy = useMemo(
    () => summaries.filter(s => ZONE_TYPES.has(s.analytics_type)).reduce((n, s) => n + s.current_zone_count, 0),
    [summaries]
  )

  const avgDwellSec = useMemo(() => {
    const dwells = alertEvents.map(e => e.value?.dwell_s).filter((v): v is number => typeof v === "number")
    return dwells.length ? dwells.reduce((a, b) => a + b, 0) / dwells.length : null
  }, [alertEvents])

  const peakHour = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of crossEvents) {
      const label = formatHour(e.created_at)
      counts[label] = (counts[label] || 0) + 1
    }
    const entries = Object.entries(counts)
    if (!entries.length) return null
    return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))
  }, [crossEvents])

  // ── Chart data ────────────────────────────────────────────────────────────

  const hourlyChartData = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const e of crossEvents) {
      const h = new Date(e.created_at).getHours()
      counts[h] = (counts[h] || 0) + 1
    }
    return Array.from({ length: 24 }, (_, h) => ({
      time: formatHour(`2000-01-01T${String(h).padStart(2, "0")}:00:00`),
      visitors: counts[h] || 0,
    })).filter((_, h) => {
      const now = new Date().getHours()
      return timeFilter !== "today" || h <= now
    })
  }, [crossEvents, timeFilter])

  const zoneChartData = useMemo(() =>
    summaries
      .filter(s => s.event_count > 0)
      .map(s => ({
        zone: analyticsMap[s.analytics_id]?.name ?? `Analytics ${s.analytics_id}`,
        events: s.event_count,
      }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 8),
    [summaries, analyticsMap]
  )

  // ── Render ────────────────────────────────────────────────────────────────

  const hasData = summaries.length > 0 || crossEvents.length > 0

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center gap-2">
          <Tabs value={timeFilter} onValueChange={v => setTimeFilter(v as TimeFilter)}>
            <TabsList className="grid grid-cols-3 w-[240px]">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-2 rounded-md hover:bg-muted text-muted-foreground"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Occupancy</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">
                {hasData ? currentOccupancy : "—"}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">People in tracked zones</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Visitors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">
                {hasData ? totalVisitors.toLocaleString() : "—"}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Line crossings (entrance analytics)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Dwell Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">
                {avgDwellSec != null ? formatDwell(avgDwellSec) : "—"}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {avgDwellSec != null ? "Average across dwell alerts" : "No dwell alerts yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Peak Hour</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">{peakHour?.[0] ?? "—"}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {peakHour ? `${peakHour[1]} entries` : "No entry data yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Visitors Over Time</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {loading ? (
              <div className="h-[300px] flex items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : hourlyChartData.some(d => d.visitors > 0) ? (
              <ChartWrapper className="h-[300px]" title="Visitors Over Time">
                <DashboardChart data={hourlyChartData} />
              </ChartWrapper>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                No entry events yet — configure an Entrance analytics engine in Settings.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analytics Activity by Engine</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {loading ? (
              <div className="h-[300px] flex items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : zoneChartData.length > 0 ? (
              <ChartWrapper className="h-[300px]" title="Analytics Activity">
                <ZoneEngagement data={zoneChartData} />
              </ChartWrapper>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                No analytics activity yet — configure analytics engines in Settings.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Camera status */}
      <Card>
        <CardHeader>
          <CardTitle>Camera Status</CardTitle>
        </CardHeader>
        <CardContent>
          <CameraStatusTable />
        </CardContent>
      </Card>

      {/* Recent alerts — real dwell_alert events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-16 flex items-center justify-center">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : alertEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No alerts triggered yet. Configure loitering or dwell-time analytics in Settings.
            </p>
          ) : (
            <div className="space-y-2">
              {alertEvents.map(event => {
                const cam  = cameraMap[event.camera_id]
                const anal = analyticsMap[event.analytics_id]
                const dwell = event.value?.dwell_s
                const time  = new Date(event.created_at).toLocaleTimeString([], {
                  hour: "2-digit", minute: "2-digit",
                })
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg border bg-card"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {ALERT_LABELS[event.event_type] ?? event.event_type}
                        </span>
                        {anal && (
                          <Badge variant="outline" className="text-xs">
                            {anal.name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cam?.name ?? `Camera ${event.camera_id}`}
                        {dwell != null && ` · ${formatDwell(dwell)} in zone`}
                        {" · "}{time}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
