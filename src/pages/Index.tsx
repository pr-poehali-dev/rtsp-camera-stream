import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import Icon from '@/components/ui/icon';

interface CameraService {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  throughput: number;
  latency: number;
  events: number;
}

interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  status: 'success' | 'warning' | 'error';
  icon: string;
}

const Index = () => {
  const [cameras, setCameras] = useState<CameraService[]>([
    { id: 'cam-001', name: 'Camera Service 01', status: 'active', throughput: 1250, latency: 12, events: 45230 },
    { id: 'cam-002', name: 'Camera Service 02', status: 'active', throughput: 980, latency: 18, events: 38442 },
    { id: 'cam-003', name: 'Camera Service 03', status: 'error', throughput: 0, latency: 0, events: 12053 },
    { id: 'cam-004', name: 'Camera Service 04', status: 'active', throughput: 1430, latency: 9, events: 52341 },
    { id: 'cam-005', name: 'Camera Service 05', status: 'inactive', throughput: 450, latency: 35, events: 18920 },
    { id: 'cam-006', name: 'Camera Service 06', status: 'active', throughput: 1120, latency: 14, events: 41235 },
  ]);

  const [systemMetrics] = useState<SystemMetric[]>([
    { name: 'Total Throughput', value: 5230, unit: 'msg/s', status: 'success', icon: 'Activity' },
    { name: 'Avg Latency', value: 15, unit: 'ms', status: 'success', icon: 'Clock' },
    { name: 'Kafka Lag', value: 234, unit: 'messages', status: 'warning', icon: 'Database' },
    { name: 'API Gateway', value: 99.8, unit: '% uptime', status: 'success', icon: 'Server' },
  ]);

  const [kafkaEvents, setKafkaEvents] = useState<number[]>([120, 145, 180, 165, 190, 220, 195, 210, 240, 230]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCameras(prev => prev.map(cam => ({
        ...cam,
        throughput: cam.status === 'active' ? Math.floor(Math.random() * 500) + 900 : cam.throughput,
        latency: cam.status === 'active' ? Math.floor(Math.random() * 15) + 8 : cam.latency,
        events: cam.status === 'active' ? cam.events + Math.floor(Math.random() * 50) : cam.events,
      })));

      setKafkaEvents(prev => {
        const newEvents = [...prev.slice(1), Math.floor(Math.random() * 100) + 180];
        return newEvents;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

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
              Stream Monitoring Platform
            </h1>
            <p className="text-muted-foreground mt-2">Kubernetes Cluster • Kafka • API Gateway</p>
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
              Kafka Event Stream
            </h2>
            <Badge variant="outline" className="text-primary border-primary">Real-time</Badge>
          </div>
          <div className="flex items-end gap-2 h-48">
            {kafkaEvents.map((value, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                <div 
                  className="w-full bg-primary/20 rounded-t transition-all duration-500"
                  style={{ height: `${(value / 300) * 100}%` }}
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
              Camera Services
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
                    <Badge 
                      variant={camera.status === 'active' ? 'default' : 'secondary'}
                      className={camera.status === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' : ''}
                    >
                      {camera.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Throughput</p>
                      <p className="text-lg font-bold text-primary">{camera.throughput}</p>
                      <p className="text-xs text-muted-foreground">msg/s</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Latency</p>
                      <p className="text-lg font-bold text-yellow-400">{camera.latency}</p>
                      <p className="text-xs text-muted-foreground">ms</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Events</p>
                      <p className="text-lg font-bold text-foreground">{camera.events.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">total</p>
                    </div>
                  </div>

                  {camera.status === 'active' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Health</span>
                        <span className="text-green-400">98%</span>
                      </div>
                      <Progress value={98} className="h-1" />
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 bg-card border-border">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="CloudCog" className="text-primary" size={20} />
              <h3 className="font-semibold">Kubernetes</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Pods Running</span>
                <span className="font-bold text-green-400">24/24</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">CPU Usage</span>
                <span className="font-bold">42%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Memory</span>
                <span className="font-bold">8.2 / 16 GB</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 bg-card border-border">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="Workflow" className="text-primary" size={20} />
              <h3 className="font-semibold">Nginx Load Balancer</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Requests/s</span>
                <span className="font-bold text-primary">1,834</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Connections</span>
                <span className="font-bold">234</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Uptime</span>
                <span className="font-bold text-green-400">99.9%</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 bg-card border-border">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="Shield" className="text-primary" size={20} />
              <h3 className="font-semibold">Authentication</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Auth Method</span>
                <Badge variant="outline" className="text-xs">Basic Auth</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Active Sessions</span>
                <span className="font-bold">12</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Failed Attempts</span>
                <span className="font-bold text-red-400">3</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
