import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import Icon from '@/components/ui/icon';

interface RTSPPlayerProps {
  cameraId: string;
  apiUrl: string;
  fps?: number;
  bufferSize?: number;
  isActive: boolean;
}

const RTSPPlayer = ({ cameraId, apiUrl, fps = 25, bufferSize = 0, isActive }: RTSPPlayerProps) => {
  const [frameData, setFrameData] = useState<string | null>(null);
  const [frameNumber, setFrameNumber] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setFrameData(null);
      setError(null);
      return;
    }

    const fetchFrame = async () => {
      try {
        const response = await fetch(`${apiUrl}?camera_id=${cameraId}&action=stream`);
        
        if (response.status === 204) {
          setError('Waiting for frames...');
          return;
        }

        if (!response.ok) {
          setError(`HTTP ${response.status}`);
          return;
        }

        const data = await response.json();
        
        if (data.frame_data) {
          setFrameData(data.frame_data);
          setFrameNumber(data.metadata?.frame_number || 0);
          setLastUpdate(new Date());
          setError(null);
          
          if (canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#0a0a0a';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
              gradient.addColorStop(0, '#1e293b');
              gradient.addColorStop(0.5, '#334155');
              gradient.addColorStop(1, '#1e293b');
              ctx.fillStyle = gradient;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              ctx.fillStyle = '#22c55e';
              ctx.font = 'bold 24px monospace';
              ctx.textAlign = 'center';
              ctx.fillText('FRAME DATA RECEIVED', canvas.width / 2, canvas.height / 2 - 40);
              
              ctx.fillStyle = '#94a3b8';
              ctx.font = '16px monospace';
              ctx.fillText(`Frame #${frameNumber}`, canvas.width / 2, canvas.height / 2);
              
              const decoded = atob(data.frame_data);
              ctx.fillStyle = '#60a5fa';
              ctx.font = '14px monospace';
              ctx.fillText(decoded.substring(0, 50), canvas.width / 2, canvas.height / 2 + 30);
              
              const size = Math.round(data.frame_data.length * 0.75 / 1024);
              ctx.fillStyle = '#fbbf24';
              ctx.fillText(`Size: ${size} KB`, canvas.width / 2, canvas.height / 2 + 60);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch frame');
      }
    };

    fetchFrame();
    intervalRef.current = setInterval(fetchFrame, Math.floor(1000 / fps));

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [cameraId, apiUrl, fps, isActive]);

  if (!isActive) {
    return (
      <div className="w-full aspect-video bg-black/20 rounded-lg flex items-center justify-center">
        <Icon name="VideoOff" className="text-muted-foreground" size={48} />
      </div>
    );
  }

  return (
    <div className="w-full aspect-video bg-black rounded-lg overflow-hidden relative">
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="w-full h-full object-contain"
      />
      
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <Badge className="bg-green-500/90 text-white border-0 backdrop-blur-sm">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse mr-2"></span>
          LIVE
        </Badge>
        {error && (
          <Badge variant="destructive" className="backdrop-blur-sm">
            {error}
          </Badge>
        )}
      </div>
      
      <div className="absolute bottom-2 left-2 z-10 flex gap-2">
        <Badge variant="secondary" className="bg-black/70 backdrop-blur-sm text-xs">
          Frame #{frameNumber}
        </Badge>
        <Badge variant="secondary" className="bg-black/70 backdrop-blur-sm text-xs">
          {fps} FPS
        </Badge>
        <Badge variant="secondary" className="bg-black/70 backdrop-blur-sm text-xs">
          Buffer: {bufferSize}
        </Badge>
      </div>
      
      {lastUpdate && (
        <div className="absolute bottom-2 right-2 z-10">
          <Badge variant="secondary" className="bg-black/70 backdrop-blur-sm text-xs">
            {lastUpdate.toLocaleTimeString()}
          </Badge>
        </div>
      )}
    </div>
  );
};

export default RTSPPlayer;
