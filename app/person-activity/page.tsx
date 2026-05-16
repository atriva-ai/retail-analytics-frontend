"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Pagination, PaginationContent, PaginationEllipsis,
  PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination"
import {
  ArrowUpDown, ArrowUp, ArrowDown, Download, RefreshCw,
  ArrowRight, ArrowLeft, MapPin, Users,
} from "lucide-react"
import { apiClient } from "@/lib/api"
import { Camera } from "@/types"
import { cn } from "@/lib/utils"
import EntranceExitCounts from "@/components/person-activity/entrance-exit-counts"

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsEngine {
  id: number
  name: string
  type: string
  is_active: boolean
}

interface AnalyticsEvent {
  id: number
  camera_id: number
  analytics_id: number
  event_type: string
  value: Record<string, any> | null
  created_at: string
}

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

// ── Formatting helpers ────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  line_cross_in: "Enter",
  line_cross_out: "Exit",
  zone_enter: "Zone Enter",
  zone_exit: "Zone Exit",
  dwell_alert: "Dwell Alert",
  people_count_snapshot: "Headcount",
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"
const EVENT_BADGE: Record<string, BadgeVariant> = {
  line_cross_in: "default",
  line_cross_out: "secondary",
  zone_enter: "default",
  zone_exit: "secondary",
  dwell_alert: "destructive",
  people_count_snapshot: "outline",
}

function formatValue(event_type: string, value: Record<string, any> | null): string {
  if (!value) return "—"
  switch (event_type) {
    case "line_cross_in":          return `Total in: ${value.count_in ?? "—"}`
    case "line_cross_out":         return `Total out: ${value.count_out ?? "—"}`
    case "zone_enter":             return `${value.zone_count ?? "—"} in zone`
    case "zone_exit":              return `${value.zone_count ?? "—"} in zone`
    case "dwell_alert":            return `${value.dwell_s ?? "—"}s dwell`
    case "people_count_snapshot":  return `Count: ${value.count ?? "—"}`
    default:                       return JSON.stringify(value)
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

// ── Page ──────────────────────────────────────────────────────────────────────

type SortField = "created_at" | "event_type" | "camera_id"
type SortDir = "asc" | "desc" | null

const ITEMS_PER_PAGE = 20

export default function PersonActivityPage() {
  const [cameras, setCameras]       = useState<Camera[]>([])
  const [analytics, setAnalytics]   = useState<AnalyticsEngine[]>([])
  const [events, setEvents]         = useState<AnalyticsEvent[]>([])
  const [summaries, setSummaries]   = useState<AnalyticsEventSummary[]>([])
  const [selectedCamera, setSelectedCamera] = useState("all")
  const [selectedHour, setSelectedHour]     = useState("all")
  const [sortField, setSortField]   = useState<SortField | null>("created_at")
  const [sortDir, setSortDir]       = useState<SortDir>("desc")
  const [currentPage, setCurrentPage] = useState(1)
  const [loadingStatic, setLoadingStatic]   = useState(true)
  const [loadingEvents, setLoadingEvents]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Time range ─────────────────────────────────────────────────────────────

  const timeRange = useMemo(() => {
    const now   = new Date()
    const start = new Date(now)
    if (selectedHour === "all") {
      start.setHours(0, 0, 0, 0)
      return { start, end: now }
    }
    start.setHours(parseInt(selectedHour), 0, 0, 0)
    const end = new Date(start)
    end.setHours(start.getHours() + 1)
    return { start, end }
  }, [selectedHour])

  // ── Static fetch (cameras + analytics) ────────────────────────────────────

  useEffect(() => {
    Promise.all([
      apiClient.get<Camera[]>("/api/v1/cameras/"),
      apiClient.get<AnalyticsEngine[]>("/api/v1/analytics/"),
    ]).then(([cams, anals]) => {
      setCameras(cams || [])
      setAnalytics(anals || [])
    }).catch(console.error).finally(() => setLoadingStatic(false))
  }, [])

  // ── Events + summary fetch (filter-dependent) ──────────────────────────────

  const fetchEvents = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoadingEvents(true)

    try {
      const base = new URLSearchParams({
        start_time: timeRange.start.toISOString(),
        end_time:   timeRange.end.toISOString(),
      })
      if (selectedCamera !== "all") base.set("camera_id", selectedCamera)

      const eventsParams  = new URLSearchParams(base)
      eventsParams.set("limit", "500")

      const [evts, sums] = await Promise.all([
        apiClient.get<AnalyticsEvent[]>(`/api/v1/analytics-events/?${eventsParams}`),
        apiClient.get<AnalyticsEventSummary[]>(`/api/v1/analytics-events/summary?${base}`),
      ])
      setEvents(evts || [])
      setSummaries(sums || [])
    } catch (err) {
      console.error("Failed to load analytics events", err)
    } finally {
      setLoadingEvents(false)
      setRefreshing(false)
    }
  }, [selectedCamera, timeRange])

  useEffect(() => {
    setCurrentPage(1)
    fetchEvents()
  }, [fetchEvents])

  // ── Derived maps ───────────────────────────────────────────────────────────

  const cameraMap   = useMemo(() => Object.fromEntries(cameras.map(c => [c.id, c])), [cameras])
  const analyticsMap = useMemo(() => Object.fromEntries(analytics.map(a => [a.id, a])), [analytics])

  // ── Sorted + paginated events ──────────────────────────────────────────────

  const sortedEvents = useMemo(() => {
    if (!sortField || !sortDir) return events
    return [...events].sort((a, b) => {
      let av: any = a[sortField]
      let bv: any = b[sortField]
      if (sortField === "created_at") { av = new Date(av).getTime(); bv = new Date(bv).getTime() }
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
  }, [events, sortField, sortDir])

  const totalPages     = Math.ceil(sortedEvents.length / ITEMS_PER_PAGE)
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return sortedEvents.slice(start, start + ITEMS_PER_PAGE)
  }, [sortedEvents, currentPage])

  // ── Sort handler ───────────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === "asc")       setSortDir("desc")
      else if (sortDir === "desc") { setSortField(null); setSortDir(null) }
      else                         setSortDir("asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
    setCurrentPage(1)
  }

  const sortIcon = (field: SortField) => {
    if (sortField !== field)     return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
    if (sortDir === "asc")       return <ArrowUp   className="ml-2 h-4 w-4" />
    if (sortDir === "desc")      return <ArrowDown className="ml-2 h-4 w-4" />
    return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
  }

  // ── CSV export ─────────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    const headers = ["Time", "Camera", "Analytics", "Event", "Value"]
    const rows = sortedEvents.map(e => [
      new Date(e.created_at).toISOString(),
      cameraMap[e.camera_id]?.name   ?? e.camera_id,
      analyticsMap[e.analytics_id]?.name ?? e.analytics_id,
      EVENT_LABELS[e.event_type]     ?? e.event_type,
      formatValue(e.event_type, e.value),
    ])
    const csv  = [headers, ...rows].map(r => r.join(",")).join("\n")
    const link = document.createElement("a")
    link.href  = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    link.download = `analytics-events-${new Date().toISOString().split("T")[0]}.csv`
    link.style.display = "none"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Pagination pages ───────────────────────────────────────────────────────

  const paginationPages = (): (number | string)[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | string)[] = [1]
    if (currentPage <= 3) {
      for (let i = 2; i <= 5; i++) pages.push(i)
      pages.push("ellipsis", totalPages)
    } else if (currentPage >= totalPages - 2) {
      pages.push("ellipsis")
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push("ellipsis")
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i)
      pages.push("ellipsis", totalPages)
    }
    return pages
  }

  const hourlyOptions = useMemo(
    () => Array.from({ length: 24 }, (_, i) => {
      const h = i.toString().padStart(2, "0")
      return { value: h, label: `${h}:00` }
    }),
    []
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Retail Analytics Overview</h2>
          <p className="text-muted-foreground">
            Live and historical analytics events from configured engines
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchEvents(true)} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Entrance / Exit Counts */}
      <EntranceExitCounts />

      {/* Per-analytics summary cards */}
      {!loadingStatic && summaries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map(s => {
            const cam  = cameraMap[s.camera_id]
            const anal = analyticsMap[s.analytics_id]
            const isLine = s.analytics_type === "line_cross_count" || s.analytics_type === "entrance"
            const isZone = s.analytics_type === "people_counting_by_zone" || s.analytics_type === "dwell_time_by_zone"
            return (
              <Card key={`${s.camera_id}-${s.analytics_id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium truncate">
                    {anal?.name ?? s.analytics_type}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {cam?.name ?? `Camera ${s.camera_id}`}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    {isLine && (
                      <>
                        <div className="flex items-center gap-1">
                          <ArrowRight className="h-4 w-4 text-green-600" />
                          <span className="text-xl font-bold">{s.total_in}</span>
                          <span className="text-xs text-muted-foreground">in</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ArrowLeft className="h-4 w-4 text-red-600" />
                          <span className="text-xl font-bold">{s.total_out}</span>
                          <span className="text-xs text-muted-foreground">out</span>
                        </div>
                      </>
                    )}
                    {isZone && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-blue-600" />
                        <span className="text-xl font-bold">{s.current_zone_count}</span>
                        <span className="text-xs text-muted-foreground">in zone now</span>
                      </div>
                    )}
                    {s.analytics_type === "people_counting" && (
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-purple-600" />
                        <span className="text-xl font-bold">{s.event_count}</span>
                        <span className="text-xs text-muted-foreground">snapshots</span>
                      </div>
                    )}
                  </div>
                  {s.last_event_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Last event at {formatTime(s.last_event_at)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-1/3">
              <label className="text-sm font-medium mb-2 block">Camera</label>
              <Select value={selectedCamera} onValueChange={v => { setSelectedCamera(v); setCurrentPage(1) }}>
                <SelectTrigger><SelectValue placeholder="Select Camera" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cameras</SelectItem>
                  {cameras.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}{c.location ? ` (${c.location})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-1/3">
              <label className="text-sm font-medium mb-2 block">Time Range (Today – Hourly)</label>
              <Select value={selectedHour} onValueChange={v => { setSelectedHour(v); setCurrentPage(1) }}>
                <SelectTrigger><SelectValue placeholder="Select Hour" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Day</SelectItem>
                  {hourlyOptions.map(h => (
                    <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-1/3">
              <Button onClick={handleExportCSV} variant="outline" className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events table */}
      <Card>
        <CardHeader><CardTitle>Analytics Events</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("created_at")}
                  >
                    <div className="flex items-center">Time {sortIcon("created_at")}</div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("camera_id")}
                  >
                    <div className="flex items-center">Camera {sortIcon("camera_id")}</div>
                  </TableHead>
                  <TableHead>Analytics</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("event_type")}
                  >
                    <div className="flex items-center">Event {sortIcon("event_type")}</div>
                  </TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingEvents ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : paginatedEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      No analytics events for the selected filters.
                      {analytics.length === 0 && " Configure an analytics engine in Settings first."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedEvents.map(event => (
                    <TableRow key={event.id}>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {formatTime(event.created_at)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {cameraMap[event.camera_id]?.name ?? `Camera ${event.camera_id}`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {analyticsMap[event.analytics_id]?.name ?? `Analytics ${event.analytics_id}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={EVENT_BADGE[event.event_type] ?? "outline"}>
                          {EVENT_LABELS[event.event_type] ?? event.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatValue(event.event_type, event.value)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={e => { e.preventDefault(); if (currentPage > 1) setCurrentPage(p => p - 1) }}
                      className={cn(currentPage === 1 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                  {paginationPages().map((page, idx) =>
                    page === "ellipsis" ? (
                      <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                    ) : (
                      <PaginationItem key={page}>
                        <PaginationLink
                          href="#"
                          onClick={e => { e.preventDefault(); setCurrentPage(page as number) }}
                          isActive={currentPage === page}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={e => { e.preventDefault(); if (currentPage < totalPages) setCurrentPage(p => p + 1) }}
                      className={cn(currentPage === totalPages && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}

          <div className="mt-4 text-sm text-muted-foreground">
            Showing{" "}
            {paginatedEvents.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}–
            {Math.min(currentPage * ITEMS_PER_PAGE, sortedEvents.length)} of {sortedEvents.length} events
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
