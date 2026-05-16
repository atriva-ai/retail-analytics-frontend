"use client"

import { useState, useEffect, useCallback } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Bell, Clock, Users, Shield, TrendingUp, List,
  Trash, RefreshCw, Plus, X, AlertTriangle,
  ArrowRight, ArrowLeft, ArrowUpDown,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { apiClient } from "@/lib/api"
import LineDrawingCanvas from "@/components/ui/line-drawing-canvas"
import ZoneDrawingCanvas from "@/components/ui/zone-drawing-canvas"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Camera {
  id: number
  name: string
  location: string | null
  is_active: boolean
}

interface AlertEngine {
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

interface AlertTypeConfig {
  value: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  requiresZone: boolean
  requiresLine: boolean
}

// ── Alert types covering retail store use cases ───────────────────────────────

const ALERT_TYPES: AlertTypeConfig[] = [
  {
    value: "loitering",
    label: "Loitering",
    description: "Alert when someone stays in a zone longer than a set time",
    icon: Clock,
    requiresZone: true,
    requiresLine: false,
  },
  {
    value: "overcrowding",
    label: "Overcrowding",
    description: "Alert when too many people are in a zone at once",
    icon: Users,
    requiresZone: true,
    requiresLine: false,
  },
  {
    value: "restricted_area",
    label: "Restricted Area",
    description: "Alert when anyone enters a staff-only or restricted zone",
    icon: Shield,
    requiresZone: true,
    requiresLine: false,
  },
  {
    value: "queue_length",
    label: "Queue Alert",
    description: "Alert when the checkout queue exceeds a set length",
    icon: List,
    requiresZone: false,
    requiresLine: true,
  },
  {
    value: "human_detection",
    label: "Human Detection",
    description: "Alert whenever any person appears in the camera view",
    icon: Bell,
    requiresZone: false,
    requiresLine: false,
  },
  {
    value: "line_crossing",
    label: "Line Crossing",
    description: "Alert when someone crosses a virtual line in a set direction",
    icon: TrendingUp,
    requiresZone: false,
    requiresLine: true,
  },
]

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = Object.fromEntries(
  ALERT_TYPES.map(t => [t.value, t.icon])
)

// ── Main component ────────────────────────────────────────────────────────────

export default function AlertEnginesSettings() {
  const [cameras, setCameras]           = useState<Camera[]>([])
  const [alertEngines, setAlertEngines] = useState<AlertEngine[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null)
  const [loading, setLoading]           = useState(true)

  // Add-alert flow state
  const [addingType, setAddingType]         = useState<string | null>(null)
  const [newName, setNewName]               = useState("")
  const [lineCoords, setLineCoords]         = useState<LineCoordinate | null>(null)
  const [zoneCoords, setZoneCoords]         = useState<ZoneCoordinate | null>(null)
  const [showCanvas, setShowCanvas]         = useState(false)
  const [saving, setSaving]                 = useState(false)

  // Threshold params per type
  const [minDwellTime, setMinDwellTime]   = useState(30)     // loitering: seconds
  const [maxOccupancy, setMaxOccupancy]   = useState(10)     // overcrowding: count
  const [maxQueue, setMaxQueue]           = useState(5)      // queue_length: count
  const [lineDirection, setLineDirection] = useState<"in" | "out" | "both">("both")

  const { toast } = useToast()

  const selectedCamera  = cameras.find(c => c.id === selectedCameraId) ?? null
  const cameraAlerts    = alertEngines.filter(e => e.cameras?.some(c => c.id === selectedCameraId))
  const addingTypeCfg   = ALERT_TYPES.find(t => t.value === addingType) ?? null

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async (preserveSelection = true) => {
    try {
      if (!preserveSelection) setLoading(true)

      const [camsRes, enginesRes] = await Promise.all([
        apiClient.get<Camera[]>("/api/v1/cameras/"),
        apiClient.get<AlertEngine[]>("/api/v1/alert-engines/"),
      ])

      const cams = camsRes || []
      setCameras(cams)
      setAlertEngines(enginesRes || [])
      setSelectedCameraId(prev => (prev === null && cams.length > 0 ? cams[0].id : prev))
    } catch {
      toast({ title: "Error", description: "Failed to load alert data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchAll(false) }, [fetchAll])

  // ── Add-alert flow ────────────────────────────────────────────────────────

  const resetAddFlow = () => {
    setAddingType(null)
    setNewName("")
    setLineCoords(null)
    setZoneCoords(null)
    setShowCanvas(false)
    setMinDwellTime(30)
    setMaxOccupancy(10)
    setMaxQueue(5)
    setLineDirection("both")
  }

  const handleSelectType = (typeValue: string) => {
    const cfg = ALERT_TYPES.find(t => t.value === typeValue)
    if (!cfg) return
    setAddingType(typeValue)
    setNewName(`${selectedCamera?.name ?? "Camera"} — ${cfg.label}`)
    setLineCoords(null)
    setZoneCoords(null)
    setShowCanvas(cfg.requiresLine || cfg.requiresZone)
  }

  const buildConfig = (): Record<string, any> => {
    const cfg: Record<string, any> = {}
    if (lineCoords)  cfg.line      = lineCoords
    if (zoneCoords)  cfg.zone      = zoneCoords
    if (addingType === "loitering")     cfg.min_dwell_time = minDwellTime
    if (addingType === "overcrowding")  cfg.max_occupancy  = maxOccupancy
    if (addingType === "queue_length")  cfg.max_queue      = maxQueue
    if (addingType === "line_crossing") cfg.direction      = lineDirection
    return cfg
  }

  const handleSave = async () => {
    if (!selectedCameraId || !addingType || !newName.trim()) return
    if (addingTypeCfg?.requiresLine && !lineCoords) {
      toast({ title: "Required", description: "Draw a line on the camera first", variant: "destructive" })
      return
    }
    if (addingTypeCfg?.requiresZone && !zoneCoords) {
      toast({ title: "Required", description: "Draw a zone on the camera first", variant: "destructive" })
      return
    }

    try {
      setSaving(true)
      const engine = await apiClient.post<AlertEngine>("/api/v1/alert-engines/", {
        name: newName.trim(),
        type: addingType,
        config: buildConfig(),
        is_active: true,
      })

      if (engine) {
        await apiClient.post("/api/v1/alert-engines/camera", {
          camera_id: selectedCameraId,
          alert_engine_id: engine.id,
        })
        const cam = cameras.find(c => c.id === selectedCameraId)
        setAlertEngines(prev => [...prev, { ...engine, cameras: cam ? [cam] : [] }])
        toast({ title: "Saved", description: `${newName.trim()} added` })
        resetAddFlow()
      }
    } catch {
      toast({ title: "Error", description: "Failed to save alert engine", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (engine: AlertEngine) => {
    try {
      await apiClient.put(`/api/v1/alert-engines/${engine.id}`, { ...engine, is_active: !engine.is_active })
      setAlertEngines(prev => prev.map(e => e.id === engine.id ? { ...e, is_active: !e.is_active } : e))
    } catch {
      toast({ title: "Error", description: "Failed to update alert engine", variant: "destructive" })
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/api/v1/alert-engines/${id}`)
      setAlertEngines(prev => prev.filter(e => e.id !== id))
      toast({ title: "Removed", description: "Alert engine deleted" })
    } catch {
      toast({ title: "Error", description: "Failed to delete alert engine", variant: "destructive" })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

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
            const total  = alertEngines.filter(e => e.cameras?.some(c => c.id === camera.id)).length
            const active = alertEngines.filter(e => e.cameras?.some(c => c.id === camera.id) && e.is_active).length
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

      {/* ── Right: alerts panel ───────────────────────────────────────────── */}
      <div className="col-span-2">
        {!selectedCamera ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Select a camera to configure alerts</p>
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

            {/* Configured alerts */}
            {cameraAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alert engines configured for this camera.</p>
            ) : (
              <div className="space-y-1.5">
                {cameraAlerts.map(engine => {
                  const Icon     = TYPE_ICONS[engine.type] || AlertTriangle
                  const typeLabel = ALERT_TYPES.find(t => t.value === engine.type)?.label || engine.type
                  return (
                    <div
                      key={engine.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{engine.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {typeLabel}
                            {engine.config?.min_dwell_time != null && ` · >${engine.config.min_dwell_time}s`}
                            {engine.config?.max_occupancy  != null && ` · >${engine.config.max_occupancy} people`}
                            {engine.config?.max_queue      != null && ` · >${engine.config.max_queue} in queue`}
                            {engine.config?.direction      != null && ` · ${engine.config.direction}`}
                          </p>
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

            {/* Add alert */}
            {!addingType ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Add Alert
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ALERT_TYPES.map(type => {
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
                  <p className="text-sm font-medium">Configure: {addingTypeCfg?.label}</p>
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
                    placeholder="Alert engine name"
                    className="mt-1"
                  />
                </div>

                {/* Loitering threshold */}
                {addingType === "loitering" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Alert after (seconds)</Label>
                    <Input
                      type="number"
                      min={5}
                      value={minDwellTime}
                      onChange={e => setMinDwellTime(Number(e.target.value))}
                      className="mt-1 w-32"
                    />
                  </div>
                )}

                {/* Overcrowding threshold */}
                {addingType === "overcrowding" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Alert when zone exceeds (people)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={maxOccupancy}
                      onChange={e => setMaxOccupancy(Number(e.target.value))}
                      className="mt-1 w-32"
                    />
                  </div>
                )}

                {/* Queue threshold */}
                {addingType === "queue_length" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Alert when queue exceeds (people)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={maxQueue}
                      onChange={e => setMaxQueue(Number(e.target.value))}
                      className="mt-1 w-32"
                    />
                  </div>
                )}

                {/* Line crossing direction */}
                {addingType === "line_crossing" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Alert direction</Label>
                    <div className="flex gap-2">
                      {(["in", "out", "both"] as const).map(dir => (
                        <Button
                          key={dir}
                          type="button"
                          variant={lineDirection === dir ? "default" : "outline"}
                          size="sm"
                          onClick={() => setLineDirection(dir)}
                        >
                          {dir === "in"  ? <><ArrowRight  className="h-3 w-3 mr-1" />Enter</> :
                           dir === "out" ? <><ArrowLeft   className="h-3 w-3 mr-1" />Exit</>  :
                                           <><ArrowUpDown className="h-3 w-3 mr-1" />Both</>}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Line drawing */}
                {addingTypeCfg?.requiresLine && (
                  lineCoords ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-xs text-blue-700">
                        Line set: ({lineCoords.x1.toFixed(1)}, {lineCoords.y1.toFixed(1)}) →
                        ({lineCoords.x2.toFixed(1)}, {lineCoords.y2.toFixed(1)})
                      </p>
                      <Button
                        variant="ghost" size="sm"
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
                        onLineComplete={(coords) => { setLineCoords(coords); setShowCanvas(false) }}
                        onCancel={() => { setShowCanvas(false); resetAddFlow() }}
                      />
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setShowCanvas(true)}>
                      Draw line on camera
                    </Button>
                  )
                )}

                {/* Zone drawing */}
                {addingTypeCfg?.requiresZone && (
                  zoneCoords ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                      <p className="text-xs text-green-700">
                        Zone set: {zoneCoords.type}, {zoneCoords.points.length} points
                      </p>
                      <Button
                        variant="ghost" size="sm"
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
                        onZoneComplete={coords => { setZoneCoords(coords); setShowCanvas(false) }}
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
                    (addingTypeCfg?.requiresLine === true && !lineCoords) ||
                    (addingTypeCfg?.requiresZone === true && !zoneCoords)
                  }
                  className="w-full"
                >
                  {saving
                    ? <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    : <Plus className="h-4 w-4 mr-2" />}
                  Save Alert
                </Button>

              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
