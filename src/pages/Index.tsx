import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Icon from '@/components/ui/icon';
import { useToast } from '@/hooks/use-toast';

const API_URL = 'https://functions.poehali.dev/db16596d-b0a9-4f08-a8c0-e08458dd8760';

interface CameraService {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  throughput: number;
  latency: number;
  events: number;
  rtspUrl?: string;
  fps?: number;
  bufferSize?: number;
  currentFrame?: string;
}

interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  status: 'success' | 'warning' | 'error';
  icon: string;
}

const Index = () => {
  const { toast } = useToast();
  const [cameras, setCameras] = useState<CameraService[]>([
    { id: 'cam-001', name: 'Camera Service 01', status: 'inactive', throughput: 0, latency: 0, events: 0, rtspUrl: 'rtsp://example.com/cam1', fps: 25 },
    { id: 'cam-002', name: 'Camera Service 02', status: 'inactive', throughput: 0, latency: 0, events: 0, rtspUrl: 'rtsp://example.com/cam2', fps: 25 },
    { id: 'cam-003', name: 'Camera Service 03', status: 'inactive', throughput: 0, latency: 0, events: 0, rtspUrl: 'rtsp://example.com/cam3', fps: 25 },
    { id: 'cam-004', name: 'Camera Service 04', status: 'inactive', throughput: 0, latency: 0, events: 0, rtspUrl: 'rtsp://example.com/cam4', fps: 25 },
    { id: 'cam-005', name: 'Camera Service 05', status: 'inactive', throughput: 0, latency: 0, events: 0, rtspUrl: 'rtsp://example.com/cam5', fps: 25 },
    { id: 'cam-006', name: 'Camera Service 06', status: 'inactive', throughput: 0, latency: 0, events: 0, rtspUrl: 'rtsp://example.com/cam6', fps: 25 },
  ]);

  const [editingCamera, setEditingCamera] = useState<CameraService | null>(null);
  const [editForm, setEditForm] = useState({ name: '', rtspUrl: '', fps: 25 });
  const [dialogOpen, setDialogOpen] = useState(false);

  const [systemMetrics, setSystemMetrics] = useState<SystemMetric[]>([
    { name: 'Active Streams', value: 0, unit: 'cameras', status: 'success', icon: 'Video' },
    { name: 'Total Frames', value: 0, unit: 'frames', status: 'success', icon: 'Activity' },
    { name: 'Avg Buffer', value: 0, unit: 'frames', status: 'success', icon: 'Database' },
    { name: 'System Status', value: 100, unit: '% uptime', status: 'success', icon: 'Server' },
  ]);

  const [kafkaEvents, setKafkaEvents] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  const fetchStreamsList = async () => {
    try {
      const response = await fetch(`${API_URL}?action=list`);
      const data = await response.json();
      
      setCameras(prev => prev.map(cam => {
        const stream = data.streams.find((s: any) => s.camera_id === cam.id);
        if (stream) {
          return {
            ...cam,
            status: 'active' as const,
            bufferSize: stream.buffer_frames,
            fps: stream.fps,
            throughput: stream.buffer_frames || 0,
          };
        }
        return { ...cam, status: 'inactive' as const, bufferSize: 0 };
      }));

      setSystemMetrics(prev => {
        const newMetrics = [...prev];
        newMetrics[0].value = data.streams.length;
        const totalFrames = data.streams.reduce((acc: number, s: any) => acc + (s.buffer_frames || 0), 0);
        newMetrics[1].value = totalFrames;
        newMetrics[2].value = data.streams.length > 0 ? Math.round(totalFrames / data.streams.length) : 0;
        return newMetrics;
      });
    } catch (error) {
      console.error('Failed to fetch streams list:', error);
    }
  };

  const startStream = async (cameraId: string, rtspUrl: string, fps: number) => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_id: cameraId,
          rtsp_url: rtspUrl,
          fps: fps,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Stream started',
          description: `Camera ${cameraId} is now streaming`,
        });
        await fetchStreamsList();
      } else {
        toast({
          title: 'Failed to start stream',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Connection error',
        description: 'Failed to connect to streaming service',
        variant: 'destructive',
      });
    }
  };

  const stopStream = async (cameraId: string) => {
    try {
      const response = await fetch(`${API_URL}?camera_id=${cameraId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Stream stopped',
          description: `Camera ${cameraId} stream stopped`,
        });
        setCameras(prev => prev.map(cam => 
          cam.id === cameraId 
            ? { ...cam, status: 'inactive', throughput: 0, bufferSize: 0, currentFrame: undefined }
            : cam
        ));
        await fetchStreamsList();
      } else {
        toast({
          title: 'Failed to stop stream',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Connection error',
        description: 'Failed to connect to streaming service',
        variant: 'destructive',
      });
    }
  };

  const fetchFrame = async (cameraId: string) => {
    try {
      const response = await fetch(`${API_URL}?camera_id=${cameraId}&action=stream`);
      const data = await response.json();

      if (response.ok && data.frame_data) {
        setCameras(prev => prev.map(cam => 
          cam.id === cameraId 
            ? { ...cam, currentFrame: data.frame_data, events: data.metadata?.frame_number || 0 }
            : cam
        ));
      }
    } catch (error) {
      console.error('Failed to fetch frame:', error);
    }
  };

  const openEditDialog = (camera: CameraService) => {
    setEditingCamera(camera);
    setEditForm({
      name: camera.name,
      rtspUrl: camera.rtspUrl || '',
      fps: camera.fps || 25,
    });
    setDialogOpen(true);
  };

  const saveSettings = () => {
    if (editingCamera) {
      setCameras(prev => prev.map(cam => 
        cam.id === editingCamera.id
          ? { ...cam, name: editForm.name, rtspUrl: editForm.rtspUrl, fps: editForm.fps }
          : cam
      ));
      toast({
        title: 'Settings saved',
        description: `Camera ${editingCamera.id} settings updated`,
      });
      setDialogOpen(false);
    }
  };

  useEffect(() => {
    fetchStreamsList();
    const listInterval = setInterval(fetchStreamsList, 5000);
    return () => clearInterval(listInterval);
  }, []);

  useEffect(() => {
    const frameInterval = setInterval(() => {
      cameras.forEach(cam => {
        if (cam.status === 'active') {
          fetchFrame(cam.id);
        }
      });
    }, 1000);

    return () => clearInterval(frameInterval);
  }, [cameras]);

  useEffect(() => {
    const chartInterval = setInterval(() => {
      const activeCount = cameras.filter(c => c.status === 'active').length;
      setKafkaEvents(prev => [...prev.slice(1), activeCount * 25]);
    }, 2000);

    return () => clearInterval(chartInterval);
  }, [cameras]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'inactive': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getMetricStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const activeCameras = cameras.filter(c => c.status === 'active').length;
  const totalCameras = cameras.length;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Icon name="Video" className="text-primary" size={32} />
              RTSP Stream Monitor
            </h1>
            <p className="text-muted-foreground mt-2">Real-time Video Streaming Platform</p>
          </div>
          <Badge variant="outline" className="text-green-400 border-green-400 px-4 py-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse-glow mr-2"></span>
            System Online
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {systemMetrics.map((metric) => (
            <Card key={metric.name} className="p-6 bg-card border-border animate-fade-in hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <p className="text-sm text-muted-foreground">{metric.name}</p>
                  <p className={`text-3xl font-bold ${getMetricStatusColor(metric.status)}`}>
                    {metric.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{metric.unit}</p>
                </div>
                <Icon name={metric.icon} className={getMetricStatusColor(metric.status)} size={24} />
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Icon name="BarChart3" className="text-primary" size={24} />
              Frame Rate Monitor
            </h2>
            <Badge variant="outline" className="text-primary border-primary">Real-time</Badge>
          </div>
          <div className="flex items-end gap-2 h-48">
            {kafkaEvents.map((value, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                <div 
                  className="w-full bg-primary/20 rounded-t transition-all duration-500"
                  style={{ height: `${Math.min((value / 150) * 100, 100)}%` }}
                >
                  <div className="w-full h-full bg-gradient-to-t from-primary to-primary/40 rounded-t"></div>
                </div>
                <span className="text-xs text-muted-foreground">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Icon name="Layers" className="text-primary" size={24} />
              Camera Streams
            </h2>
            <div className="text-sm text-muted-foreground">
              {activeCameras} / {totalCameras} active
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameras.map((camera) => (
              <Card key={camera.id} className="p-5 bg-card border-border hover:border-primary/50 transition-all animate-fade-in">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${getStatusColor(camera.status)} ${camera.status === 'active' ? 'animate-pulse-glow' : ''}`}></span>
                        <h3 className="font-semibold">{camera.name}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground">{camera.id}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => openEditDialog(camera)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      >
                        <Icon name="Settings" size={16} />
                      </Button>
                      <Badge 
                        variant={camera.status === 'active' ? 'default' : 'secondary'}
                        className={camera.status === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' : ''}
                      >
                        {camera.status}
                      </Badge>
                    </div>
                  </div>

                  {camera.status === 'active' && (
                    <div className="w-full aspect-video bg-black/80 rounded-lg flex flex-col items-center justify-center gap-4 p-4">
                      <Icon name="Wifi" className="text-green-400" size={48} />
                      <div className="text-center">
                        <p className="text-sm text-green-400 font-semibold">Streaming Active</p>
                        <p className="text-xs text-muted-foreground mt-1">{camera.rtspUrl}</p>
                        <p className="text-xs text-muted-foreground mt-2">RTSP streams require external player or browser plugin</p>
                      </div>
                    </div>
                  )}

                  {!camera.currentFrame && camera.status === 'active' && (
                    <div className="w-full aspect-video bg-black/50 rounded-lg flex items-center justify-center">
                      <Icon name="Loader2" className="text-primary animate-spin" size={32} />
                    </div>
                  )}

                  {camera.status === 'inactive' && (
                    <div className="w-full aspect-video bg-black/20 rounded-lg flex items-center justify-center">
                      <Icon name="VideoOff" className="text-muted-foreground" size={32} />
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">FPS</p>
                      <p className="text-lg font-bold text-primary">{camera.fps || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Buffer</p>
                      <p className="text-lg font-bold text-yellow-400">{camera.bufferSize || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Frame #</p>
                      <p className="text-lg font-bold text-foreground">{camera.events || 0}</p>
                    </div>
                  </div>

                  {camera.status === 'active' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Buffer Usage</span>
                        <span>{camera.bufferSize || 0}/1500</span>
                      </div>
                      <Progress value={((camera.bufferSize || 0) / 1500) * 100} className="h-2" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {camera.status === 'inactive' && (
                      <Button
                        onClick={() => startStream(camera.id, camera.rtspUrl!, camera.fps!)}
                        className="flex-1"
                        size="sm"
                      >
                        <Icon name="Play" size={16} className="mr-2" />
                        Start Stream
                      </Button>
                    )}
                    {camera.status === 'active' && (
                      <Button
                        onClick={() => stopStream(camera.id)}
                        variant="destructive"
                        className="flex-1"
                        size="sm"
                      >
                        <Icon name="Square" size={16} className="mr-2" />
                        Stop Stream
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Camera Settings</DialogTitle>
            <DialogDescription>
              Configure camera name, RTSP URL and frame rate
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="camera-name">Camera Name</Label>
              <Input
                id="camera-name"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Camera Service 01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rtsp-url">RTSP URL</Label>
              <Input
                id="rtsp-url"
                value={editForm.rtspUrl}
                onChange={(e) => setEditForm(prev => ({ ...prev, rtspUrl: e.target.value }))}
                placeholder="rtsp://example.com/stream"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fps">Frame Rate (FPS)</Label>
              <Input
                id="fps"
                type="number"
                min={1}
                max={60}
                value={editForm.fps}
                onChange={(e) => setEditForm(prev => ({ ...prev, fps: parseInt(e.target.value) || 25 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSettings}>
              <Icon name="Save" size={16} className="mr-2" />
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;