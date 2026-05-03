"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { apiClient } from "@/lib/api"
import { Camera, CameraDisplay } from "@/types"
import { Wifi, WifiOff, Activity, Bell, BellOff, Eye, EyeOff, Brain, Users } from "lucide-react"
import { useWebSocket } from "@/hooks/use-websocket"

interface DetectionMsg {
  type: "detections"
  camera_id: number
  count: number
  ts: number
}

// Per-camera WebSocket tile — isolated so each camera gets its own WS connection.
function CameraTile({
  camera,
  useAiAnnotated,
  onToggleAnnotated,
}: {
  camera: CameraDisplay
  useAiAnnotated: boolean
  onToggleAnnotated: (id: number, checked: boolean) => void
}) {
  const [liveCount, setLiveCount] = useState<number | null>(null)

  const { isConnected } = useWebSocket<DetectionMsg>(
    `/ws/cameras/${camera.id}/live`,
    (msg) => setLiveCount(msg.count),
    { enabled: camera.aiDetectionEnabled },
  )

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getStatusIcon(camera.decoderStatus?.status || "unknown", camera.decoderStatus?.is_active || false)}
            <CardTitle className="text-sm font-medium">{camera.name}</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            {/* WebSocket live indicator */}
            <span
              title={isConnected ? "Live detection active" : "Connecting…"}
              className={cn(
                "h-2 w-2 rounded-full",
                isConnected ? "bg-green-500 animate-pulse" : "bg-gray-400",
              )}
            />
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                camera.status === "online" && "bg-green-500/10 text-green-500 border-green-500/20",
                camera.status === "warning" && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                camera.status === "offline" && "bg-red-500/10 text-red-500 border-red-500/20",
              )}
            >
              {camera.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* AI Detection Status */}
        <div className="flex items-center justify-between mb-2 pb-2 border-b">
          <div className="flex items-center space-x-2">
            <Brain className="h-4 w-4 text-blue-500" />
            <Label className="text-xs text-muted-foreground">AI Detection</Label>
          </div>
          <Badge
            variant={camera.aiDetectionEnabled ? "default" : "secondary"}
            className={cn(
              "text-xs",
              camera.aiDetectionEnabled && "bg-green-500/10 text-green-500 border-green-500/20",
              !camera.aiDetectionEnabled && "bg-gray-500/10 text-gray-500 border-gray-500/20",
            )}
          >
            {camera.aiDetectionEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>

        {/* AI Annotation Toggle */}
        {camera.decoderStatus?.streaming_status === "streaming" && camera.aiDetectionEnabled && (
          <div className="flex items-center justify-between mb-2 pb-2 border-b">
            <div className="flex items-center space-x-2">
              <Eye className="h-4 w-4 text-purple-500" />
              <Label htmlFor={`ai-toggle-${camera.id}`} className="text-xs text-muted-foreground cursor-pointer">
                Show Annotations
              </Label>
            </div>
            <Switch
              id={`ai-toggle-${camera.id}`}
              checked={useAiAnnotated}
              onCheckedChange={(checked) => onToggleAnnotated(camera.id, checked)}
            />
          </div>
        )}

        {/* Snapshot Image with live count overlay */}
        <div className="relative mb-4">
          {camera.snapshotUrl ? (
            <img
              src={camera.snapshotUrl}
              alt={`Snapshot from ${camera.name}`}
              className="w-full h-48 object-cover rounded-md"
              onError={(e) => { e.currentTarget.style.display = "none" }}
            />
          ) : (
            <div className="w-full h-48 bg-gray-200 rounded-md flex items-center justify-center">
              <span className="text-gray-500 text-sm">No snapshot available</span>
            </div>
          )}
          {/* Live person count badge */}
          {liveCount !== null && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-black/70 text-white text-xs flex items-center gap-1 border-0">
                <Users className="h-3 w-3" />
                {liveCount}
              </Badge>
            </div>
          )}
        </div>

        {/* Camera Information */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Location:</span>
            <span>{camera.zone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IP Address:</span>
            <span className="font-mono text-xs">{camera.ipAddress}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Analytics:</span>
            <div className="flex items-center space-x-1">
              {camera.analyticsEnabled ? (
                <Eye className="h-4 w-4 text-green-500" />
              ) : (
                <EyeOff className="h-4 w-4 text-gray-400" />
              )}
              <Badge variant={camera.analyticsEnabled ? "default" : "secondary"}>
                {camera.analyticsEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Alerts:</span>
            <div className="flex items-center space-x-1">
              {camera.alertEnabled ? (
                <Bell className="h-4 w-4 text-red-500" />
              ) : (
                <BellOff className="h-4 w-4 text-gray-400" />
              )}
              <Badge variant={camera.alertEnabled ? "default" : "secondary"}>
                {camera.alertEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
          {camera.video_info && (
            <div className="border-t pt-2 mt-2">
              <div className="text-xs text-muted-foreground mb-1">Video Info:</div>
              <div className="space-y-1 text-xs">
                <div>Resolution: {camera.video_info.info?.width || "?"}x{camera.video_info.info?.height || "?"}</div>
                <div>FPS: {camera.video_info.info?.fps || "?"}</div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Utility function to extract IP address from RTSP URL
const extractIpFromRtsp = (rtspUrl: string): string => {
  try {
    // Handle different RTSP URL formats
    // rtsp://user:pass@192.168.1.100:554/stream
    // rtsp://192.168.1.100:554/stream
    const url = new URL(rtspUrl)
    return url.hostname
  } catch (error) {
    // Fallback: try to extract IP using regex
    const ipMatch = rtspUrl.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
    return ipMatch ? ipMatch[1] : "Unknown"
  }
}

// Utility function to get status icon
const getStatusIcon = (status: string, isActive: boolean) => {
  if (status === "active" && isActive) {
    return <Wifi className="h-4 w-4 text-green-500" />
  } else if (status === "starting") {
    return <Activity className="h-4 w-4 text-yellow-500 animate-pulse" />
  } else {
    return <WifiOff className="h-4 w-4 text-red-500" />
  }
}

export default function CameraGrid() {
  const [cameras, setCameras] = useState<CameraDisplay[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [useAiAnnotated, setUseAiAnnotated] = useState<Record<number, boolean>>({})

  const handleToggleAnnotated = useCallback((id: number, checked: boolean) => {
    setUseAiAnnotated((prev) => ({ ...prev, [id]: checked }))
  }, [])

  // Fetch cameras with all related data (metadata only, no snapshots)
  const fetchCamerasWithData = useCallback(async () => {
    try {
      console.log("CameraGrid: Fetching camera metadata...")
      const response = await apiClient.get<Camera[]>('/api/v1/cameras/')
      console.log("CameraGrid: Received cameras:", response)
      
      if (!response || response.length === 0) {
        setCameras([])
        return
      }

      // Fetch analytics and alert data for all cameras (metadata only)
      const camerasWithData = await Promise.all(
        (response || []).map(async (camera) => {
          try {
            // Fetch decoder status
            const decoderStatus = await apiClient.get<any>(`/api/v1/cameras/${camera.id}/decode-status/`)
            
            // Fetch analytics for this camera
            const analytics = await apiClient.get<any[]>(`/api/v1/analytics/camera/${camera.id}/`)
            
            // Fetch alert engines for this camera
            const alertEngines = await apiClient.get<any[]>(`/api/v1/alert-engines/camera/${camera.id}/`)
            
            // Extract IP from RTSP URL
            const ipAddress = extractIpFromRtsp(camera.rtsp_url)
            
            // Determine status based on decoder status
            let status: "online" | "offline" | "warning" = "offline"
            if (decoderStatus?.is_active && decoderStatus?.streaming_status === "streaming") {
              status = "online"
            } else if (decoderStatus?.streaming_status === "starting") {
              status = "warning"
            }

            return {
              id: camera.id,
              name: camera.name,
              zone: camera.location || "Unknown Zone",
              ipAddress,
              status,
              analyticsEnabled: Array.isArray(analytics) && analytics.length > 0,
              alertEnabled: Array.isArray(alertEngines) && alertEngines.length > 0,
              aiDetectionEnabled: camera.person_detection_enabled ?? true, // Default to true
              video_info: camera.video_info,
              decoderStatus: {
                is_active: decoderStatus?.is_active || false,
                status: decoderStatus?.status || "unknown",
                streaming_status: decoderStatus?.streaming_status || "unknown"
              },
              snapshotUrl: undefined // Don't fetch snapshots in metadata updates
            }
          } catch (error) {
            console.error(`Error fetching data for camera ${camera.id}:`, error)
            // Return camera with default values if data fetching fails
            return {
              id: camera.id,
              name: camera.name,
              zone: camera.location || "Unknown Zone",
              ipAddress: extractIpFromRtsp(camera.rtsp_url),
              status: "offline" as const,
              analyticsEnabled: false,
              alertEnabled: false,
              aiDetectionEnabled: camera.person_detection_enabled ?? true, // Default to true
              video_info: camera.video_info,
              decoderStatus: {
                is_active: false,
                status: "unknown"
              },
              snapshotUrl: undefined
            }
          }
        })
      )

      // Preserve existing snapshot URLs when updating metadata
      setCameras(prevCameras => {
        return camerasWithData.map(newCamera => {
          const existingCamera = prevCameras.find(c => c.id === newCamera.id)
          return {
            ...newCamera,
            snapshotUrl: existingCamera?.snapshotUrl || newCamera.snapshotUrl
          }
        })
      })
      setError(null)
    } catch (err) {
      console.error("CameraGrid: Error fetching cameras:", err)
      setError(err instanceof Error ? err : new Error("Failed to fetch cameras"))
      setCameras([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch snapshot for a specific camera
  const fetchSnapshot = useCallback(async (cameraId: number, useAnnotated: boolean = false) => {
    try {
      const url = `/api/v1/cameras/${cameraId}/latest-frame/?use_ai_annotated=${useAnnotated}`
      const response = await apiClient.get<Blob>(url, { responseType: 'blob' })
      if (response instanceof Blob && response.size > 0) {
        return URL.createObjectURL(response)
      }
      return null
    } catch (error: any) {
      // 404 is expected when no frames are available - don't log as error
      if (error?.message?.includes('404') || error?.status === 404) {
        return null
      }
      console.error(`Error fetching snapshot for camera ${cameraId}:`, error)
      return null
    }
  }, [])

  // Ref to hold current cameras for async operations (avoids stale closure)
  const camerasRef = useRef<CameraDisplay[]>([])
  
  // Keep ref in sync with state
  useEffect(() => {
    camerasRef.current = cameras
  }, [cameras])

  // Initial data fetch
  useEffect(() => {
    fetchCamerasWithData()
  }, [fetchCamerasWithData])

  // Set up snapshot refresh interval
  useEffect(() => {
    let isMounted = true

    const runSnapshotUpdate = async () => {
      const currentCameras = camerasRef.current
      if (currentCameras.length === 0) return
      
      try {
        const updatedCameras = await Promise.all(
          currentCameras.map(async (camera) => {
            if (camera.decoderStatus?.streaming_status !== 'streaming') {
              return { ...camera, snapshotUrl: undefined }
            }
            const useAnnotated = useAiAnnotated[camera.id] || false
            const snapshotUrl = await fetchSnapshot(camera.id, useAnnotated)
            return { ...camera, snapshotUrl: snapshotUrl || camera.snapshotUrl }
          })
        )
        
        if (isMounted) {
          setCameras(updatedCameras)
        }
      } catch (error) {
        console.error('Error updating snapshots:', error)
      }
    }

    // Initial snapshot fetch after cameras are loaded
    const initialTimeout = setTimeout(runSnapshotUpdate, 1000)
    
    // Set up 5-second interval for snapshots
    const snapshotInterval = setInterval(runSnapshotUpdate, 5000)

    return () => {
      isMounted = false
      clearTimeout(initialTimeout)
      clearInterval(snapshotInterval)
    }
  }, [fetchSnapshot, useAiAnnotated])

  // Status metadata refresh — reduced to 30s because WS provides faster liveness signal
  useEffect(() => {
    const statusInterval = setInterval(fetchCamerasWithData, 30000)
    return () => clearInterval(statusInterval)
  }, [fetchCamerasWithData])

  if (isLoading) {
    return <div className="text-center p-4">Loading cameras...</div>
  }

  if (error) {
    return <div className="text-center p-4 text-red-500">Failed to load cameras</div>
  }

  if (!cameras || cameras.length === 0) {
    return <div className="text-center p-4">No cameras found.</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cameras.map((camera) => (
        <CameraTile
          key={camera.id}
          camera={camera}
          useAiAnnotated={useAiAnnotated[camera.id] || false}
          onToggleAnnotated={handleToggleAnnotated}
        />
      ))}
    </div>
  )
}
