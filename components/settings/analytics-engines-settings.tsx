"use client"

import { useState, useEffect, useCallback } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Brain, Trash, RefreshCw, Users, Clock, UserCheck,
  TrendingUp, MapPin, Activity, ArrowRight, ArrowLeft,
  ArrowUpDown, Plus, X,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { apiClient } from "@/lib/api"
import LineDrawingCanvas from "@/components/ui/line-drawing-canvas"
import ZoneDrawingCanvas from "@/components/ui/zone-drawing-canvas"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Camera {
  id: number
  name: string
  location: string | null
  is_active: boolean
}

interface AnalyticsEngine {
  id: number
  name: string
  type: string
  config: any
  is_active: boolean
  cameras?: Camera[]
}

interface LineCoordinate {
  x1: number; y1: number; x2: number; y2: number
}

interface ZoneCoordinate {
  type: "rectangle" | "pentagon" | "hexagon"
  points: Array<{ x: number; y: number }>
}

interface AnalyticsTypeConfig {
  value: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  requiresZone: boolean
  requiresLine: boolean
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  people_counting: Users,
  dwell_time: Clock,
  demographic: UserCheck,
  people_counting_by_zone: MapPin,
  dwell_time_by_zone: Clock,
  line_cross_count: TrendingUp,
  demographic_on_line_crossing: UserCheck,
  entrance: Activity,
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsEnginesSettings() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [analyticsEngines, setAnalyticsEngines] = useState<AnalyticsEngine[]>([])
  const [analyticsTypes, setAnalyticsTypes] = useState<AnalyticsTypeConfig[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Add-analytics flow state
  const [addingType, setAddingType] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [lineCoords, setLineCoords] = useState<LineCoordinate | null>(null)
  const [entranceSidePoint, setEntranceSidePoint] = useState<{ x: number; y: number } | null>(null)
  const [zoneCoords, setZoneCoords] = useState<ZoneCoordinate | null>(null)
  const [entranceDirection, setEntranceDirection] = useState<"in" | "out" | "both">("both")
  const [showCanvas, setShowCanvas] = useState(false)
  const [saving, setSaving] = useState(false)

  const { toast } = useToast()

  // Derived
  const selectedCamera = cameras.find(c => c.id === selectedCameraId) ?? null
  const cameraAnalytics = analyticsEngines.filter(
    e => e.cameras?.some(c => c.id === selectedCameraId)
  )
  const addingTypeConfig = analyticsTypes.find(t => t.value === addingType) ?? null

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const fetchAll = useCallback(async (preserveSelection = true) => {
    try {
      if (!preserveSelection) setLoading(true)

      const [camsRes, enginesRes, typesRes] = await Promise.all([
        apiClient.get<Camera[]>("/api/v1/cameras/"),
        apiClient.get<AnalyticsEngine[]>("/api/v1/analytics/"),
        apiClient.get<Record<string, any>>("/api/v1/analytics/types"),
      ])

      const cams = camsRes || []
      setCameras(cams)
      setAnalyticsEngines(enginesRes || [])

      const types: AnalyticsTypeConfig[] = Object.values(typesRes || {}).map((t: any) => ({
        value: t.type,
        label: t.name,
        description: t.description,
        icon: TYPE_ICONS[t.type] || Brain,
        requiresZone: t.requires_zone || false,
        requiresLine: t.requires_line || false,
      }))
      setAnalyticsTypes(types)

      // Auto-select first camera on initial load
      setSelectedCameraId(prev => (prev === null && cams.length > 0 ? cams[0].id : prev))
    } catch {
      toast({ title: "Error", description: "Failed to load analytics data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchAll(false) }, [fetchAll])

  // ─── Add-analytics flow ────────────────────────────────────────────────────

  const resetAddFlow = () => {
    setAddingType(null)
    setNewName("")
    setLineCoords(null)
    setEntranceSidePoint(null)
    setZoneCoords(null)
    setEntranceDirection("both")
    setShowCanvas(false)
  }

  const handleSelectType = (typeValue: string) => {
    const cfg = analyticsTypes.find(t => t.value === typeValue)
    if (!cfg) return
    setAddingType(typeValue)
    setNewName(`${selectedCamera?.name ?? "Camera"} — ${cfg.label}`)
    setLineCoords(null)
    setZoneCoords(null)
    setEntranceSidePoint(null)
    setEntranceDirection("both")
    setShowCanvas(cfg.requiresLine || cfg.requiresZone)
  }

  const handleSave = async () => {
    if (!selectedCameraId || !addingType || !newName.trim()) return
    if (addingTypeConfig?.requiresLine && !lineCoords) {
      toast({ title: "Required", description: "Draw a line on the camera first", variant: "destructive" })
      return
    }
    if (addingTypeConfig?.requiresZone && !zoneCoords) {
      toast({ title: "Required", description: "Draw a zone on the camera first", variant: "destructive" })
      return
    }

    try {
      setSaving(true)

      const config: any = {}
      if (lineCoords) config.line = lineCoords
      if (entranceSidePoint) config.entrance_side = entranceSidePoint
      if (zoneCoords) config.zone = zoneCoords
      if (addingType === "entrance") config.direction = entranceDirection

      const engine = await apiClient.post<AnalyticsEngine>("/api/v1/analytics/", {
        name: newName.trim(),
        type: addingType,
        config,
        is_active: true,
      })

      if (engine) {
        await apiClient.post("/api/v1/analytics/camera", {
          camera_id: selectedCameraId,
          analytics_id: engine.id,
        })

        if (addingType === "entrance" && lineCoords) {
          try {
            await apiClient.put(`/api/v1/entrance-exit/config/${selectedCameraId}`, {
              enabled: true,
              line: lineCoords,
              direction: entranceDirection,
              ...(entranceSidePoint ? { entrance_side: entranceSidePoint } : {}),
            })
          } catch {}
        }

        const cam = cameras.find(c => c.id === selectedCameraId)
        setAnalyticsEngines(prev => [...prev, { ...engine, cameras: cam ? [cam] : [] }])
        toast({ title: "Saved", description: `${newName.trim()} added` })
        resetAddFlow()
      }
    } catch {
      toast({ title: "Error", description: "Failed to save analytics", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (engine: AnalyticsEngine) => {
    try {
      await apiClient.put(`/api/v1/analytics/${engine.id}`, { ...engine, is_active: !engine.is_active })
      setAnalyticsEngines(prev =>
        prev.map(e => e.id === engine.id ? { ...e, is_active: !e.is_active } : e)
      )
    } catch {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" })
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/api/v1/analytics/${id}`)
      setAnalyticsEngines(prev => prev.filter(e => e.id !== id))
      toast({ title: "Removed", description: "Analytics engine deleted" })
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" })
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-6 min-h-[500px]">

      {/* ── Left: camera list ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 mb-2">
          Cameras
        </p>
        {cameras.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">No cameras configured</p>
        ) : (
          cameras.map(camera => {
            const total = analyticsEngines.filter(e => e.cameras?.some(c => c.id === camera.id)).length
            const active = analyticsEngines.filter(e => e.cameras?.some(c => c.id === camera.id) && e.is_active).length
            const isSelected = selectedCameraId === camera.id
            return (
              <button
                key={camera.id}
                onClick={() => { setSelectedCameraId(camera.id); resetAddFlow() }}
                className={cn(
                  "w-full text-left px-3 py-3 rounded-lg border text-sm transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:bg-accent border-border"
                )}
              >
                <div className="font-medium">{camera.name}</div>
                <div className={cn("text-xs mt-0.5", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {camera.location || "No location"}
                </div>
                {total > 0 && (
                  <div className={cn("text-xs mt-1", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {active} active · {total} total
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* ── Right: analytics panel ────────────────────────────────────────── */}
      <div className="col-span-2">
        {!selectedCamera ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Select a camera to configure analytics</p>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{selectedCamera.name}</h3>
              <Button variant="ghost" size="sm" onClick={() => fetchAll()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Configured analytics */}
            {cameraAnalytics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No analytics configured for this camera.</p>
            ) : (
              <div className="space-y-1.5">
                {cameraAnalytics.map(engine => {
                  const Icon = TYPE_ICONS[engine.type] || Brain
                  const typeLabel = analyticsTypes.find(t => t.value === engine.type)?.label || engine.type
                  return (
                    <div
                      key={engine.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{engine.name}</p>
                          <p className="text-xs text-muted-foreground">{typeLabel}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Switch
                          checked={engine.is_active}
                          onCheckedChange={() => handleToggle(engine)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(engine.id)}
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="border-t" />

            {/* Add analytics */}
            {!addingType ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Add Analytics
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {analyticsTypes.map(type => {
                    const Icon = type.icon
                    return (
                      <button
                        key={type.value}
                        onClick={() => handleSelectType(type.value)}
                        className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border bg-card hover:bg-accent text-left text-sm transition-colors"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-xs leading-snug">{type.label}</p>
                          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                            {type.description}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">

                {/* Flow header */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Configure: {addingTypeConfig?.label || addingType}
                  </p>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetAddFlow}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Name */}
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Analytics engine name"
                    className="mt-1"
                  />
                </div>

                {/* Entrance direction */}
                {addingType === "entrance" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Count direction</Label>
                    <div className="flex gap-2">
                      {(["in", "out", "both"] as const).map(dir => (
                        <Button
                          key={dir}
                          type="button"
                          variant={entranceDirection === dir ? "default" : "outline"}
                          size="sm"
                          onClick={() => setEntranceDirection(dir)}
                        >
                          {dir === "in"  ? <><ArrowRight className="h-3 w-3 mr-1" />Enter</> :
                           dir === "out" ? <><ArrowLeft  className="h-3 w-3 mr-1" />Exit</>  :
                                           <><ArrowUpDown className="h-3 w-3 mr-1" />Both</>}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Line drawing */}
                {addingTypeConfig?.requiresLine && (
                  lineCoords ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-xs text-blue-700">
                        Line set: ({lineCoords.x1.toFixed(1)}, {lineCoords.y1.toFixed(1)}) →
                        ({lineCoords.x2.toFixed(1)}, {lineCoords.y2.toFixed(1)})
                        {entranceSidePoint && " · entrance side marked"}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-blue-700 h-6 px-2"
                        onClick={() => { setLineCoords(null); setShowCanvas(true) }}
                      >
                        Redraw
                      </Button>
                    </div>
                  ) : showCanvas ? (
                    <div className="rounded-lg border overflow-hidden">
                      <LineDrawingCanvas
                        cameraId={selectedCameraId!}
                        onLineComplete={(coords, sidePoint) => {
                          setLineCoords(coords)
                          setEntranceSidePoint(sidePoint ?? null)
                          setShowCanvas(false)
                        }}
                        onCancel={() => { setShowCanvas(false); resetAddFlow() }}
                        requireEntranceSide={addingType === "entrance"}
                      />
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setShowCanvas(true)}>
                      Draw line on camera
                    </Button>
                  )
                )}

                {/* Zone drawing */}
                {addingTypeConfig?.requiresZone && (
                  zoneCoords ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                      <p className="text-xs text-green-700">
                        Zone set: {zoneCoords.type}, {zoneCoords.points.length} points
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-green-700 h-6 px-2"
                        onClick={() => { setZoneCoords(null); setShowCanvas(true) }}
                      >
                        Redraw
                      </Button>
                    </div>
                  ) : showCanvas ? (
                    <div className="rounded-lg border overflow-hidden">
                      <ZoneDrawingCanvas
                        cameraId={selectedCameraId!}
                        onZoneComplete={coords => {
                          setZoneCoords(coords)
                          setShowCanvas(false)
                        }}
                        onCancel={() => { setShowCanvas(false); resetAddFlow() }}
                      />
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setShowCanvas(true)}>
                      Draw zone on camera
                    </Button>
                  )
                )}

                {/* Save */}
                <Button
                  onClick={handleSave}
                  disabled={
                    saving ||
                    !newName.trim() ||
                    (addingTypeConfig?.requiresLine === true && !lineCoords) ||
                    (addingTypeConfig?.requiresZone === true && !zoneCoords)
                  }
                  className="w-full"
                >
                  {saving
                    ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    : <Plus className="h-4 w-4 mr-2" />}
                  Save Analytics
                </Button>

              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
