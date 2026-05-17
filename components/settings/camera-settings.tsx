"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Camera, Edit, Plus, Trash, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { apiClient } from "@/lib/api"

interface Camera {
  id: number
  name: string
  rtsp_url: string
  location: string | null
  is_active: boolean
  streaming_status: string // "stopped", "starting", "streaming", "stopping", "error"
  video_info: any
  created_at: string
  updated_at: string
  stream_status?: string // legacy field
  frame_count?: number
  person_detection_enabled?: boolean // AI person detection enabled
}

interface VideoValidation {
  status: string
  video_info: any
  errors: string[]
}

interface CreateCameraResponse {
  camera: Camera
  video_validation: VideoValidation
}

interface ActivateCameraResponse {
  camera_id: number
  rtsp_url: string
  activation: {
    status: string
    decode_status: any
    errors: string[]
  }
}

interface DecodeStatusResponse {
  camera_id: string
  status: string
  streaming_status: string
  is_active: boolean
  frame_count: number
  last_error?: string
}

export default function CameraSettings() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [editCamera, setEditCamera] = useState<Camera | null>(null)
  const [newCamera, setNewCamera] = useState<Partial<Camera>>({
    name: "",
    rtsp_url: "",
    location: "",
    is_active: true, // Default to active so video pipeline starts automatically
  })
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isFramePreviewOpen, setIsFramePreviewOpen] = useState(false)
  const [selectedCameraForPreview, setSelectedCameraForPreview] = useState<Camera | null>(null)
  const [framePreviewData, setFramePreviewData] = useState<{imageUrl: string, frameCount: number} | null>(null)
  const [framePreviewLoading, setFramePreviewLoading] = useState(false)
  const { toast } = useToast()

  // Fetch cameras and their decode status once when entering the page
  const fetchCameras = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<Camera[]>('/api/v1/cameras/');
      const camerasWithStatus = await Promise.all(
        (response || []).map(async (camera) => {
          try {
            const status = await apiClient.get<DecodeStatusResponse>(`/api/v1/cameras/${camera.id}/decode-status/`);
            return {
              ...camera,
              streaming_status: status.streaming_status,
              is_active: status.is_active,
              frame_count: status.frame_count,
            };
          } catch (err) {
            // If status fetch fails, just return the camera as-is
            return camera;
          }
        })
      );
      setCameras(camerasWithStatus);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch cameras",
        variant: "destructive",
      });
      setCameras([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  // Poll status for a camera after activation until it stabilizes
  const startStatusPolling = (cameraId: number) => {
    let pollCount = 0;
    const maxPolls = 10; // Poll up to 10 times (30 seconds total)
    
    const pollStatus = async () => {
      try {
        const response = await apiClient.get<DecodeStatusResponse>(`/api/v1/cameras/${cameraId}/decode-status/`);
        if (response) {
          setCameras(prev => prev.map(c => 
            c.id === cameraId 
              ? { 
                  ...c, 
                  streaming_status: response.streaming_status,
                  is_active: response.is_active,
                  frame_count: response.frame_count
                }
              : c
          ));
          
          // Stop polling if we have a stable status
          if (response.streaming_status === 'streaming' || 
              response.streaming_status === 'stopped' || 
              response.streaming_status === 'error') {
            return; // Don't schedule another poll
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
      
      // Continue polling if not at max and status is still transitioning
      pollCount++;
      if (pollCount < maxPolls) {
        setTimeout(pollStatus, 3000); // Poll every 3 seconds
      }
    };
    
    // Start polling after a short delay
    setTimeout(pollStatus, 2000);
  };

  const handleAddCamera = async () => {
    if (newCamera.name && newCamera.rtsp_url) {
      try {
        const response = await apiClient.post<CreateCameraResponse>('/api/v1/cameras/', newCamera)
        
        if (response && response.camera) {
          toast({
            title: "Success",
            description: "Camera added successfully",
          })
          
          if (response.video_validation) {
            const validation = response.video_validation
            if (validation.status === "validated") {
              toast({
                title: "Video Stream Validated",
                description: `Video stream is accessible. Camera is ready to be activated.`,
              })
            } else if (validation.errors && validation.errors.length > 0) {
              toast({
                title: "Video Stream Issues",
                description: `Camera added but video stream has issues: ${validation.errors.join(", ")}`,
                variant: "destructive",
              })
            }
          }
        }
        
        setNewCamera({
          name: "",
          rtsp_url: "",
          location: "",
          is_active: true, // Reset to default
        })
        setIsAddDialogOpen(false)
        fetchCameras()
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to add camera",
          variant: "destructive",
        })
      }
    }
  }

  const handleUpdateCamera = async () => {
    if (editCamera) {
      try {
        // Ensure all fields are explicitly included in the update
        const updatePayload = {
          name: editCamera.name,
          rtsp_url: editCamera.rtsp_url,
          location: editCamera.location,
          is_active: editCamera.is_active, // Explicitly include is_active
          person_detection_enabled: editCamera.person_detection_enabled,
        }
        console.log('Updating camera with payload:', updatePayload)
        await apiClient.put(`/api/v1/cameras/${editCamera.id}`, updatePayload)
        toast({
          title: "Success",
          description: "Camera updated successfully",
        })
        setEditCamera(null)
        setIsEditDialogOpen(false)
        fetchCameras()
      } catch (error) {
        console.error('Error updating camera:', error)
        toast({
          title: "Error",
          description: "Failed to update camera",
          variant: "destructive",
        })
      }
    }
  }

  const handleDeleteCamera = async (id: number) => {
    try {
      await apiClient.delete(`/api/v1/cameras/${id}`)
      toast({
        title: "Success",
        description: "Camera deleted successfully",
      })
      fetchCameras()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete camera",
        variant: "destructive",
      })
    }
  }

  const handleToggleStreaming = async (camera: Camera) => {
    try {
      // streaming_status is ground truth — is_active only means "registered in DB"
      const isCurrentlyActive = camera.streaming_status === 'streaming'
      
      if (isCurrentlyActive) {
        // Stop streaming
        await apiClient.post(`/api/v1/cameras/${camera.id}/deactivate/`)
        
        // Update local state immediately
        setCameras(prev => prev.map(c => 
          c.id === camera.id 
            ? { ...c, streaming_status: 'stopping', is_active: false }
            : c
        ))
        
        toast({
          title: "Stopping Stream",
          description: "Camera stream is being stopped...",
        })
      } else {
        // Start streaming - always show "Starting..." initially
        setCameras(prev => prev.map(c => 
          c.id === camera.id 
            ? { ...c, streaming_status: 'starting', is_active: false }
            : c
        ))
        
        const response = await apiClient.post<ActivateCameraResponse>(`/api/v1/cameras/${camera.id}/activate/`)
        
        if (response && response.activation) {
          const activation = response.activation
          
          // Only update status if it's a clear success or if there are specific errors
          if (activation.status === 'activated' || activation.status === 'already_running') {
            // Success - keep "starting" status and let polling update it
            startStatusPolling(camera.id)
            
            toast({
              title: "Starting Stream",
              description: "Camera stream is being started...",
            })
          } else if (activation.errors && activation.errors.length > 0) {
            // Clear failure - show error
            setCameras(prev => prev.map(c => 
              c.id === camera.id 
                ? { ...c, streaming_status: 'error', is_active: false }
                : c
            ))
            
            toast({
              title: "Activation Failed",
              description: `Failed to start stream: ${activation.errors.join(", ")}`,
              variant: "destructive",
            })
          } else {
            // Ambiguous status - keep "starting" and let polling determine the final status
            startStatusPolling(camera.id)
            
            toast({
              title: "Starting Stream",
              description: "Camera stream is being started...",
            })
          }
        } else {
          // No response - keep "starting" status and let polling update it
          startStatusPolling(camera.id)
          
          toast({
            title: "Starting Stream",
            description: "Camera stream is being started...",
          })
        }
      }
    } catch (error) {
      console.error('Error toggling streaming:', error)
      toast({
        title: "Error",
        description: "Failed to toggle streaming",
        variant: "destructive",
      })
      
      // Reset status on error
      setCameras(prev => prev.map(c => 
        c.id === camera.id 
          ? { ...c, streaming_status: 'error', is_active: false }
          : c
      ))
    }
  }

  const handleEditClick = (camera: Camera) => {
    setEditCamera(camera)
    setIsEditDialogOpen(true)
  }

  const handleSnapshotPreview = async (camera: Camera) => {
    setSelectedCameraForPreview(camera)
    setIsFramePreviewOpen(true)
    setFramePreviewLoading(true)
    setFramePreviewData(null)
    
    try {
      // Get the latest frame using the snapshot endpoint
      const frameResponse = await apiClient.get<Blob>(`/api/v1/cameras/${camera.id}/latest-frame/`, {
        responseType: 'blob'
      })
      
      if (frameResponse) {
        const imageUrl = URL.createObjectURL(frameResponse)
        
        // Get decode status for frame count
        const statusResponse = await apiClient.get<DecodeStatusResponse>(`/api/v1/cameras/${camera.id}/decode-status/`)
        const frameCount = statusResponse?.frame_count || 0
        
        setFramePreviewData({ imageUrl, frameCount })
      } else {
        toast({
          title: "Error",
          description: "Failed to load snapshot preview",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Failed to load snapshot:', error)
      toast({
        title: "Error",
        description: "Failed to load snapshot preview",
        variant: "destructive",
      })
    } finally {
      setFramePreviewLoading(false)
    }
  }

  const handleRefreshStatus = async (camera: Camera) => {
    try {
      const response = await apiClient.get<DecodeStatusResponse>(`/api/v1/cameras/${camera.id}/decode-status/`)
      if (response) {
        setCameras(prev => prev.map(c => 
          c.id === camera.id 
            ? { 
                ...c, 
                streaming_status: response.streaming_status,
                is_active: response.is_active,
                frame_count: response.frame_count
              }
            : c
        ))
        
        toast({
          title: "Status Updated",
          description: `Camera status refreshed successfully. Current status: ${response.streaming_status}`,
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh status",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return <div className="flex justify-center p-4">Loading cameras...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Cameras ({cameras?.length || 0})</h3>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Camera
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Camera</DialogTitle>
              <DialogDescription>Enter the details for the new camera.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <Input
                  id="name"
                  value={newCamera.name}
                  onChange={(e) => setNewCamera({ ...newCamera, name: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="rtsp_url" className="text-right">
                  RTSP URL
                </Label>
                <Input
                  id="rtsp_url"
                  value={newCamera.rtsp_url}
                  onChange={(e) => setNewCamera({ ...newCamera, rtsp_url: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="location" className="text-right">
                  Location
                </Label>
                <Input
                  id="location"
                  value={newCamera.location || ""}
                  onChange={(e) => setNewCamera({ ...newCamera, location: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="is_active" className="text-right">
                  Activate
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Switch
                    id="is_active"
                    checked={newCamera.is_active ?? true}
                    onCheckedChange={(checked) => setNewCamera({ ...newCamera, is_active: checked })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {newCamera.is_active ? "Start streaming immediately" : "Create without starting"}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddCamera}>Add Camera</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>RTSP URL</TableHead>
              <TableHead>Streaming Controls & Status</TableHead>
              <TableHead>Video Info</TableHead>
              <TableHead>AI Detection</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cameras?.map((camera) => (
              <TableRow key={camera.id}>
                <TableCell>{camera.name}</TableCell>
                <TableCell>{camera.location || "Not specified"}</TableCell>
                <TableCell className="max-w-[200px] truncate">{camera.rtsp_url}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={camera.streaming_status === 'streaming' ? 'destructive' : 'default'}
                          onClick={() => handleToggleStreaming(camera)}
                          disabled={
                            camera.streaming_status === 'starting' || 
                            camera.streaming_status === 'stopping'
                          }
                        >
                          {camera.streaming_status === 'streaming' ? 'Stop' : 'Start'} Streaming
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRefreshStatus(camera)}
                        >
                          <RefreshCw className={`h-3 w-3 mr-1`} />
                          Refresh
                        </Button>
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Status: </span>
                        <span className={
                          camera.streaming_status === 'streaming' ? 'text-green-600' :
                          camera.streaming_status === 'starting' ? 'text-yellow-600' :
                          camera.streaming_status === 'stopping' ? 'text-yellow-600' :
                          camera.streaming_status === 'error' ? 'text-red-600' :
                          'text-gray-600'
                        }>
                          {camera.streaming_status === 'streaming' && 'Streaming'}
                          {camera.streaming_status === 'starting' && 'Starting...'}
                          {camera.streaming_status === 'stopping' && 'Stopping...'}
                          {camera.streaming_status === 'stopped' && 'Stopped'}
                          {camera.streaming_status === 'error' && 'Error'}
                          {!camera.streaming_status && (camera.is_active ? 'Active' : 'Stopped')}
                        </span>
                      </div>
                      {camera.frame_count !== undefined && camera.frame_count > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {camera.frame_count} frames decoded
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {camera.video_info ? (
                    <div className="text-sm space-y-1">
                      <div>Codec: {camera.video_info.info?.codec || "Unknown"}</div>
                      <div>Resolution: {camera.video_info.info?.width || "?"}x{camera.video_info.info?.height || "?"}</div>
                      <div>FPS: {camera.video_info.info?.fps || "?"}</div>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">No video info</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={camera.person_detection_enabled !== false ? "default" : "secondary"}
                      className={
                        camera.person_detection_enabled !== false 
                          ? "bg-green-500/10 text-green-500 border-green-500/20" 
                          : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                      }
                    >
                      {camera.person_detection_enabled !== false ? "Enabled" : "Disabled"}
                    </Badge>
                    <Switch
                      checked={camera.person_detection_enabled !== false}
                      onCheckedChange={async (checked) => {
                        try {
                          await apiClient.put(`/api/v1/cameras/${camera.id}`, {
                            person_detection_enabled: checked
                          })
                          toast({
                            title: "Success",
                            description: `AI Detection ${checked ? 'enabled' : 'disabled'}`,
                          })
                          fetchCameras()
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to update AI detection status",
                            variant: "destructive",
                          })
                        }
                      }}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSnapshotPreview(camera)}
                      title="View Latest Snapshot"
                      disabled={!camera.frame_count || camera.frame_count === 0}
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(camera)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Camera</DialogTitle>
                          <DialogDescription>Update the camera details.</DialogDescription>
                        </DialogHeader>
                        {editCamera && (
                          <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="edit-name" className="text-right">
                                Name
                              </Label>
                              <Input
                                id="edit-name"
                                value={editCamera.name}
                                onChange={(e) => setEditCamera({ ...editCamera, name: e.target.value })}
                                className="col-span-3"
                              />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="edit-rtsp" className="text-right">
                                RTSP URL
                              </Label>
                              <Input
                                id="edit-rtsp"
                                value={editCamera.rtsp_url}
                                onChange={(e) => setEditCamera({ ...editCamera, rtsp_url: e.target.value })}
                                className="col-span-3"
                              />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="edit-location" className="text-right">
                                Location
                              </Label>
                              <Input
                                id="edit-location"
                                value={editCamera.location || ""}
                                onChange={(e) => setEditCamera({ ...editCamera, location: e.target.value })}
                                className="col-span-3"
                              />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="edit-active" className="text-right">
                                Active
                              </Label>
                              <Switch
                                id="edit-active"
                                checked={editCamera.is_active}
                                onCheckedChange={(checked) => setEditCamera({ ...editCamera, is_active: checked })}
                                className="col-span-3"
                              />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="edit-ai-detection" className="text-right">
                                AI Detection
                              </Label>
                              <Switch
                                id="edit-ai-detection"
                                checked={editCamera.person_detection_enabled !== false}
                                onCheckedChange={(checked) => setEditCamera({ ...editCamera, person_detection_enabled: checked })}
                                className="col-span-3"
                              />
                            </div>
                          </div>
                        )}
                        <DialogFooter>
                          <Button onClick={handleUpdateCamera}>Save Changes</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteCamera(camera.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Frame Preview Dialog */}
      <Dialog open={isFramePreviewOpen} onOpenChange={setIsFramePreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Latest Snapshot - {selectedCameraForPreview?.name}
            </DialogTitle>
            <DialogDescription>
              View the most recently decoded snapshot from the camera stream.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-4">
            {framePreviewLoading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin" />
                <span className="ml-2">Loading snapshot...</span>
              </div>
            ) : framePreviewData ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Frame Count: {framePreviewData.frameCount}
                  </p>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <img 
                    src={framePreviewData.imageUrl} 
                    alt="Latest snapshot" 
                    className="max-w-full h-auto"
                    style={{ maxHeight: '400px' }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64">
                <span className="text-muted-foreground">No snapshot available</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              onClick={() => {
                if (framePreviewData?.imageUrl) {
                  URL.revokeObjectURL(framePreviewData.imageUrl)
                }
                setIsFramePreviewOpen(false)
                setFramePreviewData(null)
                setSelectedCameraForPreview(null)
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
